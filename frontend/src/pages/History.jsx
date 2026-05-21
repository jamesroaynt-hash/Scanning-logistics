/**
 * History — chronological scan log with duplicate flags.
 * Admins see every operator; staff see only their own scans
 * (enforced server-side). Admins also get a CSV backup download
 * and a DB summary banner.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function History() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.history(date);
      setRows(res.history);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setStats(await api.historyStats());
    } catch {
      setStats(null);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const sheetCounts = useMemo(() => {
    const map = new Map();
    let unknown = 0;
    for (const r of rows) {
      const key = r.sourceTab || '';
      if (!key) { unknown += 1; continue; }
      const display = r.sheetLabel || r.sourceTab;
      const cur = map.get(key) || { sheet: display, count: 0 };
      cur.sheet = display;
      cur.count += 1;
      map.set(key, cur);
    }
    const list = [...map.values()].sort((a, b) => b.count - a.count);
    if (unknown) list.push({ sheet: '— (not found)', count: unknown });
    return list;
  }, [rows]);

  const downloadBackup = async () => {
    setDownloading(true);
    setMsg('');
    try {
      const blob = await api.downloadHistoryBackup({
        from: date || undefined,
        to: date || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `scan-backup-${date || stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Backup downloaded.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl">Scan History</h1>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="input !py-2 !w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {date && (
            <button onClick={() => setDate('')} className="btn-ghost">
              Clear
            </button>
          )}
          <button onClick={load} className="btn-ghost">
            ⟳
          </button>
          {isAdmin && (
            <button
              onClick={downloadBackup}
              disabled={downloading}
              className="btn-primary"
              title={date ? `Download CSV for ${date}` : 'Download full CSV backup'}
            >
              {downloading ? '…' : '⤓ CSV Backup'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && stats && (
        <div className="card p-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">DB total scans</p>
            <p className="font-display font-bold text-2xl">{stats.total}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">First scan</p>
            <p className="font-mono text-sm mt-1">
              {stats.firstScan ? new Date(stats.firstScan).toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Last scan</p>
            <p className="font-mono text-sm mt-1">
              {stats.lastScan ? new Date(stats.lastScan).toLocaleString() : '—'}
            </p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Scans per sheet {date ? `(${date})` : '(recent)'}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Total <span className="text-slate-300 font-mono">{rows.length}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sheetCounts.map((s) => (
              <span
                key={s.sheet}
                className="inline-flex items-center gap-2 bg-ink-800/60 border border-ink-700 rounded-full px-3 py-1 text-xs"
              >
                <span className="text-slate-300">{s.sheet}</span>
                <span className="font-mono text-accent">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <div className="text-sm text-slate-400 bg-ink-800/60 border border-ink-700 rounded-lg px-3 py-2">
          {msg}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No scan history for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-ink-700">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">Sheet</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Operator</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-ink-800 hover:bg-ink-800/50"
                  >
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-accent">
                      {r.trackingNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {r.sheetLabel || r.sourceTab || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {r.customer || '—'}
                    </td>
                    <td className="px-4 py-3">{r.operator}</td>
                    <td className="px-4 py-3">
                      {r.found ? (
                        r.duplicate ? (
                          <span className="text-signal-amber">
                            ⚠ Duplicate
                          </span>
                        ) : (
                          <span className="text-signal-green">✓ Found</span>
                        )
                      ) : (
                        <span className="text-signal-red">✕ Not found</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {r.status || '—'}
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
