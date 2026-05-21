/**
 * Express app builder. Exported as a handler so the same app can run
 * locally via server.js (app.listen) and on Vercel via api/index.js
 * (the Express app is itself a (req, res) handler).
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config from './utils/config.js';
import authRoutes from './api/auth.routes.js';
import parcelRoutes from './api/parcels.routes.js';
import configRoutes from './api/config.routes.js';
import inventoryRoutes from './api/inventory.routes.js';
import errorHandler from './middleware/error.middleware.js';

const app = express();

// Vercel sits behind a proxy; express-rate-limit needs to know this
// to derive the real client IP from X-Forwarded-For.
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

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
app.use(errorHandler);

export default app;
