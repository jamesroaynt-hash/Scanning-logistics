/**
 * Shared helpers: status colour mapping, offline cache, and
 * Excel / PDF export.
 */
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const STATUSES = [
  'Scanned',
  'Out for Delivery',
  'Delivered',
  'Returned',
  'Failed Delivery',
];

/** Tailwind classes per status — keeps colour-coding consistent. */
export function statusStyle(status) {
  switch (status) {
    case 'Delivered':
      return 'bg-signal-green/15 text-signal-green border border-signal-green/30';
    case 'Out for Delivery':
      return 'bg-signal-blue/15 text-signal-blue border border-signal-blue/30';
    case 'Scanned':
      return 'bg-accent/15 text-accent border border-accent/30';
    case 'Returned':
      return 'bg-signal-amber/15 text-signal-amber border border-signal-amber/30';
    case 'Failed Delivery':
      return 'bg-signal-red/15 text-signal-red border border-signal-red/30';
    default:
      return 'bg-signal-slate/15 text-signal-slate border border-signal-slate/30';
  }
}

// ---------- Offline cache ----------
// Last successful lookups are stashed so a brief network/Sheets
// outage doesn't stop the operator from seeing recent parcels.
const OFFLINE_KEY = 'ps_offline_cache';

export function cacheParcel(parcel) {
  try {
    const store = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '{}');
    const key = String(parcel['Tracking Number']).toUpperCase();
    store[key] = { parcel, cachedAt: Date.now() };
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(store));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export function getCachedParcel(tracking) {
  try {
    const store = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '{}');
    const hit = store[String(tracking).toUpperCase()];
    return hit ? hit.parcel : null;
  } catch {
    return null;
  }
}

// ---------- Exports ----------
export function exportToExcel(rows, filename = 'parcels.xlsx') {
  const clean = rows.map(({ _rowNumber, ...rest }) => rest);
  const ws = XLSX.utils.json_to_sheet(clean);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Parcels');
  XLSX.writeFile(wb, filename);
}

/**
 * Build the RTS-Returned PDF: per-sheet totals for today (no parcel list).
 *
 *   scans  - array of history entries from /api/parcels/history
 *            (each must include sourceTab and optionally sheetLabel)
 *   opts.dateLabel - human-readable date string for the header
 */
export function exportRtsReturnedPDF(scans, { dateLabel, filename } = {}) {
  const doc = new jsPDF();
  const today = dateLabel || new Date().toLocaleDateString();

  doc.setFontSize(11);
  doc.text(`Date today: ${today}`, 14, 16);

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('RTS RETURNED', 14, 26);
  doc.setFont(undefined, 'normal');

  doc.setFontSize(11);
  doc.text('LIST OF RTS TODAY:', 14, 36);

  // Group by raw source tab (stable across renames) but display the label.
  const groups = new Map(); // key = sourceTab, value = { display, count }
  scans.forEach((s) => {
    const key = s.sourceTab || '__missing__';
    const display = s.sheetLabel || s.sourceTab || 'Unknown';
    const cur = groups.get(key) || { display, count: 0 };
    cur.display = display;
    cur.count += 1;
    groups.set(key, cur);
  });

  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  const grandTotal = rows.reduce((acc, r) => acc + r.count, 0);

  const body = rows.map((r, i) => [i + 1, r.display, r.count]);
  body.push([
    { content: 'TOTAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
    { content: grandTotal, styles: { fontStyle: 'bold' } },
  ]);

  autoTable(doc, {
    startY: 40,
    head: [['#', 'SHEETS', 'TOTAL']],
    body,
    styles: { fontSize: 11 },
    headStyles: { fillColor: [255, 107, 26], halign: 'left' },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 30, halign: 'center' },
    },
  });

  const fileSafeDate = new Date().toISOString().slice(0, 10);
  doc.save(filename || `rts-returned-${fileSafeDate}.pdf`);
}

export function exportToPDF(rows, filename = 'parcels.pdf') {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Warehouse Parcel Report', 14, 16);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [
      [
        'ID',
        'Day Created',
        'Tracking Number',
        'Customer',
        'Phone',
        'Status',
        'Product',
        'COD',
      ],
    ],
    body: rows.map((r) => [
      r.ID,
      r['Day Created'],
      r['Tracking Number'],
      r.Customer,
      r['Phone Number'],
      r.Status,
      r['Product Name'],
      r.COD,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [255, 107, 26] },
  });

  doc.save(filename);
}
