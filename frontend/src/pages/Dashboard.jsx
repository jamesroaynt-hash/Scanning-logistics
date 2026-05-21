/**
 * Dashboard — at-a-glance operational counters.
 * Auto-refreshes every 20s so floor managers see live numbers.
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api.js';
import SheetTabsPanel from '../components/SheetTabsPanel.jsx';

function StatCard({ label, value, accent, hint }) {
  return (
    <div className="card p-5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 font-display font-bold text-4xl ${
          accent || 'text-slate-100'
        }`}
      >
        {value ?? '—'}
      </p>
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Dashboard</h1>
        <button onClick={load} className="btn-ghost">
          ⟳ Refresh
        </button>
      </div>

      {err && (
        <div className="text-sm text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Scanned Today"
          value={data?.totalScannedToday}
          accent="text-accent"
          hint={`${data?.uniqueScannedToday ?? 0} unique parcels`}
        />
        <StatCard
          label="Delivered"
          value={data?.delivered}
          accent="text-signal-green"
        />
        <StatCard
          label="Out for Delivery"
          value={data?.outForDelivery}
          accent="text-signal-blue"
        />
        <StatCard
          label="Returned"
          value={data?.returned}
          accent="text-signal-amber"
        />
        <StatCard
          label="Failed Deliveries"
          value={data?.failed}
          accent="text-signal-red"
        />
        <StatCard
          label="Pending Parcels"
          value={data?.pending}
          accent="text-signal-slate"
        />
      </div>

      <div className="card p-5">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">
          Total records in database
        </p>
        <p className="font-display font-bold text-3xl mt-1">
          {data?.total ?? '—'}
        </p>
      </div>

      <SheetTabsPanel />
    </div>
  );
}
