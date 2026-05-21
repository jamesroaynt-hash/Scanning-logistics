/**
 * Scanned — full scan log viewer with quick range filters
 * (Today / Yesterday / Monthly / Custom). Staff see their own
 * scans; admins see everyone's (enforced server-side).
 *
 * Includes a Count-by-Sheet summary that matches the Scan
 * page's recent panel, so floor leads can verify totals.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useBatchMarker } from '../utils/batch.js';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function yesterday(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return x;
}

/**
 * Pack-size prefix: leading digits + up to 3 following letters, taken
 * from the product name. Examples:
 *   "2JARSWHITENINGCREAM" -> "2JAR"
 *   "3PCSSOAP"            -> "3PCS"
 *   "5JARSOAP"            -> "5JAR"
 *   "NIACINAMIDE"         -> null
 */
export function productPrefix(name) {
  if (!name) return null;
  const m = String(name).trim().match(/^(\d+)([A-Za-z]{0,3})/);
  if (!m) return null;
  return (m[1] + (m[2] || '')).toUpperCase();
}

/**
 * Build the Count-by-Sheet matrix:
 *   prefixes: sorted union of leading-number prefixes seen in the data
 *   list:     [{ sheet, byPrefix: {prefix: n}, found, total }]
 *   total:    aggregate across all sheets
 */
export function computeSheetCounts(rows) {
  const prefixSet = new Set();
  const map = new Map();
  for (const r of rows) {
    const key = r.sourceTab || '__missing__';
    const display = r.sheetLabel || r.sourceTab || '— (not found)';
    const cur = map.get(key) || { sheet: display, byPrefix: {}, found: 0, total: 0 };
    cur.sheet = display;
    cur.total += 1;
    if (r.found) {
      cur.found += 1;
      const p = productPrefix(r.product);
      if (p) {
        prefixSet.add(p);
        cur.byPrefix[p] = (cur.byPrefix[p] || 0) + 1;
      }
    }
    map.set(key, cur);
  }
  const prefixes = [...prefixSet].sort();
  const list = [...map.values()].sort((a, b) => b.total - a.total);
  const total = list.reduce(
    (acc, x) => {
      acc.found += x.found;
      acc.total += x.total;
      for (const p of prefixes) {
        acc.byPrefix[p] = (acc.byPrefix[p] || 0) + (x.byPrefix[p] || 0);
      }
      return acc;
    },
    { sheet: 'Total', byPrefix: {}, found: 0, total: 0 }
  );
  return { prefixes, list, total };
}

function rangeFor(preset, custom) {
  const today = new Date();
  switch (preset) {
    case 'today':     return { from: isoDate(today),         to: isoDate(today) };
    case 'yesterday': return { from: isoDate(yesterday(today)), to: isoDate(yesterday(today)) };
    case 'month':     return { from: isoDate(startOfMonth(today)), to: isoDate(today) };
    case 'custom':    return { from: custom.from || '',       to: custom.to || '' };
    default:          return { from: '', to: '' };
  }
}

export default function Scanned() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  // Shared marker (localStorage). When set, only scans newer than this
  // ISO timestamp are shown — so the operator sees only the current batch.
  const [batchStartedAt, setBatchStartedAt, clearBatch] = useBatchMarker();
  const [starting, setStarting] = useState(false);

  const { from, to } = rangeFor(preset, custom);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setErr('');
    try {
      const res = await api.history({ from, to, limit: 5000 });
      setRows(res.history);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Changing the date range here doesn't auto-clear the batch marker any
  // more — the marker is global and the operator manages it explicitly.

  const startNewBatch = useCallback(async () => {
    if (!confirm(
      isAdmin
        ? 'Download a CSV backup of the current view, then start a new batch?'
        : 'Start a new batch? Scans before this moment will be hidden from the view (still saved in the DB).'
    )) return;

    setStarting(true);
    setErr('');
    try {
      if (isAdmin) {
        // Backup the current range to CSV so nothing's ever lost.
        const blob = await api.downloadHistoryBackup({ from, to });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scan-batch-backup-${from}_to_${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setBatchStartedAt(new Date().toISOString());
      setMsg('New batch started — only newer scans will show below.');
      setTimeout(() => setMsg(''), 3500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setStarting(false);
    }
  }, [from, to, isAdmin]);

  const visibleRows = useMemo(() => {
    if (!batchStartedAt) return rows;
    return rows.filter((r) => r.timestamp >= batchStartedAt);
  }, [rows, batchStartedAt]);

  const counts = useMemo(() => computeSheetCounts(visibleRows), [visibleRows]);

  const rangeLabel =
    preset === 'today' ? `Today (${from})`
    : preset === 'yesterday' ? `Yesterday (${from})`
    : preset === 'month' ? `This month (${from} → ${to})`
    : from && to ? `${from} → ${to}` : 'Pick a range';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Scanned</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? 'All operators' : `Operator: ${user?.username}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={startNewBatch}
            disabled={starting || loading || rows.length === 0}
            className="btn-ghost"
            title={isAdmin
              ? 'Download CSV backup and start a new batch view'
              : 'Hide current scans from the view; new scans will appear below'}
          >
            {starting ? '…' : '↻ New Batch'}
          </button>
          <button onClick={load} className="btn-ghost">⟳ Refresh</button>
        </div>
      </div>

      {batchStartedAt && (
        <div className="flex items-center justify-between gap-3 text-sm bg-accent/10 border border-accent/30 text-accent rounded-lg px-3 py-2">
          <span>
            New batch · showing scans after{' '}
            <span className="font-mono">
              {new Date(batchStartedAt).toLocaleTimeString()}
            </span>
            {' '}({visibleRows.length} of {rows.length})
          </span>
          <button
            onClick={clearBatch}
            className="text-xs underline hover:text-accent-soft"
          >
            show all
          </button>
        </div>
      )}

      {msg && (
        <div className="text-sm text-signal-green bg-signal-green/10 border border-signal-green/30 rounded-lg px-3 py-2">
          {msg}
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-display ${
              preset === p.value
                ? 'bg-accent text-ink-950 shadow shadow-accent-glow'
                : 'bg-ink-800 text-slate-300 hover:bg-ink-700'
            }`}
          >
            {p.label}
          </button>
        ))}

        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="input !py-1.5 !w-auto"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="input !py-1.5 !w-auto"
            />
          </div>
        )}

        <span className="ml-auto text-xs text-slate-500">{rangeLabel}</span>
      </div>

      {err && (
        <div className="text-sm text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      <CountBySheet counts={counts} loading={loading} />

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-700 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            {batchStartedAt ? 'Current batch' : 'All scanned'} · {visibleRows.length}
          </p>
        </div>
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading…</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            {batchStartedAt
              ? 'No scans in this batch yet. Scan something on the Scan page.'
              : 'No scans in this range.'}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-ink-700">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">Sheet</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Operator</th>
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-b border-ink-800 hover:bg-ink-800/40">
                    <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-accent">{r.trackingNumber}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">
                      {r.sheetLabel || r.sourceTab || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{r.customer || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{r.product || '—'}</td>
                    <td className="px-4 py-2.5">{r.operator}</td>
                    <td className="px-4 py-2.5">
                      {r.found ? (
                        r.duplicate ? (
                          <span className="text-signal-amber">⚠ Duplicate</span>
                        ) : (
                          <span className="text-signal-green">✓ Found</span>
                        )
                      ) : (
                        <span className="text-signal-red">✕ Not found</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function CountBySheet({ counts, loading, title = 'Count by sheet' }) {
  const prefixes = counts.prefixes || [];
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-700">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">
          {title}
        </p>
      </div>
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
      ) : counts.list.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No scans.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-ink-700">
                <th className="px-4 py-3">Sheet</th>
                {prefixes.map((p) => (
                  <th key={p} className="px-3 py-3 text-center font-mono">{p}</th>
                ))}
                <th className="px-4 py-3 text-center">Found</th>
                <th className="px-4 py-3 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {counts.list.map((c) => (
                <tr key={c.sheet} className="border-b border-ink-800">
                  <td className="px-4 py-2.5 text-slate-200">{c.sheet}</td>
                  {prefixes.map((p) => (
                    <td key={p} className="px-3 py-2.5 text-center">
                      <CountPill value={c.byPrefix[p] || 0} tone={c.byPrefix[p] ? 'accent' : 'mute'} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center">
                    <CountPill value={c.found} tone="green" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <CountPill value={c.total} tone="accent" />
                  </td>
                </tr>
              ))}
              <tr className="bg-ink-800/40">
                <td className="px-4 py-3 font-display font-bold">Total</td>
                {prefixes.map((p) => (
                  <td key={p} className="px-3 py-3 text-center">
                    <CountPill value={counts.total.byPrefix[p] || 0} tone="accent" bold />
                  </td>
                ))}
                <td className="px-4 py-3 text-center">
                  <CountPill value={counts.total.found} tone="green" bold />
                </td>
                <td className="px-4 py-3 text-center">
                  <CountPill value={counts.total.total} tone="accent" bold />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CountPill({ value, tone, bold }) {
  const tones = {
    green: 'bg-signal-green/15 text-signal-green border-signal-green/30',
    red:   'bg-signal-red/15 text-signal-red border-signal-red/30',
    accent:'bg-accent/15 text-accent border-accent/30',
    mute:  'bg-ink-700/40 text-slate-400 border-ink-600',
  };
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2rem] px-2.5 py-0.5 rounded-full border text-xs font-mono ${
        tones[tone] || tones.mute
      } ${bold ? 'font-bold' : ''}`}
    >
      {value}
    </span>
  );
}
