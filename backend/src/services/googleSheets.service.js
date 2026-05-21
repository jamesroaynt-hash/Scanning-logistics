/**
 * GoogleSheetsService
 * --------------------
 * Reads parcel rows from one or more Google Sheet tabs and exposes
 * them as plain JS objects. The list of tabs is owned by
 * sheetConfig.service and can be edited at runtime from the UI.
 *
 *  - In-memory cache (node-cache) so we don't hammer the Sheets API.
 *  - A Map index keyed by normalised Tracking Number for O(1) lookups
 *    on every scan. Each indexed row carries its source tab so we
 *    write status updates back to the right sheet.
 *  - Cache is invalidated automatically on writes AND whenever the
 *    runtime tab list changes.
 */
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import sheetConfig from './sheetConfig.service.js';

const HEADERS = [
  'ID',
  'Day Created',
  'Tracking Number',
  'Customer',
  'Phone Number',
  'Status',
  'Product Name',
  'COD',
];

const STATUS_COLUMN_LETTER = 'F';
const CACHE_KEY = 'sheet_rows';

class GoogleSheetsService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: config.cacheTtlSeconds });
    this.sheets = null;
    this.index = new Map(); // normalisedTracking -> { rowNumber, sourceTab, data }
    this.initialised = false;

    // Drop cached rows whenever the admin changes the tab list.
    sheetConfig.onChange(() => this.clearCache());
  }

  static normalise(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  static quoteTab(tab) {
    return `'${String(tab).replace(/'/g, "''")}'`;
  }

  async init() {
    if (this.initialised) return;

    const authOptions = {
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    };

    if (config.google.credentialsJson) {
      // Preferred for serverless: the service-account JSON lives in
      // an env var (GOOGLE_CREDENTIALS_JSON) — no file on disk.
      try {
        authOptions.credentials = JSON.parse(config.google.credentialsJson);
      } catch (err) {
        throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON env var: ${err.message}`);
      }
    } else {
      const credPath = path.resolve(config.google.credentialsPath);
      if (!fs.existsSync(credPath)) {
        throw new Error(
          `No Google credentials. Set GOOGLE_CREDENTIALS_JSON (preferred) ` +
          `or place a service-account JSON at "${credPath}".`
        );
      }
      authOptions.keyFile = credPath;
    }

    const auth = new GoogleAuth(authOptions);
    const authClient = await auth.getClient();
    this.sheets = google.sheets({ version: 'v4', auth: authClient });
    this.initialised = true;
    logger.info('Google Sheets client initialised.');
  }

  /**
   * Fetch all rows from every configured tab, transform to objects,
   * tag with their source tab, and build the lookup index.
   */
  async loadRows(force = false) {
    if (!force) {
      const cached = this.cache.get(CACHE_KEY);
      if (cached) return cached;
    }

    await this.init();

    const tabs = await sheetConfig.getTabs();
    const rows = [];
    this.index.clear();

    for (const tab of tabs) {
      const range = `${GoogleSheetsService.quoteTab(tab.name)}!A2:H`;
      let values = [];
      try {
        const res = await this.sheets.spreadsheets.values.get({
          spreadsheetId: config.google.sheetId,
          range,
        });
        values = res.data.values || [];
      } catch (err) {
        logger.warn(`Failed to read tab "${tab.name}": ${err.message}`);
        continue;
      }

      values.forEach((row, i) => {
        const rowNumber = i + 2;
        const record = {};
        HEADERS.forEach((h, idx) => {
          record[h] = row[idx] !== undefined ? row[idx] : '';
        });
        record._rowNumber = rowNumber;
        record._sourceTab = tab.name;
        record._sheetLabel = tab.label;
        rows.push(record);

        const key = GoogleSheetsService.normalise(record['Tracking Number']);
        if (key && !this.index.has(key)) {
          // First-tab-wins on duplicate tracking numbers. Fine for now;
          // we can revisit if the data ever has true cross-tab dupes.
          this.index.set(key, { rowNumber, sourceTab: tab.name, data: record });
        }
      });
    }

    this.cache.set(CACHE_KEY, rows);
    logger.debug(`Loaded ${rows.length} rows from ${tabs.length} tab(s).`);
    return rows;
  }

  async findByTracking(trackingNumber) {
    await this.loadRows();
    const key = GoogleSheetsService.normalise(trackingNumber);
    const hit = this.index.get(key);
    return hit ? hit.data : null;
  }

  async getAll() {
    return this.loadRows();
  }

  /** List of tabs actually present in the underlying spreadsheet. */
  async listAvailableTabs() {
    await this.init();
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: config.google.sheetId,
      fields: 'sheets.properties.title',
    });
    return (meta.data.sheets || []).map((s) => s.properties.title);
  }

  /**
   * Update the Status cell for a given tracking number on its source tab.
   */
  async updateStatus(trackingNumber, newStatus) {
    await this.loadRows();
    const key = GoogleSheetsService.normalise(trackingNumber);
    const hit = this.index.get(key);
    if (!hit) {
      const err = new Error('Tracking number not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const cell = `${GoogleSheetsService.quoteTab(hit.sourceTab)}!${STATUS_COLUMN_LETTER}${hit.rowNumber}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: cell,
      valueInputOption: 'RAW',
      requestBody: { values: [[newStatus]] },
    });

    this.cache.del(CACHE_KEY);
    await this.loadRows(true);

    logger.info(
      `Status updated: ${trackingNumber} -> "${newStatus}" (tab "${hit.sourceTab}", row ${hit.rowNumber})`
    );
    return this.index.get(key)?.data || null;
  }

  clearCache() {
    this.cache.del(CACHE_KEY);
  }
}

export default new GoogleSheetsService();
