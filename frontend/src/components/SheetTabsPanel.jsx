/**
 * Source Sheets editor for the Dashboard.
 *
 * Each row has TWO inputs:
 *  - Source tab name (must match the Google Sheets tab exactly)
 *  - Display label  (friendly name shown across the app — Scan,
 *                    Count-by-Sheet, History, etc.)
 *
 * Saves to /api/config/sheets and the backend hot-reloads its index
 * on the next lookup.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function SheetTabsPanel() {
  const [tabs, setTabs] = useState([]); // [{name, label}]
  const [available, setAvailable] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const { tabs } = await api.getSheetTabs();
      setTabs(
        tabs.map((t) =>
          typeof t === 'string'
            ? { name: t, label: t }
            : { name: t.name || '', label: t.label || t.name || '' }
        )
      );
      setDirty(false);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
    try {
      const { available } = await api.getAvailableTabs();
      setAvailable(available);
    } catch {
      // optional — spreadsheet may be unreachable; the editor still works
      setAvailable([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (i, patch) => {
    setTabs((t) => t.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
    setDirty(true);
    setMsg('');
  };

  const remove = (i) => {
    setTabs((t) => t.filter((_, idx) => idx !== i));
    setDirty(true);
    setMsg('');
  };

  const add = () => {
    setTabs((t) => [...t, { name: '', label: '' }]);
    setDirty(true);
    setMsg('');
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const cleaned = tabs
        .map((t) => ({
          name: t.name.trim(),
          label: (t.label || '').trim() || t.name.trim(),
        }))
        .filter((t) => t.name);
      const res = await api.updateSheetTabs(cleaned);
      setTabs(
        res.tabs.map((t) => ({ name: t.name, label: t.label || t.name }))
      );
      setDirty(false);
      setMsg('Saved. The scanner will use these tabs on the next lookup.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Source sheets
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Left = real Sheets tab. Right = display label (shown on Scan,
            Count by Sheet, History).
          </p>
        </div>
        <button onClick={load} className="text-xs text-slate-500 hover:text-accent">
          ⟳ Reload
        </button>
      </div>

      {err && (
        <div className="text-sm text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2 mb-3">
          {err}
        </div>
      )}
      {msg && (
        <div className="text-sm text-signal-green bg-signal-green/10 border border-signal-green/30 rounded-lg px-3 py-2 mb-3">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] uppercase tracking-widest text-slate-500 mb-1 px-1">
        <span>Source tab (Sheets)</span>
        <span>Display label</span>
        <span />
      </div>

      <ul className="space-y-2">
        {tabs.map((t, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              value={t.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="e.g. NCR(FS)"
              className="input font-mono text-sm"
              list="available-tabs"
            />
            <input
              value={t.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={t.name || 'Friendly name'}
              className="input text-sm"
            />
            <button
              onClick={() => remove(i)}
              className="btn-ghost px-3 text-signal-red"
              title="Remove tab"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <datalist id="available-tabs">
        {available.map((a) => <option key={a} value={a} />)}
      </datalist>

      <div className="flex gap-2 mt-4">
        <button onClick={add} className="btn-ghost">+ Add tab</button>
        <button
          onClick={save}
          disabled={!dirty || saving || tabs.every((t) => !t.name.trim())}
          className="btn-primary"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {available.length > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          Available in spreadsheet: {available.join(', ')}
        </p>
      )}
    </div>
  );
}
