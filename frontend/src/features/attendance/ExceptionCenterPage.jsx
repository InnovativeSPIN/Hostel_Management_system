import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Search, CheckCircle2, Phone } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Select, Textarea } from '../../components/ui/Field';
import { FilterSelect, FilterBar } from '../../components/ui/Misc';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { label, todayStr } from '../../utils/format';

const TYPES = {
  leave_overdue: ['Leave return overdue', 'red'], absent_with_leave: ['Absent despite approved leave', 'purple'], repeated_absence: ['Repeated absence', 'orange'],
  absent: ['Absent', 'red'], not_marked: ['Not marked', 'yellow'], low_attendance: ['Low attendance', 'yellow'],
};

function Tile({ value, text, tone, active, onClick }) {
  const tones = { red: 'border-red-200 bg-red-50 text-red-700', orange: 'border-orange-200 bg-orange-50 text-orange-700', yellow: 'border-amber-200 bg-amber-50 text-amber-800', green: 'border-emerald-200 bg-emerald-50 text-emerald-700', purple: 'border-purple-200 bg-purple-50 text-purple-700' };
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={clsx('rounded-xl border p-3 text-left transition', tones[tone], active && 'ring-2 ring-brand-500')}>
      <p className="text-2xl font-bold tabular-nums">{value}</p><p className="text-xs font-medium">{text}</p>
    </button>
  );
}

function ResolveModal({ item, onClose, onDone }) {
  const [status, setStatus] = useState(item.status === 'open' ? 'investigating' : 'resolved');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try { await api.patch(`/attendance/exceptions/${item.id}`, { status, notes }); toast.success('Exception updated'); onDone(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`${TYPES[item.exception_type][0]} · ${item.student_name}`} description={item.details}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={notes.trim().length < 3}>Update</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm">
          {item.phone && <a className="flex items-center gap-1 text-brand-600" href={`tel:${item.phone}`}><Phone className="h-4 w-4" />Student {item.phone}</a>}
          {item.parent_phone && <a className="flex items-center gap-1 text-brand-600" href={`tel:${item.parent_phone}`}><Phone className="h-4 w-4" />Parent {item.parent_phone}</a>}
        </div>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'investigating', label: 'Investigating' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed (false alarm)' }]} />
        <Textarea label="Notes" required value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Spoke to parent; student at home with fever, returning tomorrow" />
      </div>
    </Modal>
  );
}

export default function ExceptionCenterPage() {
  const { can } = useAuth();
  const hostels = useHostels();
  const [q, setQ] = useListState({ date: todayStr() });
  const { data, loading, error, reload } = useFetch('/attendance/exceptions', { date: q.date, hostelId: q.hostelId, status: q.status });
  const [resolving, setResolving] = useState(null);
  const type = q.type || '';
  const items = (data?.items || []).filter((i) => !type || i.exception_type === type);
  const sm = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader title="Attendance Exception Center" subtitle="Students who need attention today — investigate each one. Alerts, not disciplinary decisions."
        breadcrumbs={[{ label: 'Attendance', to: '/attendance' }, { label: 'Exceptions' }]} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Date" className="input w-auto py-1.5" value={q.date} max={todayStr()} onChange={(e) => setQ({ date: e.target.value })} />
        <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
        <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any status" options={['open', 'investigating', 'resolved', 'dismissed'].map((s) => ({ value: s, label: label(s) }))} />
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!sm ? <SkeletonCards count={6} /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
          <Tile value={sm.absent} text="Absent" tone="red" active={type === 'absent'} onClick={() => setQ({ type: type === 'absent' ? '' : 'absent' })} />
          <Tile value={sm.leaveOverdue} text="Overdue from leave" tone="red" active={type === 'leave_overdue'} onClick={() => setQ({ type: type === 'leave_overdue' ? '' : 'leave_overdue' })} />
          <Tile value={sm.repeatedAbsence} text="Repeated absence" tone="orange" active={type === 'repeated_absence'} onClick={() => setQ({ type: type === 'repeated_absence' ? '' : 'repeated_absence' })} />
          <Tile value={sm.absentWithLeave} text="Absent with leave" tone="purple" active={type === 'absent_with_leave'} onClick={() => setQ({ type: type === 'absent_with_leave' ? '' : 'absent_with_leave' })} />
          <Tile value={sm.lowAttendance} text="Low attendance" tone="yellow" active={type === 'low_attendance'} onClick={() => setQ({ type: type === 'low_attendance' ? '' : 'low_attendance' })} />
          <Tile value={sm.notMarked} text="Not marked" tone="yellow" active={type === 'not_marked'} onClick={() => setQ({ type: type === 'not_marked' ? '' : 'not_marked' })} />
          <Tile value={sm.onApprovedLeave} text="On approved leave" tone="green" />
        </div>
      )}

      {type !== 'not_marked' && (
        <div className="card">
          <FilterBar><span className="text-sm text-slate-600">{items.length} exception(s){type ? ` · ${TYPES[type][0]}` : ''}</span>{type && <Button size="xs" variant="ghost" onClick={() => setQ({ type: '' })}>Clear filter</Button>}</FilterBar>
          <DataTable rows={items} loading={loading} empty={<EmptyState icon={CheckCircle2} title="No exceptions" message="Everyone is accounted for." />}
            rowClassName={(r) => (['resolved', 'dismissed'].includes(r.status) ? 'opacity-60' : '')} columns={[
              { key: 'type', header: 'Exception', render: (r) => <Badge tone={TYPES[r.exception_type][1]}>{TYPES[r.exception_type][0]}</Badge> },
              { key: 'student', header: 'Student', render: (r) => <Link to={`/students/${r.student_id}`} className="hover:text-brand-700"><b>{r.student_name}</b><span className="block text-xs text-slate-500">{r.register_number} · {r.department} · {r.hostel_code}-{r.room_number || '—'}</span></Link> },
              { key: 'details', header: 'Details', render: (r) => <span className="text-sm">{r.details}{r.resolution_notes && <span className="block text-xs text-slate-500">↳ {r.resolution_notes}{r.resolved_by_name ? ` (${r.resolved_by_name})` : ''}</span>}</span> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'act', header: '', render: (r) => can('attendance.resolve') && !['resolved', 'dismissed'].includes(r.status) && <Button size="xs" variant="secondary" icon={Search} onClick={() => setResolving(r)}>Investigate</Button> },
            ]} />
        </div>
      )}

      {(type === 'not_marked' || !type) && data?.notMarked?.length > 0 && (
        <Card title={`Attendance not yet recorded (${data.notMarked.length})`} actions={<Button size="xs" variant="subtle" to="/attendance">Mark now</Button>}>
          <div className="flex flex-wrap gap-2">{data.notMarked.map((s) => <Badge key={s.student_id} tone="yellow">{s.name} · {s.hostel_code}-{s.room_number}</Badge>)}</div>
        </Card>
      )}
      {resolving && <ResolveModal item={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); reload(); }} />}
    </div>
  );
}
