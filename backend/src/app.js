/**
 * Express app builder. Exported as a handler so the same app can run
 * locally via server.js (app.listen) or on Vercel via api/index.js
 * (the Express app is itself a (req, res) handler).
 *
 * In production (Railway / single-process deploys) the same app also
 * serves the built frontend from frontend/dist, with an SPA fallback
 * for client-side routes.
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import config from './utils/config.js';
import authRoutes from './api/auth.routes.js';
import parcelRoutes from './api/parcels.routes.js';
import configRoutes from './api/config.routes.js';
import inventoryRoutes from './api/inventory.routes.js';
import errorHandler from './middleware/error.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Hosting platforms (Railway, Vercel, etc.) sit behind a proxy;
// express-rate-limit needs this to read the real client IP.
app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again later.' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/config', configRoutes);
app.use('/api/inventory', inventoryRoutes);

// --- Serve the built frontend (single-process deploys like Railway) ---
// We resolve the path from backend/src/app.js -> ../../frontend/dist.
// If the build hasn't run yet (local dev), this just no-ops because
// the directory doesn't exist.
const FRONTEND_DIST = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback: any non-/api request that didn't match a static file
  // returns index.html so React Router handles the route.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
app.use(errorHandler);

export default app;
