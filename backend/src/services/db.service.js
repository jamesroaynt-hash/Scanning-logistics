/**
 * Postgres connection pool (Supabase).
 *
 * Connect via Supabase's transaction-mode pooler URL when deploying
 * to serverless (Vercel) — direct connections would exhaust on cold
 * starts. The Settings → Database → Connection Pooling page in the
 * Supabase dashboard has the right URL.
 */
import pg from 'pg';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

if (!config.databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Copy the transaction-mode pooler URL ' +
    'from Supabase Settings → Database → Connection Pooling.'
  );
}

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error('Postgres pool error:', err.message);
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

/**
 * Run `fn(client)` inside a BEGIN/COMMIT transaction. The client is
 * always released back to the pool, even on throw. Use this for
 * stock-deduction reads-then-write paths (SELECT ... FOR UPDATE).
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

logger.info('Postgres pool initialised.');

export default { pool, query, withTransaction };
