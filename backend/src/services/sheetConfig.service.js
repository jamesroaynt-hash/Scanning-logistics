/**
 * SheetConfigService
 * ------------------
 * Owns the runtime list of Google Sheet tabs the app reads from.
 *
 * A tab has TWO names:
 *  - `name`  : the actual tab name in Google Sheets (the source of truth)
 *  - `label` : the friendly display name shown in the UI (counts, history)
 *
 * `label` defaults to `name` if not set. Renaming a label never changes
 * what we read from Sheets — it just affects how the tab is displayed.
 *
 * Persisted to backend/data/sheet-config.json. Seeded from .env on
 * first run (strings get `label = name`).
 */
import fs from 'fs';
import path from 'path';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

const DATA_DIR = path.resolve('./data');
const FILE = path.join(DATA_DIR, 'sheet-config.json');

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
    this.tabs = null; // Array<{name, label}>
    this.listeners = new Set();
  }

  load() {
    if (this.tabs) return this.tabs;
    try {
      if (fs.existsSync(FILE)) {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (Array.isArray(raw.tabs) && raw.tabs.length > 0) {
          this.tabs = raw.tabs.map(normaliseEntry).filter(Boolean);
          if (this.tabs.length > 0) return this.tabs;
        }
      }
    } catch (err) {
      logger.warn(`Failed to read sheet-config.json: ${err.message}`);
    }
    this.tabs = config.google.sheetTabs.map(normaliseEntry).filter(Boolean);
    return this.tabs;
  }

  getTabs() {
    return this.load();
  }

  /** Just the real Sheets tab names — for code that talks to the API. */
  getTabNames() {
    return this.load().map((t) => t.name);
  }

  /** Friendly display name for a given tab name, or the name itself. */
  labelFor(name) {
    if (!name) return name;
    const hit = this.load().find(
      (t) => t.name.toLowerCase() === String(name).toLowerCase()
    );
    return hit ? hit.label : name;
  }

  setTabs(tabs) {
    const cleaned = (Array.isArray(tabs) ? tabs : [])
      .map(normaliseEntry)
      .filter(Boolean);
    if (cleaned.length === 0) {
      throw new Error('At least one sheet tab is required');
    }
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ tabs: cleaned }, null, 2), 'utf-8');
    this.tabs = cleaned;
    logger.info(
      `Sheet tab list updated: ${cleaned.map((t) => `${t.name}→${t.label}`).join(', ')}`
    );
    for (const fn of this.listeners) {
      try { fn(cleaned); } catch (e) { logger.warn(`config listener failed: ${e.message}`); }
    }
    return this.tabs;
  }

  /** Subscribe to tab-list changes. Returns an unsubscribe fn. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export default new SheetConfigService();
