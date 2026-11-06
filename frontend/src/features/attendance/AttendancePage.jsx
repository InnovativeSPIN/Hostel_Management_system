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
import { Tabs, FilterSelect, FilterBar, SearchInput, Avatar } from '../../components/ui/Misc';
import { ErrorState, PageLoader, EmptyState } from '../../components/ui/States';
import { AttendanceTrend } from '../../components/charts/Charts';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels } from '../../hooks/useLookups';
import api from '../../services/api';
import { fmtDate, label, todayStr, addDaysStr } from '../../utils/format';

const OPTIONS = [
  ['present', 'P', 'Present', 'bg-emerald-600'], ['absent', 'A', 'Absent', 'bg-red-600'], ['late', 'L', 'Late', 'bg-orange-500'],
  ['on_leave', 'OL', 'On leave', 'bg-blue-600'], ['out_pass', 'OP', 'Out pass', 'bg-purple-600'],
];

function Roster({ hostelId, date }) {
  const [floor, setFloor] = useState('');
  const { data, loading, error, reload } = useFetch('/attendance/roster', { hostelId, date });
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const m = {};
    data.students.forEach((s) => { m[s.student_id] = { status: s.status || (s.leave_id ? 'on_leave' : 'present'), checkInTime: s.check_in_time?.slice(0, 5) || '', remarks: s.remarks || '' }; });
    setMarks(m);
  }, [data]);

  const students = useMemo(() => (data?.students || []).filter((s) => !floor || String(s.floor_number) === floor), [data, floor]);
  const floors = [...new Set((data?.students || []).map((s) => s.floor_number))];
  const counts = OPTIONS.reduce((acc, [k]) => ({ ...acc, [k]: students.filter((s) => marks[s.student_id]?.status === k).length }), {});
  const set = (id, patch) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const records = students.map((s) => ({ studentId: s.student_id, status: marks[s.student_id].status, checkInTime: marks[s.student_id].checkInTime || null, remarks: marks[s.student_id].remarks || null }));
      const overwrite = students.some((s) => s.attendance_id);
      const { data: res } = await api.post('/attendance', { hostelId: Number(hostelId), date, overwrite, records });
      toast.success(`Saved ${res.data.saved} record(s)${res.data.updated ? ` (${res.data.updated} updated)` : ''}`);
      if (res.data.adjusted.length) toast(`${res.data.adjusted.length} mark(s) auto-adjusted: approved leave → On leave, late check-in → Late`, { icon: 'ℹ️', duration: 6000 });
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
              <div className="flex items-center gap-2.5 w-60 min-w-0 flex-1">
                <Avatar name={s.name} src={s.photo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-500">Room {s.room_number} · {s.register_number} · {s.department}</p>
                  {s.leave_id && <Badge tone="blue" className="mt-0.5">Approved leave {s.leave_code}</Badge>}
                </div>
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
          { key: 'student', header: 'Student', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.student_name} src={r.photo_url} size="xs" /><Link to={`/students/${r.student_id}`} className="hover:text-brand-700">{r.student_name}<span className="block text-xs text-slate-500">{r.register_number} · {r.department}</span></Link></div> },
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


const SESSION_STATUS_OPTIONS = [
  ['Present', 'P', 'Present', 'bg-emerald-600'],
  ['Absent', 'A', 'Absent', 'bg-red-600'],
  ['Leave', 'L', 'Leave', 'bg-blue-600'],
  ['Medical Leave', 'ML', 'Medical Leave', 'bg-teal-600'],
  ['On Duty', 'OD', 'On Duty (OD)', 'bg-indigo-600'],
];

function SessionAttendance({ hostels }) {
  const [hostelId, setHostelId] = useState(hostels[0]?.id ? String(hostels[0].id) : '');
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('Morning');
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useFetch(hostelId ? '/attendance/sessions/roster' : null, { hostelId, date, session });

  useEffect(() => {
    if (!data?.students) return;
    const initial = {};
    data.students.forEach((s) => {
      initial[s.student_id] = {
        status: s.status || 'Present',
        absentReason: s.absentReason || '',
        remarks: s.remarks || '',
        autoFilled: s.autoFilled || false,
        leaveId: s.leaveId || null,
        roomId: s.room_id || null,
      };
    });
    setMarks(initial);
  }, [data]);

  const setMark = (sid, patch) => {
    setMarks((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch } }));
  };

  const markAllPresent = () => {
    setMarks((prev) => {
      const next = { ...prev };
      (data?.students || []).forEach((s) => {
        if (!s.autoFilled) {
          next[s.student_id] = { ...next[s.student_id], status: 'Present', absentReason: '' };
        }
      });
      return next;
    });
  };

  const save = async () => {
    const students = data?.students || [];
    // Validation: reason is mandatory for Absent
    for (const s of students) {
      const m = marks[s.student_id];
      if (m?.status === 'Absent' && (!m.absentReason || m.absentReason.trim().length < 2)) {
        toast.error(`Please provide a reason for absent student: ${s.name}`);
        return;
      }
    }

    setSaving(true);
    try {
      const records = students.map((s) => {
        const m = marks[s.student_id] || {};
        return {
          studentId: s.student_id,
          roomId: s.room_id || null,
          blockName: s.hostel_code ? `Block ${s.hostel_code}` : 'Main Block',
          status: m.status || 'Present',
          absentReason: m.status === 'Absent' ? m.absentReason : null,
          remarks: m.remarks || null,
          autoFilled: m.autoFilled || false,
          leaveId: m.leaveId || null,
        };
      });

      const { data: res } = await api.post('/attendance/sessions/save', {
        hostelId: Number(hostelId),
        date,
        session,
        records,
      });

      toast.success(`Saved ${session} attendance for ${res.data.saved} student(s)`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const counts = SESSION_STATUS_OPTIONS.reduce(
    (acc, [k]) => ({ ...acc, [k]: Object.values(marks).filter((m) => m.status === k).length }),
    {}
  );

  return (
    <div className="space-y-4">
      {/* Session Controls */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            <span className="label">Hostel / Block</span>
            <select className="input w-auto font-medium" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Attendance Date</span>
            <input type="date" className="input w-auto font-medium" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div>
            <span className="label block text-sm">Session</span>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button type="button" onClick={() => setSession('Morning')}
                className={clsx('rounded-md px-3 py-1 text-xs font-bold transition-all', session === 'Morning' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900')}>
                ☀ Morning Session
              </button>
              <button type="button" onClick={() => setSession('Evening')}
                className={clsx('rounded-md px-3 py-1 text-xs font-bold transition-all', session === 'Evening' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900')}>
                🌙 Evening Session
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={CheckCheck} onClick={markAllPresent}>All Present</Button>
          <Button size="sm" icon={Save} loading={saving} onClick={save}>Save {session} Attendance</Button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="blue">{session} Session</Badge>
        <Badge tone={data?.markedCount === data?.totalCount && data?.totalCount > 0 ? 'green' : 'yellow'}>
          {data?.markedCount || 0} / {data?.totalCount || 0} Recorded
        </Badge>
        {SESSION_STATUS_OPTIONS.map(([k, , label, bg]) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 shadow-2xs">
            <span className={clsx('h-2 w-2 rounded-full', bg)} />
            {label}: <b>{counts[k] || 0}</b>
          </span>
        ))}
      </div>

      {loading && !data && <PageLoader />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.students.map((s) => {
              const m = marks[s.student_id] || {};
              const isAbsent = m.status === 'Absent';
              return (
                <li key={s.student_id} className={clsx('flex flex-wrap items-center gap-3 p-3 transition-colors', isAbsent ? 'bg-red-50/50' : 'hover:bg-slate-50/60')}>
                  <div className="flex items-center gap-3 w-64 min-w-0 flex-1">
                    <Avatar name={s.name} src={s.photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">Room {s.room_number || '—'} · {s.register_number} · {s.department}</p>
                      {s.leaveCode && (
                        <Badge tone={s.status === 'On Duty' ? 'purple' : s.status === 'Medical Leave' ? 'teal' : 'blue'} className="mt-0.5">
                          Approved {s.status}: {s.leaveCode}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 5 Status Radios */}
                  <div className="flex gap-1" role="radiogroup">
                    {SESSION_STATUS_OPTIONS.map(([k, short, l, bg]) => (
                      <button key={k} type="button" title={l} onClick={() => setMark(s.student_id, { status: k })}
                        className={clsx('h-8 min-w-9 rounded-md border px-2 text-xs font-bold transition-all', m.status === k ? `${bg} border-transparent text-white shadow-2xs` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                        {short}
                      </button>
                    ))}
                  </div>

                  {/* Mandatory Reason for Absent */}
                  {isAbsent && (
                    <div className="w-56 min-w-0">
                      <input aria-label="Absent reason" className="input border-red-300 bg-white py-1 text-xs text-red-900 placeholder:text-red-300 focus:border-red-500"
                        placeholder="Reason mandatory *" value={m.absentReason || ''} onChange={(e) => setMark(s.student_id, { absentReason: e.target.value })} required />
                    </div>
                  )}

                  {/* Optional Remarks */}
                  <div className="w-40 min-w-0">
                    <input aria-label="Remarks" className="input py-1 text-xs" placeholder="Remarks" value={m.remarks || ''} onChange={(e) => setMark(s.student_id, { remarks: e.target.value })} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SessionReports({ hostels }) {
  const [reportType, setReportType] = useState('day');
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [hostelId, setHostelId] = useState('');

  const dayReport = useFetch('/attendance/sessions/report/day', { date, hostelId });
  const monthReport = useFetch('/attendance/sessions/report/month', { yearMonth: month, hostelId });
  const blockReport = useFetch('/attendance/sessions/report/block', { date });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={reportType} onChange={setReportType}
          tabs={[
            { value: 'day', label: 'Daily Session Report' },
            { value: 'month', label: 'Monthly Trend' },
            { value: 'block', label: 'Block Comparison' },
          ]} />
        <div className="flex items-center gap-2">
          {reportType === 'day' && <input type="date" className="input w-auto py-1" value={date} onChange={(e) => setDate(e.target.value)} />}
          {reportType === 'month' && <input type="month" className="input w-auto py-1" value={month} onChange={(e) => setMonth(e.target.value)} />}
          <select className="input w-auto py-1" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            <option value="">All Hostels</option>
            {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>

      {reportType === 'day' && dayReport.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <span className="text-xs text-slate-500">Total Recorded</span>
              <p className="text-xl font-bold text-slate-900">{dayReport.data.stats.total}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
              <span className="text-xs text-emerald-700">Present</span>
              <p className="text-xl font-bold text-emerald-800">{dayReport.data.stats.present}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-center">
              <span className="text-xs text-red-700">Absent</span>
              <p className="text-xl font-bold text-red-800">{dayReport.data.stats.absent}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-center">
              <span className="text-xs text-blue-700">Leave</span>
              <p className="text-xl font-bold text-blue-800">{dayReport.data.stats.leave}</p>
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-center">
              <span className="text-xs text-teal-700">Medical</span>
              <p className="text-xl font-bold text-teal-800">{dayReport.data.stats.medicalLeave}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-center">
              <span className="text-xs text-indigo-700">On Duty (OD)</span>
              <p className="text-xl font-bold text-indigo-800">{dayReport.data.stats.onDuty}</p>
            </div>
          </div>

          {/* Absentees with Mandatory Reasons */}
          <div className="card">
            <div className="border-b border-slate-100 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Absentees & Mandatory Reasons ({dayReport.data.absentees.length})</h3>
            </div>
            {dayReport.data.absentees.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No absentees recorded on this date.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dayReport.data.absentees.map((a) => (
                  <li key={a.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <span className="font-semibold text-slate-900">{a.student_name}</span>
                      <span className="block text-slate-500">{a.register_number} · Room {a.room_number || '—'} · {a.block_name} · {a.session}</span>
                    </div>
                    <div className="text-right">
                      <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-800">Reason: {a.absent_reason}</span>
                      {a.remarks && <span className="block text-slate-500">{a.remarks}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {reportType === 'month' && monthReport.data && (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Date</th>
                <th>Session</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Leave</th>
                <th>Medical</th>
                <th>On Duty</th>
                <th>Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthReport.data.days.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2 font-medium">{d.date}</td>
                  <td><Badge tone={d.session === 'Morning' ? 'orange' : 'indigo'}>{d.session}</Badge></td>
                  <td className="font-semibold text-emerald-700">{d.present}</td>
                  <td className="font-semibold text-red-700">{d.absent}</td>
                  <td>{d.leave}</td>
                  <td>{d.medicalLeave}</td>
                  <td>{d.onDuty}</td>
                  <td><b className={d.percentage < 75 ? 'text-red-700' : 'text-emerald-700'}>{d.percentage}%</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportType === 'block' && blockReport.data && (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Block Name</th>
                <th>Total Students</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Leave</th>
                <th>Medical</th>
                <th>On Duty</th>
                <th>Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {blockReport.data.blocks.map((b, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2.5 font-bold text-slate-900">{b.blockName}</td>
                  <td>{b.total}</td>
                  <td className="font-semibold text-emerald-700">{b.present}</td>
                  <td className="font-semibold text-red-700">{b.absent}</td>
                  <td>{b.leave}</td>
                  <td>{b.medicalLeave}</td>
                  <td>{b.onDuty}</td>
                  <td><b className={b.percentage < 75 ? 'text-red-700' : 'text-emerald-700'}>{b.percentage}%</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const hostels = useHostels();
  const [tab, setTab] = useState('mark');
  const [hostelId, setHostelId] = useState('');
  const [date, setDate] = useState(todayStr());
  useEffect(() => { if (!hostelId && hostels.length) setHostelId(String(hostels[0].id)); }, [hostels, hostelId]);
  return (
    <div>
      <PageHeader title="Attendance" subtitle={`Roll call · ${label(new Date().toLocaleDateString('en-IN', { weekday: 'long' }))}`} breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Attendance' }]}
        actions={<Button size="sm" variant="secondary" icon={AlertTriangle} to="/attendance/exceptions">Exception center</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { value: 'mark', label: 'Legacy Roll Call' },
        { value: 'sessions', label: '2-Session Attendance (Morning / Evening)' },
        { value: 'session_reports', label: 'Session Reports' },
        { value: 'records', label: 'Legacy Records' },
      ]} />
      
      {tab === 'sessions' && <SessionAttendance hostels={hostels} />}
      {tab === 'session_reports' && <SessionReports hostels={hostels} />}

      {tab === 'mark' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="label">Hostel</span>
              <select className="input w-auto" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
            <label className="text-sm"><span className="label">Date</span>
              <input type="date" className="input w-auto" value={date} max={todayStr()} min={addDaysStr(todayStr(), -7)} onChange={(e) => setDate(e.target.value)} /></label>
            <p className="pb-2 text-xs text-slate-500">Approved leave is applied automatically; check-in after the late cut-off is marked Late. Older dates need an administrator.</p>
          </div>
          {hostelId && <Roster key={`${hostelId}-${date}`} hostelId={hostelId} date={date} />}
        </div>
      ) : <Records />}
    </div>
  );
}