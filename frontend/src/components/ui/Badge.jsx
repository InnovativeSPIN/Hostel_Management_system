import clsx from 'clsx';
import { label } from '../../utils/format';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
};

export function Badge({ tone = 'gray', children, className, dot }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />}
      {children}
    </span>
  );
}

// One place that decides the colour of every workflow status in the app.
const STATUS_TONES = {
  // beds / rooms
  available: 'green', occupied: 'red', reserved: 'blue', maintenance: 'yellow', blocked: 'gray', active: 'green', inactive: 'gray',
  // attendance
  present: 'green', absent: 'red', late: 'orange', on_leave: 'blue', out_pass: 'purple',
  // leave
  pending: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray', returned: 'indigo',
  // complaints
  assigned: 'blue', in_progress: 'indigo', resolved: 'green', closed: 'gray',
  // priority
  low: 'gray', medium: 'blue', high: 'orange', critical: 'red',
  // fees
  paid: 'green', partial: 'yellow', overdue: 'red', waived: 'purple',
  // visitors
  expected: 'blue', checked_in: 'green', checked_out: 'gray',
  // applications
  submitted: 'yellow', documents_verified: 'blue', eligible: 'indigo', fee_assigned: 'purple', allocated: 'green', confirmed: 'green',
  // hostel status
  not_applied: 'gray', applied: 'yellow', resident: 'green', exited: 'gray',
  // exits
  requested: 'yellow', inspected: 'blue', cleared: 'green',
  // maintenance / misc
  open: 'yellow', completed: 'green', scheduled: 'blue', investigating: 'blue', dismissed: 'gray',
  locked: 'red', transferred: 'purple', vacated: 'gray',
  normal: 'gray', important: 'orange', urgent: 'red',
  good: 'green', fair: 'yellow', attention: 'red',
};

export function StatusBadge({ status, children, className }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <Badge tone={STATUS_TONES[status] || 'gray'} className={className}>{children || label(status)}</Badge>;
}

export function SlaBadge({ breached, minutesToSla, status }) {
  if (!['pending', 'assigned', 'in_progress'].includes(status)) return null;
  if (breached) return <Badge tone="red">⚠ SLA breached</Badge>;
  if (minutesToSla !== undefined && minutesToSla < 120) return <Badge tone="orange">Due in {Math.max(0, minutesToSla)}m</Badge>;
  return <Badge tone="green">On track</Badge>;
}
