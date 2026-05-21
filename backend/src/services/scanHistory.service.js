/**
 * ScanHistoryService
 * ------------------
 * Every scan is persisted to SQLite so it survives restarts and can be
 * backed up by copying the .sqlite file. Reads are served straight from
 * the DB; today's-stats are computed via indexed SQL counts.
 */
import { randomUUID } from 'crypto';
import db from './db.service.js';

const insertStmt = db.prepare(`
  INSERT INTO scans
    (id, tracking_number, operator, found, status, source_tab, customer, product, duplicate, timestamp, scan_date)
  VALUES
    (@id, @trackingNumber, @operator, @found, @status, @sourceTab, @customer, @product, @duplicate, @timestamp, @scanDate)
`);

const dupCheckStmt = db.prepare(`
  SELECT 1 FROM scans WHERE tracking_number = ? AND scan_date = ? LIMIT 1
`);

const statsTodayStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    COUNT(DISTINCT tracking_number) AS unique_count
  FROM scans
  WHERE scan_date = ?
`);

const totalRowsStmt = db.prepare(`SELECT COUNT(*) AS n FROM scans`);
const firstScanStmt = db.prepare(`SELECT MIN(timestamp) AS t FROM scans`);
const lastScanStmt = db.prepare(`SELECT MAX(timestamp) AS t FROM scans`);

function rowToEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    trackingNumber: row.tracking_number,
    operator: row.operator,
    found: Boolean(row.found),
    status: row.status,
    sourceTab: row.source_tab,
    customer: row.customer,
    product: row.product,
    duplicate: Boolean(row.duplicate),
    timestamp: row.timestamp,
  };
}

class ScanHistoryService {
  /**
   * Record a scan. Returns { entry, duplicate } — duplicate is true if
   * the same tracking number was already scanned today.
   */
  add({ trackingNumber, operator, found, status, sourceTab, customer, product }) {
    const now = new Date();
    const timestamp = now.toISOString();
    const scanDate = timestamp.slice(0, 10);

    const duplicate = Boolean(dupCheckStmt.get(trackingNumber, scanDate));

    const entry = {
      id: randomUUID(),
      trackingNumber,
      operator: operator || 'unknown',
      found: Boolean(found),
      status: status || null,
      sourceTab: sourceTab || null,
      customer: customer || null,
      product: product || null,
      timestamp,
      duplicate,
    };

    insertStmt.run({
      id: entry.id,
      trackingNumber: entry.trackingNumber,
      operator: entry.operator,
      found: entry.found ? 1 : 0,
      status: entry.status,
      sourceTab: entry.sourceTab,
      customer: entry.customer,
      product: entry.product,
      duplicate: entry.duplicate ? 1 : 0,
      timestamp: entry.timestamp,
      scanDate,
    });

    return { entry, duplicate };
  }

  /**
   * List scans (newest first). Supports filtering by operator, date,
   * and an optional date range used by the CSV backup.
   */
  list({ operator, date, from, to, limit = 500 } = {}) {
    const where = [];
    const params = [];

    if (operator) { where.push('operator = ?'); params.push(operator); }
    if (date)     { where.push('scan_date = ?'); params.push(date); }
    if (from)     { where.push('scan_date >= ?'); params.push(from); }
    if (to)       { where.push('scan_date <= ?'); params.push(to); }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
      SELECT * FROM scans
      ${clause}
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    params.push(limit);

    return db.prepare(sql).all(...params).map(rowToEntry);
  }

  /** Async-style iterator for streaming CSV without loading everything. */
  *iter({ operator, from, to } = {}) {
    const where = [];
    const params = [];
    if (operator) { where.push('operator = ?'); params.push(operator); }
    if (from)     { where.push('scan_date >= ?'); params.push(from); }
    if (to)       { where.push('scan_date <= ?'); params.push(to); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const stmt = db.prepare(`SELECT * FROM scans ${clause} ORDER BY timestamp DESC`);
    for (const row of stmt.iterate(...params)) yield rowToEntry(row);
  }

  statsForToday() {
    const today = new Date().toISOString().slice(0, 10);
    const r = statsTodayStmt.get(today);
    return {
      totalScannedToday: r?.total ?? 0,
      uniqueScannedToday: r?.unique_count ?? 0,
    };
  }

  dbStats() {
    return {
      total: totalRowsStmt.get().n,
      firstScan: firstScanStmt.get().t,
      lastScan: lastScanStmt.get().t,
    };
  }
}

export default new ScanHistoryService();
