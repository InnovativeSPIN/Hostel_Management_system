import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Save, CheckCheck, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Tabs, FilterSelect, FilterBar, SearchInput } from '../../components/ui/Misc';
import { ErrorState, PageLoader, EmptyState } from '../../components/ui/States';
import { AttendanceTrend } from '../../components/charts/Charts';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels } from '../../hooks/useLookups';
import api from '../../services/api';
import { fmtDate, label, todayStr, addDaysStr } from '../../utils/format';

const OPTIONS = [
  ['present', 'P', 'Present', 'bg-emerald-600'],
  ['absent', 'A', 'Absent', 'bg-red-600'],
  ['late', 'L', 'Late', 'bg-orange-500'],
  ['on_leave', 'OL', 'On leave', 'bg-blue-600'],
  ['medical_leave', 'ML', 'Medical leave', 'bg-teal-600'],
  ['on_duty', 'OD', 'On duty', 'bg-indigo-600'],
  ['out_pass', 'OP', 'Out pass', 'bg-purple-600'],
];

function Roster({ hostelId, date, session = 'morning' }) {
  const [floor, setFloor] = useState('');
  const { data, loading, error, reload } = useFetch('/attendance/roster', { hostelId, date, session });
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const m = {};
    data.students.forEach((s) => { m[s.student_id] = { status: s.status || (s.leave_id ? (s.leave_type === 'medical' ? 'medical_leave' : s.leave_type === 'on_duty' ? 'on_duty' : 'on_leave') : 'present'), checkInTime: s.check_in_time?.slice(0, 5) || '', remarks: s.remarks || '' }; });
    setMarks(m);
  }, [data]);

  const students = useMemo(() => (data?.students || []).filter((s) => !floor || String(s.floor_number) === floor), [data, floor]);
  const floors = [...new Set((data?.students || []).map((s) => s.floor_number))];
  const counts = OPTIONS.reduce((acc, [k]) => ({ ...acc, [k]: students.filter((s) => marks[s.student_id]?.status === k).length }), {});
  const set = (id, patch) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const save = async () => {
    // Front-end enforcement: Reason is mandatory for Absent
    const missingReason = students.find((s) => marks[s.student_id]?.status === 'absent' && (!marks[s.student_id]?.remarks || marks[s.student_id]?.remarks.trim().length < 3));
    if (missingReason) {
      toast.error(`Reason (at least 3 characters) is required when marking a student absent (${missingReason.name})`);
      return;
    }
    setSaving(true);
    try {
      const records = students.map((s) => ({ studentId: s.student_id, status: marks[s.student_id].status, checkInTime: marks[s.student_id].checkInTime || null, remarks: marks[s.student_id].remarks || null }));
      const overwrite = students.some((s) => s.attendance_id);
      const { data: res } = await api.post('/attendance', { hostelId: Number(hostelId), date, session, overwrite, records });
      toast.success(`Saved ${res.data.saved} record(s)${res.data.updated ? ` (${res.data.updated} updated)` : ''}`);
      if (res.data.adjusted?.length) toast(`${res.data.adjusted.length} mark(s) auto-adjusted: approved leave → On leave/OD, late check-in → Late`, { icon: 'ℹ️', duration: 6000 });
      reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  if (!data.students.length) return <EmptyState title="No residents on this date" />;
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <FilterSelect value={floor} onChange={setFloor} placeholder="All floors" options={floors.map((f) => ({ value: String(f), label: f === 0 ? 'Ground' : `Floor ${f}` }))} />
        <Badge tone={data.marked === data.total ? 'green' : 'yellow'}>{data.marked}/{data.total} already recorded</Badge>
        <div className="flex flex-wrap gap-1 text-xs">{OPTIONS.map(([k, , l]) => <Badge key={k}>{l}: {counts[k]}</Badge>)}</div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => students.forEach((s) => !s.leave_id && set(s.student_id, { status: 'present' }))}>All present</Button>
          <Button size="sm" icon={Save} loading={saving} onClick={save}>{data.marked ? 'Save changes' : 'Save attendance'}</Button>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {students.map((s) => {
          const m = marks[s.student_id] || {};
          return (
            <li key={s.student_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="w-56 min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-500">Room {s.room_number} · {s.register_number} · {s.department}</p>
                {s.leave_id && <Badge tone="blue" className="mt-0.5">Approved leave {s.leave_code}</Badge>}
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={`Status for ${s.name}`}>
                {OPTIONS.map(([k, short, l, bg]) => (
                  <button key={k} type="button" role="radio" aria-checked={m.status === k} title={l} onClick={() => set(s.student_id, { status: k })}
                    className={clsx('h-8 min-w-9 rounded-md border px-2 text-xs font-semibold', m.status === k ? `${bg} border-transparent text-white` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>{short}</button>
                ))}
              </div>
              <input type="time" aria-label="Check-in time" className="input w-28 py-1" value={m.checkInTime || ''} onChange={(e) => set(s.student_id, { checkInTime: e.target.value })} />
              <input aria-label="Remarks" className="input w-40 py-1" placeholder="Remarks" value={m.remarks || ''} onChange={(e) => set(s.student_id, { remarks: e.target.value })} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Records() {
  const hostels = useHostels();
  const [q, setQ] = useListState({ from: addDaysStr(todayStr(), -6), to: todayStr() });
  const { data, meta, loading, error, reload } = useFetch('/attendance', q);
  const trend = useFetch('/attendance/summary', { days: 30, hostelId: q.hostelId });
  return (
    <div className="space-y-5">
      <Card title="Attendance % — last 30 days"><AttendanceTrend data={trend.data} /></Card>
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-56" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student or register no" />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostels.map((h) => ({ value: h.id, label: h.name }))} />
          <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any status" options={OPTIONS.map(([k, , l]) => ({ value: k, label: l }))} />
          <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
          <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} dense columns={[
          { key: 'attendance_date', header: 'Date', render: (r) => fmtDate(r.attendance_date) },
          { key: 'student', header: 'Student', render: (r) => <Link to={`/students/${r.student_id}`} className="hover:text-brand-700">{r.student_name}<span className="block text-xs text-slate-500">{r.register_number} · {r.department}</span></Link> },
          { key: 'hostel_code', header: 'Hostel' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'check_in_time', header: 'Check-in', render: (r) => r.check_in_time?.slice(0, 5) || '—' },
          { key: 'remarks', header: 'Remarks', hideOnMobile: true },
          { key: 'marked_by', header: 'Marked by', hideOnMobile: true },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const hostels = useHostels();
  const [tab, setTab] = useState('mark');
  const [hostelId, setHostelId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('morning');
  useEffect(() => { if (!hostelId && hostels.length) setHostelId(String(hostels[0].id)); }, [hostels, hostelId]);
  return (
    <div>
      <PageHeader title="Attendance" subtitle={`Roll call · ${label(new Date().toLocaleDateString('en-IN', { weekday: 'long' }))}`} breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Attendance' }]}
        actions={<Button size="sm" variant="secondary" icon={AlertTriangle} to="/attendance/exceptions">Exception center</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'mark', label: 'Mark attendance' }, { value: 'records', label: 'Records & trend' }]} />
      {tab === 'mark' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="label">Hostel</span>
              <select className="input w-auto" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
            <label className="text-sm"><span className="label">Date</span>
              <input type="date" className="input w-auto" value={date} max={todayStr()} min={addDaysStr(todayStr(), -7)} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="text-sm"><span className="label">Session</span>
              <select className="input w-auto" value={session} onChange={(e) => setSession(e.target.value)}>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </select></label>
            <p className="pb-2 text-xs text-slate-500">Approved leave/OD is applied automatically; check-in after the late cut-off is marked Late. Reason mandatory for Absent.</p>
          </div>
          {hostelId && <Roster key={`${hostelId}-${date}-${session}`} hostelId={hostelId} date={date} session={session} />}
        </div>
      ) : <Records />}
    </div>
  );
}
