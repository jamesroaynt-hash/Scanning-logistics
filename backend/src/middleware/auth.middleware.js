/**
 * Authentication & authorisation middleware.
 *
 * requireAuth  - rejects requests without a valid Bearer token.
 * requireRole  - factory that restricts a route to specific roles.
 */
import authService from '../auth/auth.service.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  const payload = authService.verify(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = payload; // { username, role }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}
