/**
 * /api/config — runtime, editable settings.
 * Currently exposes the list of Google Sheet tabs the app reads from.
 */
import { Router } from 'express';
import sheetConfig from '../services/sheetConfig.service.js';
import sheets from '../services/googleSheets.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/sheets', requireAuth, async (req, res, next) => {
  try {
    res.json({ tabs: await sheetConfig.getTabs() });
  } catch (err) { next(err); }
});

router.put('/sheets', requireAuth, async (req, res, next) => {
  try {
    const { tabs } = req.body || {};
    const saved = await sheetConfig.setTabs(tabs);
    res.json({ success: true, tabs: saved });
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
});

/** Tabs that actually exist in the underlying spreadsheet. */
router.get('/sheets/available', requireAuth, async (req, res, next) => {
  try {
    const available = await sheets.listAvailableTabs();
    res.json({ available });
  } catch (err) {
    next(err);
  }
});

export default router;
