/**
 * SQLite-backed scan persistence.
 *
 * One file at backend/data/scans.sqlite — portable, durable, easy to back
 * up (copy the file). better-sqlite3 is synchronous which is fine for our
 * single-process Node server and makes the API straightforward.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const DATA_DIR = path.resolve('./data');
const DB_FILE = path.join(DATA_DIR, 'scans.sqlite');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id              TEXT PRIMARY KEY,
    tracking_number TEXT NOT NULL,
    operator        TEXT NOT NULL,
    found           INTEGER NOT NULL,
    status          TEXT,
    source_tab      TEXT,
    customer        TEXT,
    product         TEXT,
    duplicate       INTEGER NOT NULL,
    timestamp       TEXT NOT NULL,
    scan_date       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scans_date           ON scans(scan_date);
  CREATE INDEX IF NOT EXISTS idx_scans_operator_date  ON scans(operator, scan_date);
  CREATE INDEX IF NOT EXISTS idx_scans_tracking       ON scans(tracking_number);

  CREATE TABLE IF NOT EXISTS products (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL UNIQUE,
    available_supplies INTEGER NOT NULL DEFAULT 0,
    shipped_count      INTEGER NOT NULL DEFAULT 0,
    status             TEXT NOT NULL DEFAULT 'ACTIVE',
    price_per_qty      REAL NOT NULL DEFAULT 0,
    reorder_point      INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_products_name   ON products(name);

  CREATE TABLE IF NOT EXISTS pickup_transactions (
    id           TEXT PRIMARY KEY,
    product_id   TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity     INTEGER NOT NULL,
    operator     TEXT NOT NULL,
    pickup_date  TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE INDEX IF NOT EXISTS idx_pickups_date    ON pickup_transactions(pickup_date);
  CREATE INDEX IF NOT EXISTS idx_pickups_product ON pickup_transactions(product_id);
`);

// Idempotent migration: add `type` column to pickup_transactions if it
// doesn't already exist, so we can use the same ledger for restocks too.
const txCols = db.prepare(`PRAGMA table_info(pickup_transactions)`).all();
if (!txCols.some((c) => c.name === 'type')) {
  db.exec(`ALTER TABLE pickup_transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'PICKUP'`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pickups_type ON pickup_transactions(type)`);
}

logger.info(`Scan DB ready at ${DB_FILE}`);

export default db;
