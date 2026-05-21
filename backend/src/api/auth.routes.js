/**
 * /api/auth
 * Login endpoint -> returns JWT + user info.
 */
import { Router } from 'express';
import authService from '../auth/auth.service.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required' });
    }

    const result = await authService.login(username, password);
    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
