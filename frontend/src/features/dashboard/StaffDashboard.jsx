import { Link } from 'react-router-dom';
import { MessageSquareWarning, Hammer, CalendarCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, Meter } from '../../components/ui/Card';
import { StatusBadge, SlaBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, timeAgo } from '../../utils/format';

export default function StaffDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard/staff');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonCards />;
  return (
    <div className="space-y-5">
      <PageHeader title="My Work" subtitle={`${user.designation || user.roleLabel} · assigned complaints, maintenance and today's roll call`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Assigned complaints (${data.complaints.length})`} icon={MessageSquareWarning} actions={<Link to="/complaints" className="text-xs font-medium text-brand-600">All</Link>}>
          {data.complaints.length === 0 ? <EmptyState title="No open complaints assigned" /> : (
            <ul className="divide-y divide-slate-100">
              {data.complaints.map((c) => (
                <li key={c.id}><Link to={`/complaints/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="text-xs text-slate-500">{c.complaint_code} · Hostel {c.hostel_code}{c.room_number ? `, Room ${c.room_number}` : ''} · SLA {fmtDateTime(c.sla_due_at)}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={c.priority} /><SlaBadge breached={c.sla_breached} status={c.status} /></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Maintenance (${data.maintenance.length})`} icon={Hammer} actions={<Link to="/maintenance" className="text-xs font-medium text-brand-600">Open</Link>}>
          {data.maintenance.length === 0 ? <EmptyState title="No open maintenance" /> : (
            <ul className="divide-y divide-slate-100">
              {data.maintenance.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{m.title}</span>
                    <span className="text-xs text-slate-500">{m.request_code} · Hostel {m.hostel_code}{m.room_number ? `, Room ${m.room_number}` : ''} · {timeAgo(m.created_at)}</span></span>
                  <span className="flex shrink-0 gap-1"><StatusBadge status={m.priority} /><StatusBadge status={m.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Today's roll call" icon={CalendarCheck} className="lg:col-span-2" actions={<Button size="xs" variant="subtle" to="/attendance">Mark attendance</Button>}>
          <div className="grid gap-4 sm:grid-cols-3">
            {data.attendance.map((h) => (
              <div key={h.id}>
                <div className="flex justify-between text-sm"><span className="font-medium text-slate-700">{h.name}</span><span className="tabular-nums text-slate-600">{h.marked}/{h.residents}</span></div>
                <Meter className="mt-1.5" value={h.residents ? (h.marked / h.residents) * 100 : 100} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
