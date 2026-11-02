import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, BedDouble, CalendarCheck, IndianRupee, CalendarDays, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, DefinitionList, StatCard } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { StatusBadge, SlaBadge, Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Misc';
import { ErrorState, PageLoader, EmptyState } from '../../components/ui/States';
import AttendanceCalendar from '../../components/AttendanceCalendar';
import FeeLedger from '../../components/FeeLedger';
import { useFetch } from '../../hooks/useFetch';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, label, yearLabel, todayStr } from '../../utils/format';

export default function ParentChildPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/parents/children/${id}`);
  const [tab, setTab] = useState('overview');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  const { student: s, allocation: a, application, fees, attendance, leaves, complaints, visitors, payments, activities, exitRecord } = data;
  const overdue = leaves.find((l) => l.overdue);
  const current = leaves.find((l) => l.status === 'approved' && !l.returned_at && l.from_date <= todayStr());

  return (
    <div className="space-y-5">
      <PageHeader title={s.name} breadcrumbs={[{ label: 'My children', to: '/' }, { label: s.name }]}
        subtitle={`${s.register_number} · ${s.department_name} (${s.degree}) · ${yearLabel(s.year_of_study)}, Semester ${s.semester} · Batch ${s.batch}`} />

      {overdue && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />{s.name.split(' ')[0]} was expected back from leave by {fmtDateTime(overdue.expected_return_at)} and has not returned. Please contact the warden{a?.warden_phone ? ` on ${a.warden_phone}` : ''}.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Room" value={a ? `${a.hostel_code}-${a.room_number}` : '—'} hint={a ? a.bed_code : label(s.hostel_status)} icon={BedDouble} tone="blue" />
        <StatCard label="Attendance (month)" value={fmtPct(attendance.percentage)} hint={`${attendance.absent || 0} absent · ${attendance.on_leave || 0} on leave`} icon={CalendarCheck} tone={attendance.percentage < 75 && attendance.marked ? 'red' : 'green'} />
        <StatCard label="Fee outstanding" value={fmtMoney(fees.due)} hint={`${fmtMoney(fees.paid)} paid`} icon={IndianRupee} tone={fees.overdue ? 'red' : fees.due ? 'orange' : 'green'} />
        <StatCard label="Leave" value={current ? 'On leave' : overdue ? 'Overdue' : 'In hostel'} hint={current ? `Back by ${fmtDateTime(current.expected_return_at)}` : `${leaves.filter((l) => l.status === 'pending').length} pending request(s)`} icon={CalendarDays} tone={overdue ? 'red' : current ? 'blue' : 'default'} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Hostel stay' }, { value: 'attendance', label: 'Attendance' }, { value: 'fees', label: 'Fees', count: fees.items.length },
        { value: 'leaves', label: 'Leave', count: leaves.length }, { value: 'activities', label: 'Activities', count: activities.length },
        { value: 'complaints', label: 'Complaints', count: complaints.length }, { value: 'visitors', label: 'Visitors', count: visitors.length },
      ]} />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Room & hostel" icon={BedDouble}>
            {a ? (
              <div className="space-y-4">
                <DefinitionList items={[
                  ['Hostel', a.hostel_name], ['Floor', a.floor_label], ['Room', `${a.room_number} · ${label(a.room_type)}`], ['Bed', a.bed_code],
                  ['Amenities', [a.is_ac ? 'AC' : 'Non-AC', a.attached_bath ? 'Attached bath' : 'Common bath'].join(' · ')], ['Staying since', fmtDate(a.allocated_at)],
                  ['Roommates', a.roommates || 'None currently'], ['Warden', a.warden_name],
                ]} />
                {a.warden_phone && <a href={`tel:${a.warden_phone}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600"><Phone className="h-4 w-4" />Call warden ({a.warden_phone})</a>}
              </div>
            ) : <p className="text-sm text-slate-500">No room allocated. Hostel status: {label(s.hostel_status)}.</p>}
          </Card>
          <Card title="Admission & records">
            <DefinitionList items={[
              ['Admission', application ? <span key="a">{application.application_code} · <StatusBadge status={application.status} /></span> : '—'],
              ['Academic year', application?.academic_year], ['Faculty advisor', s.faculty_advisor], ['Emergency contact', s.emergency_contact_name ? `${s.emergency_contact_name} · ${s.emergency_contact_phone || ''}` : null],
              ['Blood group', s.blood_group], ['Medical notes', s.medical_notes],
              exitRecord && ['Hostel exit', <StatusBadge key="x" status={exitRecord.clearance_status} />],
            ]} />
            <p className="mt-4 text-xs text-slate-400">To correct any detail, please contact the hostel office.</p>
          </Card>
        </div>
      )}

      {tab === 'attendance' && <AttendanceCalendar url={`/parents/children/${id}/attendance`} />}

      {tab === 'fees' && <FeeLedger fees={fees.items} payments={payments} totals={{ billed: fees.total, paid: fees.paid, due: fees.due }} />}

      {tab === 'leaves' && (
        <div className="card">
          <DataTable rows={leaves} rowClassName={(l) => (l.overdue ? 'bg-red-50/50' : '')} empty={<EmptyState icon={CalendarDays} title="No leave requests" />} columns={[
            { key: 'leave_code', header: 'Leave', render: (l) => <span className="font-medium">{l.leave_code}<span className="block text-xs font-normal text-slate-500">{label(l.leave_type)} · applied {fmtDate(l.created_at)}</span></span> },
            { key: 'period', header: 'Period', render: (l) => <span>{fmtDate(l.from_date)} → {fmtDate(l.to_date)}<span className="block text-xs text-slate-500">Return by {fmtDateTime(l.expected_return_at)}</span></span> },
            { key: 'destination', header: 'Destination / reason', hideOnMobile: true, render: (l) => <span>{l.destination}<span className="block max-w-xs truncate text-xs text-slate-500">{l.reason}</span></span> },
            { key: 'gate', header: 'Left / returned', hideOnMobile: true, render: (l) => <span className="text-xs">{l.departed_at ? fmtDateTime(l.departed_at) : '—'}<span className="block">{l.returned_at ? `→ ${fmtDateTime(l.returned_at)}` : ''}</span></span> },
            { key: 'status', header: 'Status', render: (l) => <div className="flex flex-col items-start gap-1"><StatusBadge status={l.overdue ? 'overdue' : l.status}>{l.overdue ? 'Return overdue' : undefined}</StatusBadge>{l.review_remarks && <span className="text-xs text-slate-500">{l.reviewed_by}: {l.review_remarks}</span>}</div> },
          ]} />
        </div>
      )}

      {tab === 'activities' && (
        <div className="card">
          <DataTable rows={activities} empty={<EmptyState title="No activity registrations yet" />} columns={[
            { key: 'title', header: 'Activity', render: (r) => <span className="font-medium">{r.title}<span className="block text-xs font-normal text-slate-500">{label(r.category)}{r.venue ? ` · ${r.venue}` : ''}</span></span> },
            { key: 'start_at', header: 'When', render: (r) => fmtDateTime(r.start_at) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'attended', header: 'Participation', render: (r) => (r.status === 'completed' ? (r.attended ? <Badge tone="green">Attended</Badge> : <Badge>Did not attend</Badge>) : <Badge tone="blue">Registered</Badge>) },
          ]} />
        </div>
      )}

      {tab === 'complaints' && (
        <div className="card">
          <DataTable rows={complaints} empty={<EmptyState title="No complaints raised" />} columns={[
            { key: 'complaint_code', header: 'Complaint', render: (c) => <span><b>{c.complaint_code}</b> {c.title}<span className="block text-xs text-slate-500">{label(c.category)} · {fmtDate(c.created_at)}</span></span> },
            { key: 'priority', header: 'Priority', render: (c) => <StatusBadge status={c.priority} /> },
            { key: 'status', header: 'Status', render: (c) => <div className="flex flex-wrap gap-1"><StatusBadge status={c.status} /><SlaBadge breached={c.sla_breached} status={c.status} /></div> },
          ]} />
        </div>
      )}

      {tab === 'visitors' && (
        <div className="card">
          <DataTable rows={visitors} empty={<EmptyState title="No visitors recorded" />} columns={[
            { key: 'name', header: 'Visitor', render: (v) => <span><b>{v.name}</b><span className="block text-xs text-slate-500">{v.relationship} · {v.pass_code}</span></span> },
            { key: 'entry_time', header: 'Entry', render: (v) => fmtDateTime(v.entry_time || v.expected_at) },
            { key: 'exit_time', header: 'Exit', render: (v) => fmtDateTime(v.exit_time) },
            { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
          ]} />
        </div>
      )}
    </div>
  );
}
