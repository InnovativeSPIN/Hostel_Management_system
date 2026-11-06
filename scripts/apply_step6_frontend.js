const fs = require('fs');
const path = require('path');

const attPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'attendance', 'AttendancePage.jsx');
let attContent = fs.readFileSync(attPath, 'utf8');

if (!attContent.includes('SessionAttendance')) {
  // Add new tab in AttendancePage
  attContent = attContent.replace(
    "tabs={[{ value: 'mark', label: 'Mark attendance' }, { value: 'records', label: 'Records & trend' }]}",
    "tabs={[\r\n        { value: 'mark', label: 'Legacy Roll Call' },\r\n        { value: 'sessions', label: '2-Session Attendance (Morning / Evening)' },\r\n        { value: 'session_reports', label: 'Session Reports' },\r\n        { value: 'records', label: 'Legacy Records' },\r\n      ]}"
  );

  // Add the 2-Session Attendance and Reports components before AttendancePage export
  const sessionComponents = `
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
        toast.error(\`Please provide a reason for absent student: \${s.name}\`);
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
          blockName: s.hostel_code ? \`Block \${s.hostel_code}\` : 'Main Block',
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

      toast.success(\`Saved \${session} attendance for \${res.data.saved} student(s)\`);
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
                        className={clsx('h-8 min-w-9 rounded-md border px-2 text-xs font-bold transition-all', m.status === k ? \`\${bg} border-transparent text-white shadow-2xs\` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
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
`;

  attContent = attContent.replace(
    'export default function AttendancePage()',
    `${sessionComponents}\r\nexport default function AttendancePage()`
  );

  // Render SessionAttendance and SessionReports tabs
  const tabConditions = `
      {tab === 'sessions' && <SessionAttendance hostels={hostels} />}
      {tab === 'session_reports' && <SessionReports hostels={hostels} />}
`;

  attContent = attContent.replace(
    `{tab === 'mark' ? (`,
    `${tabConditions}\r\n      {tab === 'mark' ? (`
  );

  fs.writeFileSync(attPath, attContent, 'utf8');
  console.log('AttendancePage.jsx updated with SessionAttendance and SessionReports tabs');
}
