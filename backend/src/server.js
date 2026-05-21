/**
 * Server entry point.
 * Wires middleware, routes, rate limiting and error handling.
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config from './utils/config.js';
import logger from './utils/logger.js';
import authRoutes from './api/auth.routes.js';
import parcelRoutes from './api/parcels.routes.js';
import configRoutes from './api/config.routes.js';
import inventoryRoutes from './api/inventory.routes.js';
import errorHandler from './middleware/error.middleware.js';

const app = express();

// --- Core middleware ---
app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// --- Rate limiting (protects Sheets quota & login brute force) ---
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600, // generous: warehouse scanning is high-frequency
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again later.' },
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- Routes ---
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/config', configRoutes);
app.use('/api/inventory', inventoryRoutes);

// --- 404 + error handling ---
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(
    `Warehouse Scanner API running on http://localhost:${config.port} (${config.nodeEnv})`
  );
});
