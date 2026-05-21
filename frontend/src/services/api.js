/**
 * Thin fetch wrapper that:
 *  - prefixes /api
 *  - attaches the JWT bearer token
 *  - normalises error handling
 *  - transparently handles 401 (expired session)
 */
const TOKEN_KEY = 'ps_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('ps_user');
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('auth:expired'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),

  scan: (tracking) =>
    request(`/parcels/scan/${encodeURIComponent(tracking)}`),

  search: ({ q = '', status = '', date = '' }) => {
    const qs = new URLSearchParams({ q, status, date }).toString();
    return request(`/parcels/search?${qs}`);
  },

  updateStatus: (trackingNumber, status) =>
    request('/parcels/status', {
      method: 'PATCH',
      body: { trackingNumber, status },
    }),

  dashboard: () => request('/parcels/dashboard'),

  history: (dateOrOpts = '') => {
    if (typeof dateOrOpts === 'string') {
      return request(`/parcels/history${dateOrOpts ? `?date=${dateOrOpts}` : ''}`);
    }
    const { date, from, to, limit } = dateOrOpts || {};
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (limit) qs.set('limit', String(limit));
    const s = qs.toString();
    return request(`/parcels/history${s ? `?${s}` : ''}`);
  },

  exportAll: () => request('/parcels/export'),

  clearCache: () => request('/parcels/cache/clear', { method: 'POST' }),

  getSheetTabs: () => request('/config/sheets'),

  updateSheetTabs: (tabs) =>
    request('/config/sheets', { method: 'PUT', body: { tabs } }),

  getAvailableTabs: () => request('/config/sheets/available'),

  historyStats: () => request('/parcels/history/stats'),

  // --- Inventory ---
  inventory: {
    list: () => request('/inventory/products'),
    create: (product) =>
      request('/inventory/products', { method: 'POST', body: product }),
    update: (id, patch) =>
      request(`/inventory/products/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: patch,
      }),
    remove: (id) =>
      request(`/inventory/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    pickup: ({ productId, quantity, pickupDate }) =>
      request('/inventory/pickup', {
        method: 'POST',
        body: { productId, quantity, pickupDate },
      }),
    restock: ({ productId, quantity, restockDate }) =>
      request('/inventory/restock', {
        method: 'POST',
        body: { productId, quantity, restockDate },
      }),
    transactions: (opts = '') => {
      // Backward-compat: accept a date string or {date, type}.
      if (typeof opts === 'string') {
        return request(`/inventory/transactions${opts ? `?date=${opts}` : ''}`);
      }
      const qs = new URLSearchParams();
      if (opts.date) qs.set('date', opts.date);
      if (opts.type) qs.set('type', opts.type);
      const s = qs.toString();
      return request(`/inventory/transactions${s ? `?${s}` : ''}`);
    },
    summary: () => request('/inventory/summary'),
  },

  // CSV download — bypass the JSON wrapper; returns a Blob.
  downloadHistoryBackup: async ({ from = '', to = '' } = {}) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const token = getToken();
    const res = await fetch(`/api/parcels/history/export?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Download failed (${res.status})`);
    }
    return res.blob();
  },
};
