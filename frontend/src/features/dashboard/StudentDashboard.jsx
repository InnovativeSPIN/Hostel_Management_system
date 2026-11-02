import { Link } from 'react-router-dom';
import { BedDouble, CalendarCheck, IndianRupee, MessageSquareWarning, CalendarDays, Megaphone, Trophy, Building2, Phone, ClipboardList, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, StatCard, DefinitionList, Meter } from '../../components/ui/Card';
import { StatusBadge, SlaBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, label, yearLabel } from '../../utils/format';

export default function StudentDashboard() {
  const { data, loading, error, reload } = useFetch('/dashboard/student');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonCards count={5} />;
  const { student: s, allocation: a, application, fees, attendance, leaves, complaints, counts, announcements, activities } = data;
  const overdueLeave = leaves.find((l) => l.overdue);

  return (
    <div className="space-y-5">
      <PageHeader title={`Hello, ${s.name.split(' ')[0]}`} subtitle={`${s.register_number} · ${s.department_name} · ${yearLabel(s.year_of_study)}, Sem ${s.semester}`} />

      {overdueLeave && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />You were expected back from leave {overdueLeave.leave_code} by {fmtDateTime(overdueLeave.expected_return_at)}. Please contact your warden.
        </div>
      )}
      {fees.overdue && (
        <div className="flex gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          <IndianRupee className="h-5 w-5 shrink-0" />You have an overdue hostel fee. <Link to="/my/fees" className="font-medium underline">View fee ledger</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Room" value={a ? `${a.hostel_code}-${a.room_number}` : '—'} hint={a ? a.bed_code : label(s.hostel_status)} icon={BedDouble} tone="blue" />
        <StatCard label="Attendance" value={fmtPct(attendance.percentage)} hint="This month" icon={CalendarCheck} tone={attendance.percentage < 75 && attendance.marked ? 'red' : 'green'} to="/my/attendance" />
        <StatCard label="Fee due" value={fmtMoney(fees.due)} hint={`${fmtMoney(fees.paid)} paid`} icon={IndianRupee} tone={fees.overdue ? 'red' : fees.due > 0 ? 'orange' : 'green'} to="/my/fees" />
        <StatCard label="Open complaints" value={counts.openComplaints} icon={MessageSquareWarning} to="/complaints" />
        <StatCard label="Leave requests" value={`${counts.pendingLeaves} pending`} icon={CalendarDays} to="/my/leaves" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="My Hostel" icon={Building2} className="lg:col-span-2">
          {a ? (
            <div className="space-y-4">
              <DefinitionList cols={3} items={[
                ['Hostel', a.hostel_name], ['Room', `${a.room_number} (${label(a.room_type)})`], ['Bed', a.bed_code],
                ['Floor', a.floor_label], ['Amenities', [a.is_ac ? 'AC' : 'Non-AC', a.attached_bath ? 'Attached bath' : 'Common bath'].join(' · ')], ['Allocated on', fmtDate(a.allocated_at)],
                ['Roommates', a.roommates || 'None currently'], ['Warden', a.warden_name], ['Admission', <StatusBadge key="a" status={application?.status} />],
              ]} />
              {a.room_status !== 'active' && <Badge tone="yellow">Your room is currently under {a.room_status}</Badge>}
              {a.warden_phone && <a href={`tel:${a.warden_phone}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600"><Phone className="h-4 w-4" />Call warden ({a.warden_phone})</a>}
            </div>
          ) : (
            <EmptyState icon={ClipboardList} title={application ? `Application ${label(application.status)}` : 'No hostel allocation'}
              message={application ? `${application.application_code} for ${application.academic_year}. You will be notified at each step.` : 'Apply for hostel accommodation to get a room.'}
              action={<Button to="/my/application">{application ? 'Track application' : 'Apply for hostel'}</Button>} />
          )}
        </Card>

        <Card title="Fees" icon={IndianRupee} actions={<Link to="/my/fees" className="text-xs font-medium text-brand-600">Ledger</Link>}>
          {fees.items.length === 0 ? <p className="text-sm text-slate-500">No fees assigned.</p> : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-600">Total</span><b>{fmtMoney(fees.total)}</b></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Paid</span><b className="text-emerald-700">{fmtMoney(fees.paid)}</b></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Outstanding</span><b className={fees.due > 0 ? 'text-red-700' : ''}>{fmtMoney(fees.due)}</b></div>
              <Meter value={fees.total ? (fees.paid / fees.total) * 100 : 100} tone="bg-emerald-500" />
              <ul className="space-y-1.5 pt-1">
                {fees.items.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-600">{f.fee_name} · due {fmtDate(f.due_date)}</span><StatusBadge status={f.status} /></li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="My complaints" icon={MessageSquareWarning} actions={<Button size="xs" variant="subtle" to="/complaints?new=1">Raise complaint</Button>}>
          {complaints.length === 0 ? <p className="text-sm text-slate-500">No complaints raised.</p> : (
            <ul className="divide-y divide-slate-100">
              {complaints.slice(0, 5).map((c) => (
                <li key={c.id}><Link to={`/complaints/${c.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-700">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.title}</span><span className="text-xs text-slate-500">{c.complaint_code} · {fmtDate(c.created_at)}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={c.status} /><SlaBadge breached={c.sla_breached} status={c.status} /></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="My leave" icon={CalendarDays} actions={<Button size="xs" variant="subtle" to="/my/leaves?new=1">Apply leave</Button>}>
          {leaves.length === 0 ? <p className="text-sm text-slate-500">No leave requests.</p> : (
            <ul className="divide-y divide-slate-100">
              {leaves.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="block text-sm font-medium">{fmtDate(l.from_date)} → {fmtDate(l.to_date)}</span><span className="text-xs text-slate-500">{l.leave_code} · {l.destination}</span></span>
                  <StatusBadge status={l.overdue ? 'overdue' : l.status}>{l.overdue ? 'Return overdue' : undefined}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Announcements" icon={Megaphone} actions={<Link to="/announcements" className="text-xs font-medium text-brand-600">All</Link>}>
          {announcements.length === 0 ? <p className="text-sm text-slate-500">No announcements.</p> : (
            <ul className="space-y-3">
              {announcements.map((n) => (
                <li key={n.id}>
                  <div className="flex items-center gap-2"><p className="text-sm font-medium text-slate-800">{n.title}</p>{n.priority !== 'normal' && <StatusBadge status={n.priority} />}</div>
                  <p className="line-clamp-2 text-xs text-slate-600">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming activities" icon={Trophy} className="lg:col-span-3" actions={<Link to="/activities" className="text-xs font-medium text-brand-600">All activities</Link>}>
          {activities.length === 0 ? <p className="text-sm text-slate-500">No upcoming activities.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {activities.map((act) => (
                <li key={act.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">{act.title}</p>
                  <p className="text-xs text-slate-500">{fmtDateTime(act.start_at)} · {act.venue}</p>
                  {act.registered ? <Badge tone="green" className="mt-2">Registered</Badge> : <Badge className="mt-2">{label(act.category)}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
