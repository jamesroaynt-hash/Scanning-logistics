/**
 * Centralised configuration. Reads from env (loaded via dotenv) and
 * exposes a single typed config object used across the app.
 *
 * User accounts now live in public.users (Supabase) — they're no
 * longer seeded from env. JWT_SECRET still matters for token signing.
 */
import dotenv from 'dotenv';

dotenv.config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),

  databaseUrl: process.env.DATABASE_URL,

  google: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    // Seed list of tabs the first time sheet_tabs is empty. Persisted
    // afterwards via the dashboard → sheet_tabs table.
    sheetTabs: (() => {
      const raw = process.env.GOOGLE_SHEET_TABS || process.env.GOOGLE_SHEET_TAB || 'Sheet1';
      return raw.split(',').map((t) => t.trim()).filter(Boolean);
    })(),
    credentialsPath:
      process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json',
    credentialsJson: process.env.GOOGLE_CREDENTIALS_JSON || null,
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 30,
};

export default config;
