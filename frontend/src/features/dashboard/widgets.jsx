import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Meter } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';

const SEV = {
  high: { dot: 'bg-red-500', label: 'High', text: 'text-red-700' },
  medium: { dot: 'bg-amber-500', label: 'Medium', text: 'text-amber-700' },
  low: { dot: 'bg-slate-400', label: 'Low', text: 'text-slate-600' },
};

export function ActionList({ items, compact }) {
  if (!items?.length) return <EmptyState icon={CheckCircle2} title="No pending actions" message="Nothing needs attention right now." />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a, i) => (
        <li key={`${a.type}-${a.link}-${i}`} className="flex items-center gap-3 py-2.5">
          <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', SEV[a.severity].dot)} title={`${SEV[a.severity].label} priority`} aria-label={`${SEV[a.severity].label} priority`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
            <p className={clsx('text-xs text-slate-500', compact ? 'truncate' : '')}>{a.detail}</p>
          </div>
          <Link to={a.link} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700">
            {a.action}<ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const COMPONENTS = [
  ['attendance', 'Attendance (7 days)'], ['complaintSla', 'Complaint SLA (30 days)'], ['feeCollection', 'Fee collection'],
  ['maintenance', 'Maintenance'], ['occupancy', 'Occupancy'], ['leaveCompliance', 'Leave returns on time'],
];

export function HealthCard({ hostel }) {
  const tone = hostel.band === 'good' ? 'text-emerald-600' : hostel.band === 'fair' ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{hostel.name}</p>
          <p className="text-xs text-slate-500">Hostel Health Score</p>
        </div>
        <div className="text-right">
          <p className={clsx('text-2xl font-bold tabular-nums', tone)}>{hostel.score}%</p>
          <StatusBadge status={hostel.band}>{hostel.band === 'attention' ? 'Needs attention' : hostel.band === 'good' ? 'Good' : 'Fair'}</StatusBadge>
        </div>
      </div>
      <dl className="mt-3 space-y-2">
        {COMPONENTS.map(([k, label]) => (
          <div key={k}>
            <div className="flex justify-between text-xs"><dt className="text-slate-600">{label}</dt><dd className="font-medium tabular-nums text-slate-800">{hostel.components[k]}%</dd></div>
            <Meter value={hostel.components[k]} className="mt-1 h-1.5" />
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-slate-400">Operational indicator, not a disciplinary score.</p>
    </div>
  );
}
