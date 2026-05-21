/**
 * /api/inventory
 * Product catalogue management + daily pickup ledger.
 * Pickups can be submitted by any authenticated user; product CRUD
 * (create / delete) is admin-only.
 */
import { Router } from 'express';
import inventory from '../services/inventory.service.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/products', requireAuth, async (req, res, next) => {
  try {
    res.json({ products: await inventory.listProducts() });
  } catch (err) { next(err); }
});

router.post('/products', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const product = await inventory.createProduct(req.body || {});
    res.status(201).json({ product });
  } catch (err) { next(err); }
});

router.put('/products/:id', requireAuth, async (req, res, next) => {
  try {
    const patch = { ...(req.body || {}) };
    if (req.user.role !== 'admin' && patch.availableSupplies !== undefined) {
      return res.status(403).json({ error: 'Only admins can adjust stock directly' });
    }
    const product = await inventory.updateProduct(req.params.id, patch);
    res.json({ product });
  } catch (err) { next(err); }
});

router.delete(
  '/products/:id',
  requireAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      res.json(await inventory.deleteProduct(req.params.id));
    } catch (err) { next(err); }
  }
);

router.post('/pickup', requireAuth, async (req, res, next) => {
  try {
    const { productId, quantity, pickupDate } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    const result = await inventory.recordPickup({
      productId,
      quantity,
      pickupDate,
      operator: req.user.username,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/restock', requireAuth, async (req, res, next) => {
  try {
    const { productId, quantity, restockDate } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    const result = await inventory.recordRestock({
      productId,
      quantity,
      restockDate,
      operator: req.user.username,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const { date, type } = req.query;
    res.json({
      transactions: await inventory.listTransactions({ date, type }),
    });
  } catch (err) { next(err); }
});

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    res.json(await inventory.summary());
  } catch (err) { next(err); }
});

export default router;
