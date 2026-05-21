/**
 * One-time migration: local SQLite (backend/data/scans.sqlite) →
 * Supabase Postgres. Run AFTER you've set DATABASE_URL in backend/.env.
 *
 *   cd backend && npm install     # ensures pg + better-sqlite3 are present
 *   node ../scripts/migrate-sqlite-to-supabase.js
 *
 * Idempotent for scans (scan_ref is unique) and products (item_id is
 * unique). NOT idempotent for transactions — re-running will duplicate
 * inventory_logs rows. Run it once.
 */
import Database from 'better-sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve('backend/.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to backend/.env first.');
  process.exit(1);
}

const sqlitePath = path.resolve('backend/data/scans.sqlite');
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function lookupUserId(client, username) {
  if (!username) return null;
  const { rows } = await client.query(
    'SELECT id FROM public.users WHERE username = $1 LIMIT 1',
    [username]
  );
  return rows[0]?.id ?? null;
}

async function migrateProducts(client) {
  const rows = sqlite.prepare('SELECT * FROM products').all();
  let inserted = 0, skipped = 0;
  for (const r of rows) {
    const res = await client.query(
      `INSERT INTO public.inventory
         (item_id, name, type, unit, stock, reorder_pt, sell_price,
          status, shipped_count, created_at, updated_at)
       VALUES ($1, $2, 'Product', 'pcs', $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (item_id) DO NOTHING`,
      [
        r.id, r.name, r.available_supplies, r.reorder_point,
        r.price_per_qty, r.status || 'ACTIVE', r.shipped_count || 0,
        r.created_at, r.updated_at,
      ]
    );
    if (res.rowCount > 0) inserted++; else skipped++;
  }
  console.log(`Products: ${rows.length} read, ${inserted} inserted, ${skipped} skipped`);
}

async function migrateScans(client) {
  const rows = sqlite.prepare('SELECT * FROM scans').all();
  let inserted = 0, skipped = 0;
  for (const r of rows) {
    const userId = await lookupUserId(client, r.operator);
    const scanTime = (r.timestamp || '').slice(11, 19) || null;
    const res = await client.query(
      `INSERT INTO public.scan_records
         (scan_ref, tracking_no, customer, scan_date, scan_time, status,
          scan_type, scanned_by, product, source_tab, found, duplicate,
          created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Standard', $7, $8, $9, $10, $11, $12)
       ON CONFLICT (scan_ref) DO NOTHING`,
      [
        r.id, r.tracking_number, r.customer, r.scan_date, scanTime,
        r.status, userId, r.product, r.source_tab,
        Boolean(r.found), Boolean(r.duplicate), r.timestamp,
      ]
    );
    if (res.rowCount > 0) inserted++; else skipped++;
  }
  console.log(`Scans: ${rows.length} read, ${inserted} inserted, ${skipped} skipped`);
}

async function migrateTransactions(client) {
  const rows = sqlite.prepare('SELECT * FROM pickup_transactions').all();
  let inserted = 0;
  for (const r of rows) {
    const action = r.type === 'RESTOCK' ? 'add' : 'remove';
    const qtyChange = action === 'add' ? r.quantity : -r.quantity;
    const userId = await lookupUserId(client, r.operator);
    await client.query(
      `INSERT INTO public.inventory_logs
         (item_id, action, qty_before, qty_change, qty_after, notes,
          created_by, pickup_date, created_at)
       VALUES ($1, $2, 0, $3, 0, $4, $5, $6, $7)`,
      [
        r.product_id, action, qtyChange,
        `Migrated: ${r.type} of ${r.product_name || 'unknown'}`,
        userId, r.pickup_date, r.timestamp,
      ]
    );
    inserted++;
  }
  console.log(`Transactions: ${rows.length} read, ${inserted} inserted`);
}

async function migrateSheetTabs(client) {
  const file = path.resolve('backend/data/sheet-config.json');
  if (!fs.existsSync(file)) {
    console.log('No sheet-config.json to migrate.');
    return;
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const tabs = (json.tabs || []).filter((t) => t && (typeof t === 'string' || t.name));
  if (tabs.length === 0) {
    console.log('Empty sheet-config.json; skipping.');
    return;
  }
  await client.query('DELETE FROM public.sheet_tabs');
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const name = typeof t === 'string' ? t : t.name;
    const label = (typeof t === 'object' && t.label) ? t.label : name;
    await client.query(
      `INSERT INTO public.sheet_tabs (position, name, label) VALUES ($1, $2, $3)`,
      [i, name, label]
    );
  }
  console.log(`Sheet tabs: migrated ${tabs.length}`);
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await migrateProducts(client);
    await migrateScans(client);
    await migrateTransactions(client);
    await migrateSheetTabs(client);
    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed — rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
})();
