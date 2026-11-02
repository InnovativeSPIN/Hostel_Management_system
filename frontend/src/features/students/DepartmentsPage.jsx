import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Pencil, Award } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Checkbox } from '../../components/ui/Field';
import { useFetch } from '../../hooks/useFetch';
import { invalidateLookup } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { clean } from '../../validations/schemas';

function DepartmentForm({ dept, onClose, onSaved }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: dept ? {
      code: dept.code, name: dept.name, shortName: dept.short_name, degree: dept.degree, universityCode: dept.university_code || '', hodName: dept.hod_name || '',
      hodEmail: dept.hod_email || '', hodPhone: dept.hod_phone || '', block: dept.block || '', annualIntake: dept.annual_intake || '',
      establishedYear: dept.established_year || '', nbaAccredited: !!dept.nba_accredited, status: dept.status,
    } : { degree: 'B.E.', status: 'active' },
  });
  const submit = async (v) => {
    try {
      const body = clean(v);
      if (dept) await api.put(`/departments/${dept.id}`, body); else await api.post('/departments', body);
      invalidateLookup('departments');
      toast.success('Department saved');
      onSaved();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={dept ? `Edit ${dept.short_name}` : 'Add department'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="dept-form" loading={isSubmitting}>Save</Button></>}>
      <form id="dept-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Code" required {...register('code', { required: true })} />
        <Input label="Short name" required {...register('shortName', { required: true })} />
        <Input label="Department name" required className="sm:col-span-2" {...register('name', { required: true })} />
        <Select label="Degree" options={['B.E.', 'B.Tech.', 'M.E.', 'M.Tech.', 'MBA', 'MCA']} {...register('degree')} />
        <Input label="University branch code" hint="3 digits used in register numbers" {...register('universityCode')} />
        <Input label="Head of Department" {...register('hodName')} />
        <Input label="HoD email" type="email" {...register('hodEmail')} />
        <Input label="HoD phone" {...register('hodPhone')} />
        <Input label="Block" {...register('block')} />
        <Input label="Annual intake" type="number" {...register('annualIntake')} />
        <Input label="Established" type="number" {...register('establishedYear')} />
        <Select label="Status" options={['active', 'inactive']} {...register('status')} />
        <Checkbox label="NBA accredited" {...register('nbaAccredited')} />
      </form>
    </Modal>
  );
}

export default function DepartmentsPage() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useFetch('/departments');
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <PageHeader title="Departments" subtitle="Engineering departments with hostel residency figures" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Departments' }]}
        actions={can('departments.manage') && <Button size="sm" icon={Plus} onClick={() => setEditing({})}>Add department</Button>} />
      <div className="card">
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          { key: 'name', header: 'Department', render: (d) => <div><p className="font-medium text-slate-800">{d.name}</p><p className="text-xs text-slate-500">{d.code} · {d.degree} · Branch {d.university_code || '—'}</p></div> },
          { key: 'hod_name', header: 'HoD', hideOnMobile: true, render: (d) => <span>{d.hod_name}<span className="block text-xs text-slate-500">{d.block}</span></span> },
          { key: 'annual_intake', header: 'Intake', hideOnMobile: true },
          { key: 'total_students', header: 'Students' },
          { key: 'hostel_residents', header: 'Residents', render: (d) => <b>{Number(d.hostel_residents || 0)}</b> },
          { key: 'pending_admissions', header: 'Pending adm.', render: (d) => Number(d.pending_admissions || 0) },
          { key: 'flags', header: '', render: (d) => <div className="flex gap-1">{d.nba_accredited ? <Badge tone="green"><Award className="h-3 w-3" />NBA</Badge> : null}{d.status !== 'active' && <Badge>Inactive</Badge>}</div> },
          ...(can('departments.manage') ? [{ key: 'edit', header: '', render: (d) => <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(d)}>Edit</Button> }] : []),
        ]} />
      </div>
      {editing && <DepartmentForm dept={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
