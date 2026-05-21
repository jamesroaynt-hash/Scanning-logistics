/**
 * ScanHistoryService — persists every scan to public.scan_records.
 *
 * The shared schema stores the operator as an int FK (scanned_by →
 * users.id). We look up the FK on every insert from the JWT username.
 * If a username has no matching row, scanned_by stays NULL — the
 * scan is still recorded, the audit trail just lacks a user link.
 */
import { randomUUID } from 'crypto';
import db from './db.service.js';

async function userIdByUsername(username) {
  if (!username) return null;
  const { rows } = await db.query(
    'SELECT id FROM public.users WHERE username = $1 LIMIT 1',
    [username]
  );
  return rows[0]?.id ?? null;
}

function rowToEntry(row) {
  if (!row) return null;
  const ts = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : row.created_at;
  return {
    id: row.scan_ref,
    trackingNumber: row.tracking_no,
    operator: row.operator_username || 'unknown',
    found: row.found ?? true,
    status: row.status,
    sourceTab: row.source_tab,
    customer: row.customer,
    product: row.product,
    duplicate: row.duplicate ?? false,
    timestamp: ts,
  };
}

class ScanHistoryService {
  /**
   * Insert a scan row. Returns { entry, duplicate } — duplicate is
   * true if the same tracking_no was already scanned today.
   */
  async add({ trackingNumber, operator, found, status, sourceTab, customer, product }) {
    const scanDate = new Date().toISOString().slice(0, 10);

    const dupCheck = await db.query(
      'SELECT 1 FROM public.scan_records WHERE tracking_no = $1 AND scan_date = $2 LIMIT 1',
      [trackingNumber, scanDate]
    );
    const duplicate = dupCheck.rows.length > 0;

    const scanRef = randomUUID();
    const userId = await userIdByUsername(operator);
    const scanTime = new Date().toISOString().slice(11, 19);

    const { rows } = await db.query(
      `INSERT INTO public.scan_records
         (scan_ref, tracking_no, customer, scan_date, scan_time, status, scan_type,
          scanned_by, product, source_tab, found, duplicate)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'Standard', $7, $8, $9, $10, $11)
       RETURNING scan_ref, tracking_no, customer, status, source_tab, product,
                 found, duplicate, created_at`,
      [
        scanRef,
        trackingNumber,
        customer || null,
        scanDate,
        scanTime,
        status || null,
        userId,
        product || null,
        sourceTab || null,
        Boolean(found),
        duplicate,
      ]
    );

    return {
      entry: rowToEntry({ ...rows[0], operator_username: operator || 'unknown' }),
      duplicate,
    };
  }

  async list({ operator, date, from, to, limit = 500 } = {}) {
    const where = [];
    const params = [];
    if (operator) { params.push(operator); where.push(`u.username = $${params.length}`); }
    if (date)     { params.push(date);     where.push(`s.scan_date = $${params.length}`); }
    if (from)     { params.push(from);     where.push(`s.scan_date >= $${params.length}`); }
    if (to)       { params.push(to);       where.push(`s.scan_date <= $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const { rows } = await db.query(
      `SELECT s.scan_ref, s.tracking_no, s.customer, s.status, s.source_tab,
              s.product, s.found, s.duplicate, s.created_at,
              u.username AS operator_username
         FROM public.scan_records s
         LEFT JOIN public.users u ON u.id = s.scanned_by
         ${clause}
        ORDER BY s.created_at DESC
        LIMIT $${params.length}`,
      params
    );
    return rows.map(rowToEntry);
  }

  /** Same as list() but without a limit — used by the CSV export. */
  async listAll({ operator, from, to } = {}) {
    const where = [];
    const params = [];
    if (operator) { params.push(operator); where.push(`u.username = $${params.length}`); }
    if (from)     { params.push(from);     where.push(`s.scan_date >= $${params.length}`); }
    if (to)       { params.push(to);       where.push(`s.scan_date <= $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT s.scan_ref, s.tracking_no, s.customer, s.status, s.source_tab,
              s.product, s.found, s.duplicate, s.created_at,
              u.username AS operator_username
         FROM public.scan_records s
         LEFT JOIN public.users u ON u.id = s.scanned_by
         ${clause}
        ORDER BY s.created_at DESC`,
      params
    );
    return rows.map(rowToEntry);
  }

  async statsForToday() {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT tracking_no)::int AS unique_count
         FROM public.scan_records
        WHERE scan_date = $1`,
      [today]
    );
    return {
      totalScannedToday: rows[0]?.total ?? 0,
      uniqueScannedToday: rows[0]?.unique_count ?? 0,
    };
  }

  async dbStats() {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              MIN(created_at) AS first_scan,
              MAX(created_at) AS last_scan
         FROM public.scan_records`
    );
    return {
      total: rows[0]?.total ?? 0,
      firstScan: rows[0]?.first_scan,
      lastScan: rows[0]?.last_scan,
    };
  }
}

export default new ScanHistoryService();
