/**
 * useUsbScanner
 * -------------
 * USB barcode scanners act as keyboards ("keyboard wedge"): they
 * type the code very fast then send Enter.
 *
 * This hook listens globally, distinguishes scanner bursts from
 * human typing by inter-keystroke speed, and fires onScan with the
 * decoded value. It works even when no input is focused, so the
 * operator can scan continuously without clicking anywhere.
 */
import { useEffect, useRef } from 'react';

export default function useUsbScanner(onScan, { enabled = true } = {}) {
  const buffer = useRef('');
  const lastTime = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e) => {
      // Ignore if user is typing into the manual search field, etc.
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping =
        tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

      const now = Date.now();
      const delta = now - lastTime.current;
      lastTime.current = now;

      // Gap > 100ms means a human keystroke — reset the buffer.
      if (delta > 100) buffer.current = '';

      if (e.key === 'Enter') {
        const code = buffer.current.trim();
        buffer.current = '';
        // Only treat as a scan if it's a plausible burst-entered code.
        if (code.length >= 4 && !isTyping) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onScan, enabled]);
}
