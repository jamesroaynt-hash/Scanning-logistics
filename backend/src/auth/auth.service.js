/**
 * AuthService
 * -----------
 * Handles credential verification and JWT issuance.
 *
 * Bootstrap users come from config (env). Passwords are hashed at
 * startup so we never compare plaintext, even for the seed accounts.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

class AuthService {
  constructor() {
    // Hash seed passwords once at boot.
    this.users = config.users.map((u) => ({
      username: u.username,
      role: u.role,
      passwordHash: bcrypt.hashSync(u.password, 10),
    }));
    logger.info(
      `Auth initialised with ${this.users.length} user account(s).`
    );
  }

  async login(username, password) {
    const user = this.users.find((u) => u.username === username);
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;

    const token = jwt.sign(
      { username: user.username, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );

    return {
      token,
      user: { username: user.username, role: user.role },
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
