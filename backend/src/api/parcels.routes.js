/**
 * /api/parcels
 * Core warehouse operations: scan lookup, manual search,
 * status updates, dashboard stats, and export feeds.
 */
import { Router } from 'express';
import sheets from '../services/googleSheets.service.js';
import history from '../services/scanHistory.service.js';
import sheetConfig from '../services/sheetConfig.service.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Statuses the system recognises. Kept server-side as the source of truth.
export const VALID_STATUSES = [
  'Scanned',
  'Out for Delivery',
  'Delivered',
  'Returned',
  'Failed Delivery',
];

function makeLabelLookup(tabs) {
  const map = new Map();
  for (const t of tabs) map.set(t.name.toLowerCase(), t.label);
  return (name) => {
    if (!name) return name;
    return map.get(String(name).toLowerCase()) || name;
  };
}

/**
 * GET /api/parcels/scan/:tracking
 * Primary hot path. Looks up a parcel and logs the scan.
 */
router.get('/scan/:tracking', requireAuth, async (req, res, next) => {
  try {
    const tracking = req.params.tracking;
    const parcel = await sheets.findByTracking(tracking);

    const { duplicate } = await history.add({
      trackingNumber: tracking,
      operator: req.user.username,
      found: Boolean(parcel),
      status: parcel ? parcel.Status : null,
      sourceTab: parcel ? parcel._sourceTab : null,
      customer: parcel ? parcel.Customer : null,
      product: parcel ? parcel['Product Name'] : null,
    });

    if (!parcel) {
      return res.status(404).json({
        found: false,
        duplicate,
        error: 'Tracking number not found',
      });
    }

    res.json({ found: true, duplicate, parcel });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/parcels/search?q=...&status=...&date=...
 * Manual search + filtering for the search page.
 */
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const { q = '', status = '', date = '' } = req.query;
    const all = await sheets.getAll();
    const needle = String(q).trim().toLowerCase();

    const filtered = all.filter((row) => {
      const matchesText =
        !needle ||
        String(row['Tracking Number']).toLowerCase().includes(needle) ||
        String(row['Customer']).toLowerCase().includes(needle) ||
        String(row['Phone Number']).toLowerCase().includes(needle) ||
        String(row['Product Name']).toLowerCase().includes(needle);

      const matchesStatus = !status || row['Status'] === status;
      const matchesDate = !date || row['Day Created'] === date;

      return matchesText && matchesStatus && matchesDate;
    });

    res.json({ count: filtered.length, results: filtered });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/parcels/status
 * Update a parcel's delivery status straight back to Google Sheets.
 */
router.patch('/status', requireAuth, async (req, res, next) => {
  try {
    const { trackingNumber, status } = req.body || {};

    if (!trackingNumber || !status) {
      return res
        .status(400)
        .json({ error: 'trackingNumber and status are required' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const updated = await sheets.updateStatus(trackingNumber, status);
    res.json({ success: true, parcel: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/parcels/dashboard
 * Aggregated counters for the dashboard cards.
 */
router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const all = await sheets.getAll();
    const counts = {
      total: all.length,
      delivered: 0,
      returned: 0,
      failed: 0,
      outForDelivery: 0,
      scanned: 0,
      pending: 0,
    };

    for (const row of all) {
      switch (row['Status']) {
        case 'Delivered':
          counts.delivered++;
          break;
        case 'Returned':
          counts.returned++;
          break;
        case 'Failed Delivery':
          counts.failed++;
          break;
        case 'Out for Delivery':
          counts.outForDelivery++;
          break;
        case 'Scanned':
          counts.scanned++;
          break;
        default:
          counts.pending++;
      }
    }

    res.json({
      ...counts,
      ...(await history.statsForToday()),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/parcels/history - scan logs (admin sees all, staff sees own) */
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { date, from, to, limit } = req.query;
    const filter = { date, from, to };
    if (limit) filter.limit = Math.min(Number(limit) || 500, 5000);
    if (req.user.role !== 'admin') {
      filter.operator = req.user.username;
    }
    const [list, tabs] = await Promise.all([
      history.list(filter),
      sheetConfig.getTabs(),
    ]);
    const labelFor = makeLabelLookup(tabs);
    res.json({
      history: list.map((row) => ({ ...row, sheetLabel: labelFor(row.sourceTab) })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/parcels/history/stats - admin-only DB summary for backups page */
router.get(
  '/history/stats',
  requireAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      res.json(await history.dbStats());
    } catch (err) { next(err); }
  }
);

/**
 * GET /api/parcels/history/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns the scan log as CSV. Admin-only.
 */
router.get(
  '/history/export',
  requireAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="scan-backup-${stamp}.csv"`
      );

      const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const cols = [
        'timestamp', 'tracking_number', 'operator', 'found', 'status',
        'source_tab', 'sheet_name', 'customer', 'product', 'duplicate',
      ];
      res.write(cols.join(',') + '\n');

      const [entries, tabs] = await Promise.all([
        history.listAll({ from, to }),
        sheetConfig.getTabs(),
      ]);
      const labelFor = makeLabelLookup(tabs);

      for (const e of entries) {
        res.write(
          [
            e.timestamp,
            e.trackingNumber,
            e.operator,
            e.found ? 1 : 0,
            e.status,
            e.sourceTab,
            labelFor(e.sourceTab),
            e.customer,
            e.product,
            e.duplicate ? 1 : 0,
          ].map(escape).join(',') + '\n'
        );
      }
      res.end();
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/parcels/export - full dataset for Excel/PDF export */
router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const all = await sheets.getAll();
    res.json({ data: all });
  } catch (err) {
    next(err);
  }
});

/** POST /api/parcels/cache/clear - admin-only manual cache flush */
router.post(
  '/cache/clear',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    sheets.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  }
);

export default router;
