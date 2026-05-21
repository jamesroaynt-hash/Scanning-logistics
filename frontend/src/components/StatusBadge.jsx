import { statusStyle } from '../utils/helpers.js';

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${statusStyle(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status || 'Pending'}
    </span>
  );
}
