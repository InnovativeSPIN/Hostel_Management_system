import { useState } from 'react';
import { Users, UserCheck, CalendarDays, AlertTriangle, LogOut, LogIn, UserPlus, Phone, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import { Card, StatCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDateTime, fmtTime, duration } from '../../utils/format';
import VisitorForm from './VisitorForm';
import { useVisitorActions } from './VisitorsPage';

export default function SecurityDashboard() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard/security');
  const [registering, setRegistering] = useState(false);
  const [returning, setReturning] = useState(null);
  const [pending, setPending] = useState(false);
  const { ask, dialog } = useVisitorActions(reload);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonCards count={4} />;
  const s = data.summary;

  const markLeave = async () => {
    setPending(true);
    try {
      await api.patch(`/leaves/${returning.leave.id}/${returning.type}`, {});
      toast.success(returning.type === 'return' ? `${returning.leave.name} marked returned` : `${returning.leave.name} departure recorded`);
      setReturning(null); reload();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Security Desk" subtitle="Who is currently inside? Live presence of students and visitors"
        actions={<>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={reload}>Refresh</Button>
          {can('visitors.manage') && <Button size="sm" icon={UserPlus} onClick={() => setRegistering(true)}>Register visitor</Button>}
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students inside" value={s.studentsInside} hint={`of ${s.residents} residents · ${s.outPass} on out-pass`} icon={Users} tone="green" />
        <StatCard label="Visitors inside" value={s.visitorsInside} hint={`${s.visitorsToday} today · ${s.visitorsExpected} expected`} icon={UserCheck} tone="blue" />
        <StatCard label="Students on leave" value={s.studentsOnLeave} icon={CalendarDays} />
        <StatCard label="Overdue returns" value={s.studentsOverdue} icon={AlertTriangle} tone={s.studentsOverdue ? 'red' : 'default'} />
      </div>
      {data.overdue.length > 0 && (
        <Card title={<span className="text-red-700">Overdue from leave — not yet back</span>} icon={AlertTriangle}>
          <ul className="divide-y divide-slate-100">
            {data.overdue.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div><p className="text-sm font-medium">{l.name} <span className="text-slate-500">· {l.register_number} · {l.hostel_code}-{l.room_number}</span></p>
                  <p className="text-xs text-red-600">Expected {fmtDateTime(l.expected_return_at)} · {l.hours_overdue}h overdue · {l.destination}</p></div>
                <div className="flex items-center gap-2">
                  {l.parent_phone && <a href={`tel:${l.parent_phone}`} className="flex items-center gap-1 text-xs font-medium text-brand-600"><Phone className="h-3.5 w-3.5" />Parent</a>}
                  {can('leaves.mark_return') && <Button size="xs" icon={LogIn} onClick={() => setReturning({ leave: l, type: 'return' })}>Mark returned</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Visitors inside (${data.visitorsInside.length})`} icon={UserCheck}>
          {data.visitorsInside.length === 0 ? <EmptyState title="No visitors inside" /> : (
            <ul className="divide-y divide-slate-100">
              {data.visitorsInside.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{v.name} <span className="font-normal text-slate-500">({v.relationship})</span></p>
                    <p className="text-xs text-slate-500">Meeting {v.student_name} · {v.hostel_code} · in since {fmtTime(v.entry_time)}</p></div>
                  <div className="flex shrink-0 items-center gap-2"><Badge tone={v.minutes_inside > 180 ? 'orange' : 'green'}>{duration(v.minutes_inside)}</Badge>
                    {can('visitors.manage') && <Button size="xs" variant="secondary" icon={LogOut} onClick={() => ask('check-out', { ...v, visitor_name: v.name })}>Out</Button>}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Expected visitors (${data.expected.length})`} icon={CalendarDays}>
          {data.expected.length === 0 ? <EmptyState title="No expected visitors" /> : (
            <ul className="divide-y divide-slate-100">
              {data.expected.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{v.name} <span className="font-normal text-slate-500">({v.relationship})</span></p>
                    <p className="text-xs text-slate-500">For {v.student_name} · {v.hostel_code} · {v.expected_at ? fmtDateTime(v.expected_at) : 'today'} · {v.pass_code}</p></div>
                  {can('visitors.manage') && <Button size="xs" icon={LogIn} onClick={() => ask('check-in', { ...v, visitor_name: v.name })}>Check in</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Students on approved leave (${data.onLeave.length})`} icon={CalendarDays}>
          {data.onLeave.length === 0 ? <EmptyState title="No students on leave" /> : (
            <ul className="divide-y divide-slate-100">
              {data.onLeave.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0"><b>{l.name}</b> <span className="text-slate-500">· {l.hostel_code}-{l.room_number}</span><span className="block text-xs text-slate-500">{l.destination} · back by {fmtDateTime(l.expected_return_at)}</span></span>
                  <span className="flex shrink-0 items-center gap-1">{l.departed_at ? <Badge tone="blue">Left {fmtTime(l.departed_at)}</Badge> : <Badge tone="yellow">Not departed</Badge>}
                    {can('leaves.mark_return') && <Button size="xs" variant="ghost" onClick={() => setReturning({ leave: l, type: l.departed_at ? 'return' : 'depart' })}>{l.departed_at ? 'Returned' : 'Departed'}</Button>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Leaving today (${data.departingToday.length})`} icon={LogOut}>
          {data.departingToday.length === 0 ? <EmptyState title="No departures scheduled today" /> : (
            <ul className="divide-y divide-slate-100">
              {data.departingToday.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span><b>{l.name}</b> <span className="text-slate-500">· {l.register_number} · {l.destination}</span></span>
                  {can('leaves.mark_return') && <Button size="xs" variant="secondary" onClick={() => setReturning({ leave: l, type: 'depart' })}>Record exit</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {registering && <VisitorForm onClose={() => setRegistering(false)} onDone={() => { setRegistering(false); reload(); }} />}
      {dialog}
      <ConfirmDialog open={!!returning} onClose={() => setReturning(null)} onConfirm={markLeave} loading={pending}
        title={returning?.type === 'return' ? `Mark ${returning.leave.name} as returned` : `Record ${returning?.leave.name}'s departure`}
        message={returning ? `Leave ${returning.leave.leave_code}` : ''} confirmLabel="Confirm" />
    </div>
  );
}
