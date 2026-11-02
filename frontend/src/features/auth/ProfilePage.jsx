import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { KeyRound, Save } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, DefinitionList } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import api, { tokenStore } from '../../services/api';
import { changePasswordSchema } from '../../validations/schemas';
import { label, fmtDate } from '../../utils/format';

function StudentContact() {
  const { data, reload } = useFetch('/students/me');
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  useEffect(() => {
    if (!data) return;
    const s = data.student;
    reset({ phone: s.phone, parentName: s.parent_name || '', parentPhone: s.parent_phone || '', parentEmail: s.parent_email || '', emergencyContactName: s.emergency_contact_name || '', emergencyContactPhone: s.emergency_contact_phone || '', addressLine: s.address_line || '', city: s.city || '', district: s.district || '', state: s.state || '', pincode: s.pincode || '', bloodGroup: s.blood_group || '', medicalNotes: s.medical_notes || '' });
  }, [data, reset]);
  if (!data) return null;
  const s = data.student;
  const submit = async (v) => {
    try {
      const body = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === '' ? null : val]));
      if (!body.phone) delete body.phone;
      await api.put('/students/me/profile', body);
      toast.success('Contact details updated'); reload();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <>
      <Card title="Academic record" subtitle="Maintained by the college office — contact them for corrections">
        <DefinitionList cols={3} items={[['Register number', s.register_number], ['Department', s.department_name], ['Year / Semester', `${s.year_of_study} / ${s.semester}`], ['Batch', s.batch], ['Admission date', fmtDate(s.admission_date)], ['Hostel status', label(s.hostel_status)]]} />
      </Card>
      <Card title="Contact, guardian & medical details" subtitle="You can keep these up to date yourself">
        <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
          <Input label="My phone" {...register('phone')} />
          <Select label="Blood group" placeholder="—" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} {...register('bloodGroup')} />
          <Input label="Parent / guardian name" {...register('parentName')} />
          <Input label="Parent phone" {...register('parentPhone')} />
          <Input label="Parent email" {...register('parentEmail')} />
          <Input label="Emergency contact name" {...register('emergencyContactName')} />
          <Input label="Emergency contact phone" {...register('emergencyContactPhone')} />
          <Input label="Address" {...register('addressLine')} />
          <Input label="City" {...register('city')} />
          <Input label="District" {...register('district')} />
          <Input label="State" {...register('state')} />
          <Input label="Pincode" {...register('pincode')} />
          <Textarea label="Medical notes" className="sm:col-span-2" rows={2} {...register('medicalNotes')} />
          <div className="sm:col-span-2"><Button type="submit" icon={Save} loading={isSubmitting}>Save details</Button></div>
        </form>
      </Card>
    </>
  );
}

export default function ProfilePage() {
  const { user, is } = useAuth();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(changePasswordSchema) });
  const change = async (v) => {
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      tokenStore.set(data.data.token);
      toast.success('Password changed. Other sessions were signed out.');
      reset({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) { toast.error(err.message); }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="My Profile" subtitle={`${user.name} · ${user.roleLabel}`} />
      {!is('student') && <Card title="Account"><DefinitionList cols={3} items={[['Name', user.name], ['Email', user.email], ['Phone', user.phone], ['Role', user.roleLabel], ['Designation', user.designation]]} /></Card>}
      {is('student') && <StudentContact />}
      <Card title="Change password" icon={KeyRound}>
        <form onSubmit={handleSubmit(change)} className="grid max-w-3xl gap-4 sm:grid-cols-3" noValidate>
          <Input label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
          <Input label="New password" type="password" autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
          <div><Button type="submit" loading={isSubmitting}>Update password</Button></div>
        </form>
      </Card>
    </div>
  );
}
