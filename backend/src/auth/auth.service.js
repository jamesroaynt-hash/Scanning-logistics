/**
 * AuthService — verifies credentials against public.users and issues
 * JWTs. Passwords stored as bcrypt ($2*) hashes are checked with
 * bcrypt.compare; the legacy plaintext rows (e.g. the seed `staff`
 * row in this DB) fall back to a string equality check.
 *
 * The `users.role` column uses display names ("Administrator",
 * "Trainee", "CSR TL", ...). We collapse those into the two roles
 * the rest of the app understands: 'admin' or 'staff'.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../services/db.service.js';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

function normaliseRole(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.startsWith('admin')) return 'admin';
  return 'staff';
}

class AuthService {
  async login(username, password) {
    if (!username || !password) return null;

    const { rows } = await db.query(
      'SELECT id, username, password, role FROM public.users WHERE username = $1 LIMIT 1',
      [username]
    );
    const user = rows[0];
    if (!user || !user.password) return null;

    const stored = user.password;
    const ok = typeof stored === 'string' && stored.startsWith('$2')
      ? await bcrypt.compare(password, stored)
      : password === stored;

    if (!ok) return null;

    const role = normaliseRole(user.role);
    const token = jwt.sign(
      { username: user.username, role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );

    logger.info(`Login OK: ${user.username} (${role})`);
    return {
      token,
      user: { username: user.username, role },
    };
  }

  verify(token) {
    try {
      return jwt.verify(token, config.auth.jwtSecret);
    } catch {
      return null;
    }
  }
}

export default new AuthService();
