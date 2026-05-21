/**
 * Batch marker — a single ISO timestamp stored in localStorage.
 * When set, pages that show scan counts (Scan, Scanned) filter their
 * data to rows newer than this marker so the operator sees only the
 * current scanning batch. Scans before the marker stay in the DB.
 *
 * `useBatchMarker()` returns [value, setValue, clearValue] and stays
 * in sync across pages by listening for both the cross-tab `storage`
 * event and a same-tab custom `batch:changed` event.
 */
import { useEffect, useState } from 'react';

const KEY = 'ps_batch_started_at';
const EVENT = 'batch:changed';

export function getBatchMarker() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setBatchMarker(iso) {
  try {
    localStorage.setItem(KEY, iso);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage disabled — non-fatal */
  }
}

export function clearBatchMarker() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* non-fatal */
  }
}

export function useBatchMarker() {
  const [v, setV] = useState(() => getBatchMarker());
  useEffect(() => {
    const sync = () => setV(getBatchMarker());
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return [v, setBatchMarker, clearBatchMarker];
}
