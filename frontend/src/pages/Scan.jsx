/**
 * Scan page — the operational core.
 *
 * Three input paths, all converging on one handleScan():
 *   1. Always-on USB keyboard-wedge scanner (useUsbScanner)
 *   2. Auto-focused text input (manual / handheld that needs focus)
 *   3. Optional camera scanner (toggle)
 *
 * After every scan: sound feedback, result render, input auto-clear,
 * and re-focus so the operator can immediately scan the next parcel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { sounds } from '../utils/sound.js';
import {
  cacheParcel,
  getCachedParcel,
  exportRtsReturnedPDF,
} from '../utils/helpers.js';
import useUsbScanner from '../scanner/useUsbScanner.js';
import CameraScanner from '../scanner/CameraScanner.jsx';
import ParcelCard from '../components/ParcelCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { CountBySheet, computeSheetCounts } from './Scanned.jsx';
import { useBatchMarker } from '../utils/batch.js';

export default function Scan() {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [parcel, setParcel] = useState(null);
  const [feedback, setFeedback] = useState(null); // {type, msg}
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [todayScans, setTodayScans] = useState([]); // for Count-by-Sheet
  const [downloading, setDownloading] = useState(false);
  const [batchStartedAt, setBatchStartedAt, clearBatch] = useBatchMarker();
  const isAdmin = user?.role === 'admin';

  const loadTodayScans = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { history: rows } = await api.history({ date: today, limit: 5000 });
      setTodayScans(rows);
    } catch {
      // Silent: if we can't load history right now, leave the table empty.
    }
  }, []);

  useEffect(() => { loadTodayScans(); }, [loadTodayScans]);

  const visibleScans = useMemo(() => {
    if (!batchStartedAt) return todayScans;
    return todayScans.filter((r) => r.timestamp >= batchStartedAt);
  }, [todayScans, batchStartedAt]);

  const sheetCounts = useMemo(() => computeSheetCounts(visibleScans), [visibleScans]);

  const refocus = useCallback(() => {
    // Defer so it runs after any re-render/state flush.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    refocus();
  }, [refocus]);

  const handleScan = useCallback(
    async (raw) => {
      const tracking = String(raw).trim();
      if (!tracking || busy) return;

      setBusy(true);
      setFeedback(null);
      try {
        const res = await api.scan(tracking);
        setParcel(res.parcel);
        cacheParcel(res.parcel);

        if (res.duplicate) {
          sounds.warning();
          setFeedback({
            type: 'warn',
            msg: `Duplicate scan — ${tracking} was already scanned today`,
          });
        } else {
          sounds.success();
          setFeedback({ type: 'ok', msg: `Found: ${tracking}` });
        }

        loadTodayScans();
      } catch (err) {
        // Fall back to offline cache if the network/Sheets is down.
        const cached = getCachedParcel(tracking);
        if (cached && err.status !== 404) {
          setParcel(cached);
          sounds.warning();
          setFeedback({
            type: 'warn',
            msg: `Offline — showing cached data for ${tracking}`,
          });
        } else {
          setParcel(null);
          sounds.error();
          setFeedback({
            type: 'err',
            msg:
              err.status === 404
                ? `Tracking number "${tracking}" not found`
                : err.message,
          });
          loadTodayScans();
        }
      } finally {
        setValue('');
        setBusy(false);
        refocus();
      }
    },
    [busy, refocus, loadTodayScans]
  );

  // Always-on USB scanner (disabled while camera is active to avoid
  // double-handling, since camera has its own path).
  useUsbScanner(handleScan, { enabled: !cameraOn });

  const onSubmit = (e) => {
    e.preventDefault();
    handleScan(value);
  };

  const updateStatus = async (status) => {
    if (!parcel) return;
    setUpdating(true);
    try {
      const res = await api.updateStatus(parcel['Tracking Number'], status);
      setParcel(res.parcel);
      cacheParcel(res.parcel);
      sounds.success();
      setFeedback({ type: 'ok', msg: `Status updated → ${status}` });
    } catch (err) {
      sounds.error();
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setUpdating(false);
      refocus();
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { history: rows } = await api.history(today);
      let scans = rows.filter((r) => r.found);
      if (batchStartedAt) {
        scans = scans.filter((r) => r.timestamp >= batchStartedAt);
      }
      if (scans.length === 0) {
        setFeedback({
          type: 'warn',
          msg: batchStartedAt ? 'No scans in this batch yet.' : 'No scans yet for today.',
        });
        return;
      }
      exportRtsReturnedPDF(scans, {
        dateLabel: batchStartedAt
          ? `${new Date().toLocaleDateString()} · batch from ${new Date(batchStartedAt).toLocaleTimeString()}`
          : new Date().toLocaleDateString(),
      });
      setFeedback({ type: 'ok', msg: `PDF downloaded — ${scans.length} parcel(s).` });
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setDownloading(false);
      refocus();
    }
  };

  const fbColor =
    feedback?.type === 'ok'
      ? 'text-signal-green bg-signal-green/10 border-signal-green/30'
      : feedback?.type === 'warn'
      ? 'text-signal-amber bg-signal-amber/10 border-signal-amber/30'
      : 'text-signal-red bg-signal-red/10 border-signal-red/30';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Scan Station</h1>
          <p className="text-sm text-slate-500">
            Operator: <span className="text-accent">{user?.username}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!confirm(
                'Start a new batch? The current totals will reset to 0; all scans stay saved in the database.'
              )) return;
              setBatchStartedAt(new Date().toISOString());
              refocus();
            }}
            className="btn-ghost"
            title="Reset the live totals so the next scans count as a new batch"
          >
            ↻ New Batch
          </button>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="btn-ghost"
            title="Download today's RTS Returned report as PDF"
          >
            {downloading ? '…' : '⤓ Download PDF'}
          </button>
          <button
            onClick={() => setCameraOn((c) => !c)}
            className={cameraOn ? 'btn-primary' : 'btn-ghost'}
          >
            {cameraOn ? '■ Stop Camera' : '◎ Use Camera'}
          </button>
        </div>
      </div>

      {batchStartedAt && (
        <div className="flex items-center justify-between gap-3 text-sm bg-accent/10 border border-accent/30 text-accent rounded-lg px-3 py-2">
          <span>
            Batch in progress · started{' '}
            <span className="font-mono">
              {new Date(batchStartedAt).toLocaleTimeString()}
            </span>
            {' '}({visibleScans.length} scan{visibleScans.length === 1 ? '' : 's'} so far)
          </span>
          <button
            onClick={clearBatch}
            className="text-xs underline hover:text-accent-soft"
          >
            end batch
          </button>
        </div>
      )}

      {/* Big scan input */}
      <form onSubmit={onSubmit} className="card p-5">
        <label className="text-[10px] uppercase tracking-widest text-slate-500">
          Scan or type tracking number
        </label>
        <div className="flex gap-3 mt-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={refocus}
            placeholder="Ready to scan…"
            className="input !text-2xl !py-5 font-mono tracking-wider"
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-primary px-8 text-base"
          >
            {busy ? '…' : 'Search'}
          </button>
        </div>

        {feedback && (
          <div
            className={`mt-3 text-sm border rounded-lg px-3 py-2 ${fbColor}`}
          >
            {feedback.msg}
          </div>
        )}
      </form>

      {cameraOn && (
        <div className="card p-5">
          <CameraScanner onResult={handleScan} active={cameraOn} />
        </div>
      )}

      <div className="space-y-6">
        {parcel ? (
          <ParcelCard
            parcel={parcel}
            onUpdateStatus={updateStatus}
            updating={updating}
          />
        ) : (
          <div className="card p-12 text-center text-slate-500">
            <div className="text-5xl mb-3 opacity-40">◳</div>
            <p>Scan a parcel to see its details here</p>
          </div>
        )}

        {/* Today's Count-by-Sheet — sits under the parcel card */}
        <CountBySheet
          counts={sheetCounts}
          loading={false}
          title="Count by sheet · today"
        />
      </div>
    </div>
  );
}
