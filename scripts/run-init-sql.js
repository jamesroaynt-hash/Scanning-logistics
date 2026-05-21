/**
 * One-shot: connect to the Postgres URL in backend/.env and run
 * scripts/railway-postgres-init.sql.
 *
 * Usage (from repo root):
 *   node scripts/run-init-sql.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve('backend/.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Paste your Railway Postgres URL into backend/.env first.');
  process.exit(1);
}

const sqlPath = path.resolve('scripts/railway-postgres-init.sql');
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`);
  process.exit(1);
}
const sql = fs.readFileSync(sqlPath, 'utf-8');

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('Running init SQL...');
    await client.query(sql);
    console.log('Done. Schema created and default admin inserted.');

    const { rows } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    console.log('\nTables in public schema:');
    for (const r of rows) console.log('  -', r.table_name);

    const { rows: users } = await client.query(
      'SELECT id, username, role FROM public.users'
    );
    console.log('\nUsers:');
    for (const u of users) console.log('  -', u);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
