/**
 * Centralised configuration.
 * Reads from environment variables (loaded via dotenv in server.js)
 * and exposes a single typed config object used across the app.
 */
import dotenv from 'dotenv';

dotenv.config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Accept one or many comma-separated origins
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),

  google: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    // Seed list of tabs. Either GOOGLE_SHEET_TABS or GOOGLE_SHEET_TAB can hold
    // a comma-separated list. The runtime list is owned by sheetConfig.service
    // and can be edited from the dashboard, which persists to data/sheet-config.json.
    sheetTabs: (() => {
      const raw = process.env.GOOGLE_SHEET_TABS || process.env.GOOGLE_SHEET_TAB || 'Sheet1';
      return raw.split(',').map((t) => t.trim()).filter(Boolean);
    })(),
    credentialsPath:
      process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  // Bootstrap users. In a larger system these would live in a real DB.
  users: [
    {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      role: 'admin',
    },
    {
      username: process.env.STAFF_USERNAME || 'staff',
      password: process.env.STAFF_PASSWORD || 'staff123',
      role: 'staff',
    },
  ],

  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 30,
};

export default config;
