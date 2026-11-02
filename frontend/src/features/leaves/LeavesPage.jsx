import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, X, LogIn, LogOut, FileText } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ConfirmDialog, Drawer } from '../../components/ui/Modal';
import { DefinitionList } from '../../components/ui/Card';
import { Tabs, SearchInput, FilterSelect, FilterBar, Timeline } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api, { download } from '../../services/api';
import { fmtDate, fmtDateTime, label, todayStr } from '../../utils/format';

export function LeaveDrawer({ id, onClose }) {
  const { data: l } = useFetch(id ? `/leaves/${id}` : null);
  return (
    <Drawer open={!!id} onClose={onClose} title={l ? `Leave ${l.leave_code}` : 'Leave'} description={l ? `${l.student_name} · ${l.register_number}` : ''}>
      {l && (
        <div className="space-y-5">
          <DefinitionList items={[
            ['Type', label(l.leave_type)], ['Status', <StatusBadge key="s" status={l.is_overdue ? 'overdue' : l.status}>{l.is_overdue ? 'Return overdue' : undefined}</StatusBadge>],
            ['From', fmtDate(l.from_date)], ['To', fmtDate(l.to_date)], ['Expected return', fmtDateTime(l.expected_return_at)], ['Destination', l.destination],
            ['Guardian contact', l.guardian_contact], ['Emergency contact', l.emergency_contact], ['Departed', fmtDateTime(l.departed_at)], ['Returned', fmtDateTime(l.returned_at)],
            ['Reviewed by', l.reviewed_by_name], ['Review remarks', l.review_remarks],
          ]} />
          <p className="rounded-lg bg-slate-50 p-3 text-sm"><b>Reason:</b> {l.reason}</p>
          {l.document_name && <Button size="sm" variant="secondary" icon={FileText} onClick={() => download(`/leaves/${l.id}/document`, null, l.document_original).catch((e) => toast.error(e.message))}>Supporting document</Button>}
          <div><h3 className="mb-2 text-sm font-semibold">History</h3>
            <Timeline steps={l.history.map((h) => ({ title: label(h.action), done: true, time: h.created_at, by: h.acted_by_name, note: h.remarks, tone: ['rejected', 'cancelled'].includes(h.to_status) ? 'red' : undefined }))} /></div>
        </div>
      )}
    </Drawer>
  );
}

export default function LeavesPage() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const hostels = useHostels();
  const [q, setQ] = useListState(params.get('overdue') ? {} : { status: 'pending' });
  const { data, meta, loading, error, reload } = useFetch('/leaves', q);
  const [action, setAction] = useState(null);
  const [pending, setPending] = useState(false);
  const [viewing, setViewing] = useState(params.get('highlight'));
  const tab = q.overdue === 'true' ? 'overdue' : q.current === 'true' ? 'current' : q.status || 'all';

  const run = async (remarks) => {
    const { type, leave } = action;
    setPending(true);
    try {
      const body = type === 'reject' ? { remarks } : remarks ? { remarks } : {};
      const { data: res } = await api.patch(`/leaves/${leave.id}/${type}`, body);
      toast.success({ approve: 'Leave approved; student notified', reject: 'Leave rejected', return: res.data.late ? 'Return recorded (late)' : 'Return recorded', depart: 'Departure recorded' }[type]);
      setAction(null);
      reload();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  const setTab = (t) => setQ({ status: ['pending', 'approved', 'returned', 'rejected'].includes(t) ? t : '', overdue: t === 'overdue' ? 'true' : '', current: t === 'current' ? 'true' : '' });
  return (
    <div>
      <PageHeader title="Leave Management" subtitle="Approvals, students currently away, and overdue returns" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Leave' }]} />
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[
        { value: 'pending', label: 'Awaiting approval' }, { value: 'current', label: 'Currently on leave' }, { value: 'overdue', label: 'Overdue returns' },
        { value: 'returned', label: 'Returned' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' },
      ]} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student, register no, LV code, destination" />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
          <FilterSelect value={q.leaveType} onChange={(v) => setQ({ leaveType: v })} placeholder="Any type" options={['home', 'medical', 'personal', 'academic', 'emergency'].map((t) => ({ value: t, label: label(t) }))} />
          <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
          <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} onRowClick={(r) => setViewing(r.id)}
          rowClassName={(r) => (r.is_overdue ? 'bg-red-50/50' : '')} columns={[
            { key: 'leave_code', header: 'Leave', render: (r) => <span className="font-medium">{r.leave_code}<span className="block text-xs font-normal text-slate-500">{label(r.leave_type)}</span></span> },
            { key: 'student', header: 'Student', render: (r) => <Link onClick={(e) => e.stopPropagation()} to={`/students/${r.student_id}`} className="hover:text-brand-700">{r.student_name}<span className="block text-xs text-slate-500">{r.register_number} · {r.hostel_code}-{r.room_number}</span></Link> },
            { key: 'period', header: 'Period', render: (r) => <span>{fmtDate(r.from_date)} → {fmtDate(r.to_date)}<span className="block text-xs text-slate-500">Return by {fmtDateTime(r.expected_return_at)}</span></span> },
            { key: 'destination', header: 'Destination', hideOnMobile: true },
            { key: 'status', header: 'Status', render: (r) => <div className="flex flex-col items-start gap-1"><StatusBadge status={r.status} />{r.is_overdue ? <Badge tone="red">Overdue {r.hours_overdue}h</Badge> : null}{r.departed_at && r.status === 'approved' && <Badge tone="blue">Departed</Badge>}</div> },
            { key: 'act', header: '', render: (r) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
                {r.status === 'pending' && can('leaves.review') && <><Button size="xs" variant="success" icon={Check} onClick={() => setAction({ type: 'approve', leave: r })}>Approve</Button><Button size="xs" variant="ghost" icon={X} onClick={() => setAction({ type: 'reject', leave: r })}>Reject</Button></>}
                {r.status === 'approved' && !r.departed_at && r.from_date <= todayStr() && can('leaves.mark_return') && <Button size="xs" variant="secondary" icon={LogOut} onClick={() => setAction({ type: 'depart', leave: r })}>Departed</Button>}
                {r.status === 'approved' && can('leaves.mark_return') && <Button size="xs" variant="secondary" icon={LogIn} onClick={() => setAction({ type: 'return', leave: r })}>Returned</Button>}
              </div>
            ) },
          ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      <ConfirmDialog open={!!action} onClose={() => setAction(null)} loading={pending} onConfirm={run}
        tone={action?.type === 'reject' ? 'danger' : action?.type === 'approve' ? 'success' : 'primary'}
        title={action && `${label(action.type === 'depart' ? 'record departure' : action.type === 'return' ? 'record return' : action.type)} · ${action.leave.leave_code}`}
        message={action && `${action.leave.student_name}: ${fmtDate(action.leave.from_date)} → ${fmtDate(action.leave.to_date)}, ${action.leave.destination}. ${action.type === 'approve' ? 'Attendance in this period will show On leave.' : ''}`}
        confirmLabel={action ? label(action.type === 'depart' ? 'confirm departure' : action.type === 'return' ? 'confirm return' : action.type) : ''}
        reasonLabel={action?.type === 'reject' ? 'Reason (shared with student)' : action?.type === 'approve' ? 'Remarks (optional)' : undefined}
        reasonRequired={action?.type === 'reject'} />
      <LeaveDrawer id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
