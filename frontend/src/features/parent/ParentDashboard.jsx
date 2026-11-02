import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BedDouble, CalendarCheck, IndianRupee, CalendarDays, MessageSquareWarning, Phone, ChevronRight, AlertTriangle, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Misc';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, fmtMoney, fmtPct, label, yearLabel } from '../../utils/format';

const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// Where the child is right now, in words a parent understands.
function whereabouts(c) {
  const leave = parseJson(c.current_leave);
  if (leave?.overdue) return { tone: 'red', text: `Overdue from leave (expected ${fmtDateTime(leave.ret)})` };
  if (leave) return { tone: 'blue', text: `On approved leave until ${fmtDateTime(leave.ret)}` };
  if (c.hostel_status !== 'resident') return { tone: 'gray', text: `Hostel status: ${label(c.hostel_status)}` };
  if (!c.today_status) return { tone: 'gray', text: "Today's roll call not taken yet" };
  return { tone: { present: 'green', late: 'orange', absent: 'red', on_leave: 'blue', out_pass: 'purple' }[c.today_status], text: `Today: ${label(c.today_status)}` };
}

function ChildCard({ c }) {
  const where = whereabouts(c);
  const att = c.attendance_pct === null ? null : Number(c.attendance_pct);
  return (
    <Link to={`/children/${c.id}`} className="card block p-5 transition hover:border-brand-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={c.name} className="h-11 w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{c.name}</p>
          <p className="text-xs text-slate-500">{c.register_number} · {c.department} · {yearLabel(c.year_of_study)}</p>
          <Badge tone={where.tone} className="mt-2">{where.text}</Badge>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-2.5"><dt className="flex items-center gap-1 text-xs text-slate-500"><BedDouble className="h-3.5 w-3.5" />Room</dt><dd className="mt-0.5 font-semibold">{c.bed_code ? `${c.hostel_code}-${c.room_number}` : '—'}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2.5"><dt className="flex items-center gap-1 text-xs text-slate-500"><CalendarCheck className="h-3.5 w-3.5" />Attendance</dt><dd className={clsx('mt-0.5 font-semibold', att !== null && att < 75 && 'text-red-600')}>{att === null ? '—' : fmtPct(att)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2.5"><dt className="flex items-center gap-1 text-xs text-slate-500"><IndianRupee className="h-3.5 w-3.5" />Fee due</dt><dd className={clsx('mt-0.5 font-semibold', Number(c.overdue_fees) > 0 && 'text-red-600')}>{fmtMoney(c.fee_due)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2.5"><dt className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Leave</dt><dd className="mt-0.5 font-semibold">{Number(c.pending_leaves) ? `${c.pending_leaves} pending` : 'None pending'}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {Number(c.overdue_fees) > 0 && <StatusBadge status="overdue">Fee overdue</StatusBadge>}
        {Number(c.open_complaints) > 0 && <Badge><MessageSquareWarning className="h-3 w-3" />{c.open_complaints} open complaint(s)</Badge>}
        {c.warden_name && <span className="ml-auto flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Warden {c.warden_name}{c.warden_phone ? ` · ${c.warden_phone}` : ''}</span>}
      </div>
    </Link>
  );
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/parents/children');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonCards count={2} />;
  const alerts = (data || []).filter((c) => parseJson(c.current_leave)?.overdue || Number(c.overdue_fees) > 0);
  return (
    <div className="space-y-5">
      <PageHeader title={`Welcome, ${user.name.replace(/\s*\(.*\)$/, '')}`} subtitle="Your ward's hostel stay, attendance, fees, leave and activities — updated live from the hostel office." />
      {alerts.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{alerts.map((c) => `${c.name.split(' ')[0]}: ${parseJson(c.current_leave)?.overdue ? 'not yet back from leave' : 'hostel fee overdue'}`).join(' · ')}. Please contact the warden.</span>
        </div>
      )}
      {data.length === 0 ? (
        <EmptyState icon={Users} title="No student linked to your account" message="Ask the hostel office to link your ward to this login." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">{data.map((c) => <ChildCard key={c.id} c={c} />)}</div>
      )}
    </div>
  );
}
