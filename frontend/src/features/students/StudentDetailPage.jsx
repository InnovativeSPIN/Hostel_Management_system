import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Pencil, BedDouble, IndianRupee, CalendarCheck, CalendarDays, MessageSquareWarning, UserCheck, Phone, Mail, ArrowRightLeft, History } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, DefinitionList, StatCard } from '../../components/ui/Card';
import { StatusBadge, SlaBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { Tabs, Avatar } from '../../components/ui/Misc';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct, label, yearLabel } from '../../utils/format';
import StudentForm from './StudentForm';
import ParentsCard from './ParentsCard';

export default function StudentDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, loading, error, reload } = useFetch(`/students/${id}`);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  const { student: s, allocation: a, application, fees, attendance, leaves, complaints, transfers, visitors, exitRecord } = data;
  const overdue = leaves.find((l) => l.overdue);

  return (
    <div className="space-y-5">
      <PageHeader title={s.name} breadcrumbs={[{ label: 'Students', to: '/students' }, { label: s.register_number }]}
        subtitle={`${s.register_number} · ${s.department_name} (${s.degree}) · ${yearLabel(s.year_of_study)}, Sem ${s.semester} · Batch ${s.batch}`}
        actions={<>
          {['approved'].includes(s.hostel_status) && can('allocations.manage') && <Button size="sm" icon={BedDouble} to={`/allocations?studentId=${s.id}`}>Allocate bed</Button>}
          {a && can('allocations.manage') && <Button size="sm" variant="secondary" icon={ArrowRightLeft} to={`/allocations?transfer=${a.id}`}>Transfer</Button>}
          {can('students.manage') && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
        </>} />

      <div className="card flex flex-wrap items-center gap-4 p-4">
        <Avatar name={s.name} className="h-12 w-12 text-base" />
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={s.hostel_status} />
          {s.account_status !== 'active' && <StatusBadge status={s.account_status}>Account {s.account_status}</StatusBadge>}
          {overdue && <StatusBadge status="overdue">Leave return overdue</StatusBadge>}
          {fees.overdue && <StatusBadge status="overdue">Fee overdue</StatusBadge>}
        </div>
        <div className="ml-auto flex flex-wrap gap-4 text-sm">
          <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-600"><Phone className="h-4 w-4" />{s.phone}</a>
          <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-600"><Mail className="h-4 w-4" />{s.email}</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bed" value={a ? a.bed_code : '—'} hint={a ? a.hostel_name : 'No allocation'} icon={BedDouble} tone="blue" />
        <StatCard label="Attendance (month)" value={fmtPct(attendance.percentage)} hint={`${attendance.absent || 0} absent · ${attendance.on_leave || 0} on leave`} icon={CalendarCheck} tone={attendance.percentage < 75 && attendance.marked ? 'red' : 'green'} />
        <StatCard label="Fee outstanding" value={fmtMoney(fees.due)} hint={`${fmtMoney(fees.paid)} paid of ${fmtMoney(fees.total)}`} icon={IndianRupee} tone={fees.overdue ? 'red' : fees.due ? 'orange' : 'green'} />
        <StatCard label="Open complaints" value={complaints.filter((c) => ['pending', 'assigned', 'in_progress'].includes(c.status)).length} icon={MessageSquareWarning} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Profile' }, { value: 'hostel', label: 'Hostel & history' }, { value: 'fees', label: 'Fees', count: fees.items.length },
        { value: 'leaves', label: 'Leave', count: leaves.length }, { value: 'complaints', label: 'Complaints', count: complaints.length }, { value: 'visitors', label: 'Visitors', count: visitors.length },
      ]} />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Academic">
            <DefinitionList items={[
              ['Department', s.department_name], ['HoD', s.hod_name], ['Year / Semester', `${s.year_of_study} / ${s.semester}`], ['Section', s.section],
              ['Batch', s.batch], ['Roll number', s.roll_number], ['Admission quota', label(s.admission_quota)], ['Admission date', fmtDate(s.admission_date)],
              ['CGPA', s.cgpa], ['Faculty advisor', s.faculty_advisor], ['Scholarship', s.scholarship], ['First graduate', s.first_graduate ? 'Yes' : 'No'],
            ]} />
          </Card>
          {can('parents.manage') && <ParentsCard student={s} />}
          <Card title="Personal & guardian">
            <DefinitionList items={[
              ['Gender', label(s.gender)], ['Date of birth', fmtDate(s.date_of_birth)], ['Blood group', s.blood_group], ['Medical notes', s.medical_notes],
              ['Parent / guardian', s.parent_name ? `${s.parent_name} (${s.parent_relation || '—'})` : null], ['Parent phone', s.parent_phone],
              ['Emergency contact', s.emergency_contact_name], ['Emergency phone', s.emergency_contact_phone],
              ['Address', [s.address_line, s.city, s.district, s.state, s.pincode].filter(Boolean).join(', ')], ['Distance from home', s.distance_from_home_km ? `${s.distance_from_home_km} km` : null],
            ]} />
          </Card>
        </div>
      )}

      {tab === 'hostel' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Current allocation" icon={BedDouble}>
            {a ? <DefinitionList items={[['Hostel', a.hostel_name], ['Floor', a.floor_label], ['Room', `${a.room_number} · ${label(a.room_type)}`], ['Bed', a.bed_code], ['Allocated on', fmtDateTime(a.allocated_at)], ['Roommates', a.roommates || '—']]} />
              : <p className="text-sm text-slate-500">No active allocation.</p>}
          </Card>
          <Card title="Admission" icon={UserCheck}>
            {application ? (
              <DefinitionList items={[['Application', <Link key="l" className="text-brand-600" to={`/applications/${application.id}`}>{application.application_code}</Link>], ['Academic year', application.academic_year], ['Status', <StatusBadge key="s" status={application.status} />], ['Preferred hostel', application.preferred_hostel], ['Submitted', fmtDate(application.created_at)], ['Remarks', application.remarks]]} />
            ) : <p className="text-sm text-slate-500">No application on record.</p>}
          </Card>
          <Card title="Room transfer history" icon={History}>
            {transfers.length === 0 ? <p className="text-sm text-slate-500">No transfers.</p> : (
              <ul className="space-y-2">{transfers.map((t) => <li key={t.id} className="text-sm"><b>{t.from_bed}</b> → <b>{t.to_bed}</b><span className="block text-xs text-slate-500">{fmtDateTime(t.created_at)} · {t.transferred_by} · {t.reason}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Hostel exit">
            {exitRecord ? <DefinitionList items={[['Status', <StatusBadge key="x" status={exitRecord.clearance_status} />], ['Reason', label(exitRecord.reason)], ['Requested exit', fmtDate(exitRecord.requested_exit_date)], ['Exit date', fmtDate(exitRecord.exit_date)], ['Room condition', label(exitRecord.room_condition)], ['Damage charges', fmtMoney(exitRecord.damage_charges)]]} />
              : <p className="text-sm text-slate-500">No exit request.</p>}
          </Card>
        </div>
      )}

      {tab === 'fees' && (
        <div className="card">
          <DataTable rows={fees.items} columns={[
            { key: 'fee_name', header: 'Fee' }, { key: 'academic_year', header: 'Year' },
            { key: 'net', header: 'Amount', render: (f) => fmtMoney(f.total_amount - f.discount) }, { key: 'amount_paid', header: 'Paid', render: (f) => fmtMoney(f.amount_paid) },
            { key: 'balance', header: 'Balance', render: (f) => fmtMoney(f.balance) }, { key: 'due_date', header: 'Due', render: (f) => fmtDate(f.due_date) },
            { key: 'status', header: 'Status', render: (f) => <StatusBadge status={f.status} /> },
          ]} />
          {can('fees.view_all') && <div className="border-t border-slate-100 p-3 text-right"><Button size="sm" variant="subtle" to={`/fees?search=${s.register_number}`}>Record payment</Button></div>}
        </div>
      )}

      {tab === 'leaves' && (
        <div className="card"><DataTable rows={leaves} columns={[
          { key: 'leave_code', header: 'Leave' }, { key: 'leave_type', header: 'Type', render: (l) => label(l.leave_type) },
          { key: 'from', header: 'Period', render: (l) => `${fmtDate(l.from_date)} → ${fmtDate(l.to_date)}` }, { key: 'destination', header: 'Destination' },
          { key: 'ret', header: 'Expected return', render: (l) => fmtDateTime(l.expected_return_at) },
          { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.overdue ? 'overdue' : l.status}>{l.overdue ? 'Return overdue' : undefined}</StatusBadge> },
        ]} /></div>
      )}

      {tab === 'complaints' && (
        <div className="card"><DataTable rows={complaints} onRowClick={undefined} columns={[
          { key: 'complaint_code', header: 'Code', render: (c) => <Link className="font-medium text-brand-600" to={`/complaints/${c.id}`}>{c.complaint_code}</Link> }, { key: 'title', header: 'Title' },
          { key: 'category', header: 'Category', render: (c) => label(c.category) }, { key: 'priority', header: 'Priority', render: (c) => <StatusBadge status={c.priority} /> },
          { key: 'status', header: 'Status', render: (c) => <div className="flex gap-1"><StatusBadge status={c.status} /><SlaBadge breached={c.sla_breached} status={c.status} /></div> },
          { key: 'created_at', header: 'Raised', render: (c) => fmtDate(c.created_at) },
        ]} /></div>
      )}

      {tab === 'visitors' && (
        <div className="card"><DataTable rows={visitors} columns={[
          { key: 'pass_code', header: 'Pass' }, { key: 'name', header: 'Visitor' }, { key: 'relationship', header: 'Relation' },
          { key: 'entry_time', header: 'Entry', render: (v) => fmtDateTime(v.entry_time || v.expected_at) }, { key: 'exit_time', header: 'Exit', render: (v) => fmtDateTime(v.exit_time) },
          { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
        ]} /></div>
      )}
      <StudentForm open={editing} onClose={() => setEditing(false)} student={{ ...s, id: s.id }} onSaved={reload} />
      <p className="text-xs text-slate-400"><CalendarDays className="mr-1 inline h-3 w-3" />Attendance figures cover {fmtDate(attendance.since)} to today.</p>
    </div>
  );
}
