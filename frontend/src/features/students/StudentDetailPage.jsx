import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil, BedDouble, IndianRupee, CalendarCheck, CalendarDays, MessageSquareWarning, UserCheck, Phone, Mail, ArrowRightLeft, History, Camera } from 'lucide-react';
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
import api from '../../services/api';
import StudentForm from './StudentForm';
import ParentsCard from './ParentsCard';

export default function StudentDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const { data, loading, error, reload } = useFetch(`/students/${id}`);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  const { student: s, allocation: a, application, fees, attendance, leaves, complaints, transfers, visitors, exitRecord, cbseDetails } = data;
  const overdue = leaves.find((l) => l.overdue);

  const canEditPhoto = can('students.manage') || (user?.role === 'student' && user?.studentId === Number(id));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Only JPG and PNG images are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api.post(`/students/${id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Photo updated successfully');
      reload();
    } catch (err) {
      toast.error(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const isCbse = s.student_type === 'NS-CBSE';

  return (
    <div className="space-y-5">
      <PageHeader title={s.name} breadcrumbs={[{ label: 'Students', to: '/students' }, { label: s.register_number }]}
        subtitle={isCbse
          ? `${s.register_number} · NS-CBSE School (${cbseDetails?.class_level || 'School'}${cbseDetails?.section ? ` · Sec ${cbseDetails.section}` : ''})`
          : `${s.register_number} · ${s.department_name} (${s.degree}) · ${yearLabel(s.year_of_study)}, Sem ${s.semester} · Batch ${s.batch}`}
        actions={<>
          {['approved'].includes(s.hostel_status) && can('allocations.manage') && <Button size="sm" icon={BedDouble} to={`/allocations?studentId=${s.id}`}>Allocate bed</Button>}
          {a && can('allocations.manage') && <Button size="sm" variant="secondary" icon={ArrowRightLeft} to={`/allocations?transfer=${a.id}`}>Transfer</Button>}
          {can('students.manage') && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
        </>} />

      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div className="relative group shrink-0">
          <Avatar name={s.name} src={s.photo_url} className="h-16 w-16 text-lg border-2 border-slate-200" />
          {canEditPhoto && (
            <label className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-slate-900/60 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[10px] font-medium text-center">
              <Camera className="h-4 w-4 mb-0.5" />
              <span>{uploadingPhoto ? '...' : 'Change'}</span>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png" className="hidden" disabled={uploadingPhoto} onChange={handlePhotoUpload} />
            </label>
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{s.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={s.hostel_status} />
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${isCbse ? 'bg-purple-50 text-purple-700 ring-purple-700/20' : 'bg-blue-50 text-brand-700 ring-brand-700/20'}`}>
              {isCbse ? 'NS-CBSE School' : 'NSCET College'}
            </span>
            {s.admission_quota && (
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                {label(s.admission_quota)}
              </span>
            )}
            {s.account_status !== 'active' && <StatusBadge status={s.account_status}>Account {s.account_status}</StatusBadge>}
            {overdue && <StatusBadge status="overdue">Leave return overdue</StatusBadge>}
            {fees.overdue && <StatusBadge status="overdue">Fee overdue</StatusBadge>}
          </div>
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
          {isCbse ? (
            <Card title="NS-CBSE School Profile">
              <DefinitionList items={[
                ['Class & Section', `${cbseDetails?.class_level || '—'}${cbseDetails?.section ? ` · Sec ${cbseDetails.section}` : ''}`],
                ['School Admission No.', cbseDetails?.admission_number || '—'],
                ['Hostel Register ID', s.register_number],
                ['Admission Quota', label(s.admission_quota)],
                ['Admission Date', fmtDate(s.admission_date)],
                ['Local Guardian', cbseDetails?.local_guardian_name ? `${cbseDetails.local_guardian_name} (${cbseDetails.local_guardian_relation || 'Local Guardian'})` : null],
                ['Local Guardian Phone', cbseDetails?.local_guardian_phone],
                ['Local Guardian Address', cbseDetails?.local_guardian_address],
                ['Known Medical Conditions', cbseDetails?.medical_conditions || 'None reported'],
                ['Known Allergies', cbseDetails?.allergies || 'None reported'],
              ]} />
            </Card>
          ) : (
            <Card title="Academic">
              <DefinitionList items={[
                ['Department', s.department_name], ['HoD', s.hod_name], ['Year / Semester', `${s.year_of_study} / ${s.semester}`], ['Section', s.section],
                ['Batch', s.batch], ['Roll number', s.roll_number], ['Admission quota', label(s.admission_quota)], ['Admission date', fmtDate(s.admission_date)],
                ['Faculty advisor', s.faculty_advisor], ['Scholarship', s.scholarship], ['First graduate', s.first_graduate ? 'Yes' : 'No'],
              ]} />
            </Card>
          )}

          {can('parents.manage') && <ParentsCard student={s} />}

          <Card title="Personal & guardian">
            <DefinitionList items={[
              ['Gender', label(s.gender)], ['Date of birth', fmtDate(s.date_of_birth)], ['Blood group', s.blood_group], ['Medical notes', s.medical_notes],
              ['Parent / guardian', s.parent_name ? `${s.parent_name} (${s.parent_relation || '—'})` : null], ['Parent phone', s.parent_phone],
              ['Parent email', s.parent_email], ['Parent occupation', s.parent_occupation],
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
        <DataTable rows={fees.items} columns={[
          { key: 'academic_year', header: 'Year' },
          { key: 'fee_name', header: 'Fee structure' },
          { key: 'total_amount', header: 'Total', render: (r) => fmtMoney(r.total_amount) },
          { key: 'amount_paid', header: 'Paid', render: (r) => fmtMoney(r.amount_paid) },
          { key: 'balance', header: 'Balance', render: (r) => <span className={r.balance > 0 ? 'font-semibold text-red-600' : 'text-slate-600'}>{fmtMoney(r.balance)}</span> },
          { key: 'due_date', header: 'Due date', render: (r) => fmtDate(r.due_date) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]} />
      )}

      {tab === 'leaves' && (
        <DataTable rows={leaves} columns={[
          { key: 'leave_code', header: 'Code' },
          { key: 'leave_type', header: 'Type', render: (r) => label(r.leave_type) },
          { key: 'from_date', header: 'Dates', render: (r) => `${fmtDate(r.from_date)} → ${fmtDate(r.to_date)}` },
          { key: 'destination', header: 'Destination' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'returned_at', header: 'Returned', render: (r) => (r.returned_at ? fmtDateTime(r.returned_at) : r.overdue ? <span className="font-semibold text-red-600">Overdue</span> : '—') },
        ]} />
      )}

      {tab === 'complaints' && (
        <DataTable rows={complaints} columns={[
          { key: 'complaint_code', header: 'Code', render: (r) => <Link to={`/complaints/${r.id}`} className="font-semibold text-brand-600">{r.complaint_code}</Link> },
          { key: 'title', header: 'Title' },
          { key: 'category', header: 'Category', render: (r) => label(r.category) },
          { key: 'priority', header: 'Priority', render: (r) => label(r.priority) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'sla_due_at', header: 'SLA', render: (r) => <SlaBadge dueAt={r.sla_due_at} status={r.status} /> },
        ]} />
      )}

      {tab === 'visitors' && (
        <DataTable rows={visitors} columns={[
          { key: 'pass_code', header: 'Pass' },
          { key: 'name', header: 'Visitor' },
          { key: 'relationship', header: 'Relation' },
          { key: 'entry_time', header: 'Check-in', render: (r) => (r.entry_time ? fmtDateTime(r.entry_time) : '—') },
          { key: 'exit_time', header: 'Check-out', render: (r) => (r.exit_time ? fmtDateTime(r.exit_time) : '—') },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]} />
      )}

      <StudentForm open={editing} onClose={() => setEditing(false)} student={{ ...s, cbseDetails }} onSaved={reload} />
    </div>
  );
}
