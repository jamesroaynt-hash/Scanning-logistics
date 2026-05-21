/**
 * CameraScanner
 * -------------
 * Wraps html5-qrcode for camera-based barcode/QR scanning.
 *
 * Notes:
 *  - We debounce identical reads (cameras fire the same code many
 *    times/second) so one physical scan == one logical scan.
 *  - The component is fully unmount-safe (stops the camera stream).
 */
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const REGION_ID = 'qr-reader';
const DEDUPE_MS = 1500;

export default function CameraScanner({ onResult, active }) {
  const scannerRef = useRef(null);
  const lastRef = useRef({ code: null, t: 0 });
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!active) return;

    const html5 = new Html5Qrcode(REGION_ID, { verbose: false });
    scannerRef.current = html5;

    const handle = (decodedText) => {
      const now = Date.now();
      const { code, t } = lastRef.current;
      if (code === decodedText && now - t < DEDUPE_MS) return;
      lastRef.current = { code: decodedText, t: now };
      onResult(decodedText.trim());
    };

    html5
      .start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qbox: { width: 260, height: 160 },
          aspectRatio: 1.6,
        },
        handle,
        () => {} // ignore per-frame decode failures (very noisy)
      )
      .then(() => setRunning(true))
      .catch((e) => {
        setError(
          e?.message ||
            'Unable to access camera. Check browser permissions.'
        );
      });

    return () => {
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      }
      setRunning(false);
    };
  }, [active, onResult]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-ink-600 bg-black">
        <div id={REGION_ID} className="w-full" />
        {running && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-accent shadow-[0_0_12px_2px_var(--tw-shadow-color)] shadow-accent-glow animate-scan-line" />
            <div className="absolute left-4 top-4 h-6 w-6 border-l-2 border-t-2 border-accent" />
            <div className="absolute right-4 top-4 h-6 w-6 border-r-2 border-t-2 border-accent" />
            <div className="absolute left-4 bottom-4 h-6 w-6 border-l-2 border-b-2 border-accent" />
            <div className="absolute right-4 bottom-4 h-6 w-6 border-r-2 border-b-2 border-accent" />
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {!error && (
        <p className="text-xs text-slate-500 text-center">
          Point the camera at a barcode or QR code
        </p>
      )}
    </div>
  );
}
