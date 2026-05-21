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

/** GET /api/inventory/products — list everything in the catalogue */
router.get('/products', requireAuth, (req, res, next) => {
  try {
    res.json({ products: inventory.listProducts() });
  } catch (err) { next(err); }
});

/** POST /api/inventory/products — admin only, create a new product */
router.post('/products', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    const product = inventory.createProduct(req.body || {});
    res.status(201).json({ product });
  } catch (err) { next(err); }
});

/**
 * PUT /api/inventory/products/:id — update name/status/price/reorder point
 * (also accepts availableSupplies for manual stock corrections by admin).
 */
router.put('/products/:id', requireAuth, (req, res, next) => {
  try {
    const patch = { ...(req.body || {}) };
    // Stock corrections are admin-only; staff may only toggle status/reorder
    if (req.user.role !== 'admin' && patch.availableSupplies !== undefined) {
      return res.status(403).json({ error: 'Only admins can adjust stock directly' });
    }
    const product = inventory.updateProduct(req.params.id, patch);
    res.json({ product });
  } catch (err) { next(err); }
});

/** DELETE /api/inventory/products/:id — admin only */
router.delete(
  '/products/:id',
  requireAuth,
  requireRole('admin'),
  (req, res, next) => {
    try {
      res.json(inventory.deleteProduct(req.params.id));
    } catch (err) { next(err); }
  }
);

/**
 * POST /api/inventory/pickup
 * Body: { productId, quantity, pickupDate? }
 * Deducts stock atomically and appends a pickup transaction.
 */
router.post('/pickup', requireAuth, (req, res, next) => {
  try {
    const { productId, quantity, pickupDate } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    const result = inventory.recordPickup({
      productId,
      quantity,
      pickupDate,
      operator: req.user.username,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * POST /api/inventory/restock
 * Body: { productId, quantity, restockDate? }
 * Atomically adds stock and appends a RESTOCK transaction.
 */
router.post('/restock', requireAuth, (req, res, next) => {
  try {
    const { productId, quantity, restockDate } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    const result = inventory.recordRestock({
      productId,
      quantity,
      restockDate,
      operator: req.user.username,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/** GET /api/inventory/transactions?date=YYYY-MM-DD&type=PICKUP|RESTOCK */
router.get('/transactions', requireAuth, (req, res, next) => {
  try {
    const { date, type } = req.query;
    res.json({
      transactions: inventory.listTransactions({ date, type }),
    });
  } catch (err) { next(err); }
});

/** GET /api/inventory/summary — counts for dashboard cards */
router.get('/summary', requireAuth, (req, res, next) => {
  try {
    res.json(inventory.summary());
  } catch (err) { next(err); }
});

export default router;
