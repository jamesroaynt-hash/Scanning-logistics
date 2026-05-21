/**
 * ParcelCard — the big scan-result panel.
 * Shows all parcel fields and inline status-update buttons.
 */
import StatusBadge from './StatusBadge.jsx';
import { STATUSES } from '../utils/helpers.js';

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-medium ${
          mono ? 'font-mono' : ''
        } break-words`}
      >
        {value || '—'}
      </p>
    </div>
  );
}

export default function ParcelCard({ parcel, onUpdateStatus, updating }) {
  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Tracking Number
          </p>
          <p className="text-2xl font-mono font-bold text-accent">
            {parcel['Tracking Number']}
          </p>
        </div>
        <StatusBadge status={parcel.Status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mt-6">
        <Field label="Customer" value={parcel.Customer} />
        <Field label="Phone Number" value={parcel['Phone Number']} mono />
        <Field label="Product Name" value={parcel['Product Name']} />
        <Field
          label="COD Amount"
          value={parcel.COD ? `₱ ${parcel.COD}` : '₱ 0'}
          mono
        />
        <Field label="Date Created" value={parcel['Day Created']} mono />
        <Field label="Record ID" value={parcel.ID} mono />
      </div>

      <div className="mt-6 pt-5 border-t border-ink-700">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">
          Update Status
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={updating || parcel.Status === s}
              onClick={() => onUpdateStatus(s)}
              className={`btn text-xs ${
                parcel.Status === s
                  ? 'bg-accent text-ink-950 font-semibold'
                  : 'bg-ink-700 text-slate-200 hover:bg-ink-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
