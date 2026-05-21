/**
 * Search — manual lookup with status/date filters and export.
 */
import { useState } from 'react';
import { api } from '../services/api.js';
import {
  STATUSES,
  exportToExcel,
  exportToPDF,
} from '../utils/helpers.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Search() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await api.search({ q, status, date });
      setRows(res.results);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="font-display font-bold text-2xl">Search & Filter</h1>

      <form onSubmit={run} className="card p-5 space-y-4">
        <input
          className="input"
          placeholder="Tracking number, customer, phone, or product…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="grid sm:grid-cols-3 gap-3">
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input"
            placeholder="Day Created (exact match)"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {rows.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-slate-500">
            {rows.length} result{rows.length !== 1 && 's'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => exportToExcel(rows)}
              className="btn-ghost"
            >
              ⤓ Excel
            </button>
            <button
              onClick={() => exportToPDF(rows)}
              className="btn-ghost"
            >
              ⤓ PDF
            </button>
          </div>
        </div>
      )}

      {searched && rows.length === 0 && !loading && (
        <div className="card p-12 text-center text-slate-500">
          No parcels match your search.
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-ink-700">
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">COD</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.ID + r['Tracking Number']}
                    className="border-b border-ink-800 hover:bg-ink-800/50"
                  >
                    <td className="px-4 py-3 font-mono text-accent">
                      {r['Tracking Number']}
                    </td>
                    <td className="px-4 py-3">{r.Customer}</td>
                    <td className="px-4 py-3 font-mono">
                      {r['Phone Number']}
                    </td>
                    <td className="px-4 py-3">{r['Product Name']}</td>
                    <td className="px-4 py-3 font-mono">{r.COD}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.Status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {r['Day Created']}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
