/**
 * Centralised error handler. Keeps route handlers clean: they can
 * throw, and this turns errors into consistent JSON responses.
 */
import logger from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  const status =
    err.code === 'NOT_FOUND' ? 404 : err.status || err.statusCode || 500;

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err.message);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);
  }

  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}
