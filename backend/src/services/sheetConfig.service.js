/**
 * SheetConfigService — runtime list of Google Sheet tabs we read from.
 *
 * Persisted to public.sheet_tabs. The first call to any read method
 * awaits an initial load from the DB; subsequent calls hit the
 * in-memory cache. setTabs() rewrites the table atomically and
 * notifies subscribers (the Google Sheets cache).
 *
 * Each tab has two names:
 *   - name  : the actual tab in the Google Sheet (source of truth)
 *   - label : the friendly display name (defaults to `name`)
 */
import db from './db.service.js';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

function normaliseEntry(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name, label: name } : null;
  }
  if (typeof raw === 'object') {
    const name = String(raw.name || '').trim();
    if (!name) return null;
    const labelRaw = String(raw.label || '').trim();
    return { name, label: labelRaw || name };
  }
  return null;
}

class SheetConfigService {
  constructor() {
    this.tabs = [];
    this.listeners = new Set();
    this.ready = this._loadOnce();
  }

  async _loadOnce() {
    try {
      const { rows } = await db.query(
        'SELECT position, name, label FROM public.sheet_tabs ORDER BY position ASC'
      );
      if (rows.length > 0) {
        this.tabs = rows.map((r) => ({ name: r.name, label: r.label }));
        return this.tabs;
      }
    } catch (err) {
      logger.warn(`Failed to load sheet_tabs: ${err.message}`);
    }

    const seeded = (config.google.sheetTabs || [])
      .map(normaliseEntry)
      .filter(Boolean);
    if (seeded.length > 0) {
      try {
        await this._writeAll(seeded);
      } catch (err) {
        logger.warn(`Could not seed sheet_tabs: ${err.message}`);
      }
    }
    this.tabs = seeded;
    return this.tabs;
  }

  async _writeAll(tabs) {
    await db.withTransaction(async (client) => {
      await client.query('DELETE FROM public.sheet_tabs');
      for (let i = 0; i < tabs.length; i++) {
        await client.query(
          `INSERT INTO public.sheet_tabs (position, name, label)
           VALUES ($1, $2, $3)`,
          [i, tabs[i].name, tabs[i].label]
        );
      }
    });
  }

  async getTabs() {
    await this.ready;
    return this.tabs;
  }

  async getTabNames() {
    await this.ready;
    return this.tabs.map((t) => t.name);
  }

  async labelFor(name) {
    if (!name) return name;
    await this.ready;
    const hit = this.tabs.find(
      (t) => t.name.toLowerCase() === String(name).toLowerCase()
    );
    return hit ? hit.label : name;
  }

  async setTabs(input) {
    const cleaned = (Array.isArray(input) ? input : [])
      .map(normaliseEntry)
      .filter(Boolean);
    if (cleaned.length === 0) {
      const err = new Error('At least one sheet tab is required');
      err.status = 400;
      throw err;
    }
    await this._writeAll(cleaned);
    this.tabs = cleaned;
    logger.info(
      `Sheet tab list updated: ${cleaned.map((t) => `${t.name}→${t.label}`).join(', ')}`
    );
    for (const fn of this.listeners) {
      try { fn(cleaned); } catch (e) {
        logger.warn(`config listener failed: ${e.message}`);
      }
    }
    return this.tabs;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export default new SheetConfigService();
