import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { UserPlus, Pencil, KeyRound } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { userSchema, clean, passwordRule } from '../../validations/schemas';
import { fmtDateTime, label } from '../../utils/format';

const ROLES = [['super_admin', 'Super Admin'], ['warden', 'Hostel Warden'], ['staff', 'Hostel Staff'], ['security', 'Security Staff']];
const SKILLS = ['electrical', 'plumbing', 'cleaning', 'internet', 'furniture', 'food', 'security', 'general'];

function UserForm({ user, onClose, onDone }) {
  const hostels = useHostels();
  const schema = user ? userSchema.omit({ password: true }) : userSchema.refine((v) => v.password, { message: 'Password is required', path: ['password'] });
  const { register, handleSubmit, watch, control, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: user ? { name: user.name, email: user.email, phone: user.phone || '', role: user.role, designation: user.designation || '', staffSkill: user.staff_skill || '', hostelIds: Array.isArray(user.hostel_ids) ? user.hostel_ids : JSON.parse(user.hostel_ids || '[]') }
      : { role: 'staff', hostelIds: [] },
  });
  const role = watch('role');
  const submit = async (v) => {
    try {
      const body = clean({ ...v, staffSkill: v.role === 'staff' ? v.staffSkill || undefined : undefined });
      if (user) await api.put(`/users/${user.id}`, body); else await api.post('/users', body);
      toast.success(user ? 'User updated' : 'User created'); onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={user ? `Edit ${user.name}` : 'New staff account'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" loading={isSubmitting}>Save</Button></>}>
      <form id="user-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Full name" required error={errors.name?.message} {...register('name')} />
        <Input label="Email" required error={errors.email?.message} {...register('email')} />
        <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        <Select label="Role" options={ROLES.map(([value, l]) => ({ value, label: l }))} {...register('role')} />
        <Input label="Designation" {...register('designation')} />
        {role === 'staff' && <Select label="Skill (complaint routing)" placeholder="—" options={SKILLS.map((s) => ({ value: s, label: label(s) }))} {...register('staffSkill')} />}
        {!user && <Input label="Initial password" type="password" required error={errors.password?.message} hint="Min 8 chars with a letter and number" {...register('password')} />}
        {role !== 'super_admin' && (
          <fieldset className="sm:col-span-2"><legend className="label">Assigned hostels</legend>
            <Controller control={control} name="hostelIds" render={({ field }) => (
              <div className="flex flex-wrap gap-3">{hostels.map((h) => (
                <label key={h.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={field.value.includes(h.id)}
                  onChange={(e) => field.onChange(e.target.checked ? [...field.value, h.id] : field.value.filter((x) => x !== h.id))} />{h.name}</label>
              ))}</div>
            )} />
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useListState();
  const { data, meta, loading, error, reload } = useFetch('/users', q);
  const roles = useFetch('/users/roles');
  const [modal, setModal] = useState(null);
  const [pending, setPending] = useState(false);
  const act = async (fn, msg) => {
    setPending(true);
    try { await fn(); toast.success(msg); setModal(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <div>
      <PageHeader title="Users & Roles" subtitle="Staff accounts and hostel assignments. Student accounts are created from the Students module."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Users' }]} actions={<Button size="sm" icon={UserPlus} onClick={() => setModal({ type: 'form' })}>New user</Button>} />
      {roles.data && <div className="mb-4 flex flex-wrap gap-2">{roles.data.map((r) => <Badge key={r.id} tone="indigo">{r.label}: {r.user_count} users · {r.permission_count} permissions</Badge>)}</div>}
      <Tabs className="mb-3" value={q.role || ''} onChange={(role) => setQ({ role })} tabs={[{ value: '', label: 'All' }, ...ROLES.map(([value, l]) => ({ value, label: l }))]} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Name, email, phone" />
          <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any status" options={['active', 'inactive', 'locked'].map((s) => ({ value: s, label: label(s) }))} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          { key: 'name', header: 'User', render: (u) => <span><b>{u.name}</b><span className="block text-xs text-slate-500">{u.email}</span></span> },
          { key: 'role', header: 'Role', render: (u) => <span>{u.role_label}<span className="block text-xs text-slate-500">{u.designation}{u.staff_skill ? ` · ${u.staff_skill}` : ''}</span></span> },
          { key: 'hostels', header: 'Hostels', hideOnMobile: true, render: (u) => u.hostels || (u.role === 'super_admin' ? 'All' : '—') },
          { key: 'last_login_at', header: 'Last login', hideOnMobile: true, render: (u) => fmtDateTime(u.last_login_at) },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          { key: 'act', header: '', render: (u) => (
            <div className="flex gap-1">
              <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setModal({ type: 'form', user: u })} aria-label="Edit" />
              <Button size="xs" variant="ghost" icon={KeyRound} onClick={() => setModal({ type: 'password', user: u })} aria-label="Reset password" />
              {u.id !== me.id && <Button size="xs" variant="ghost" onClick={() => setModal({ type: 'status', user: u })}>{u.status === 'active' ? 'Deactivate' : 'Activate'}</Button>}
            </div>
          ) },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {modal?.type === 'form' && <UserForm user={modal.user} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      <ConfirmDialog open={modal?.type === 'status'} onClose={() => setModal(null)} loading={pending} tone={modal?.user?.status === 'active' ? 'danger' : 'primary'}
        title={`${modal?.user?.status === 'active' ? 'Deactivate' : 'Activate'} ${modal?.user?.name}?`} message="Active sessions of this user are signed out." confirmLabel="Confirm"
        onConfirm={() => act(() => api.patch(`/users/${modal.user.id}/status`, { status: modal.user.status === 'active' ? 'inactive' : 'active' }), 'Status updated')} />
      <ConfirmDialog open={modal?.type === 'password'} onClose={() => setModal(null)} loading={pending} title={`Set a temporary password for ${modal?.user?.name}`}
        message="Share it securely; the user should change it after signing in." reasonLabel="New password (min 8, letter + number)" confirmLabel="Set password"
        onConfirm={(pwd) => (passwordRule.safeParse(pwd).success ? act(() => api.post(`/users/${modal.user.id}/reset-password`, { password: pwd }), 'Password reset') : toast.error('Password must be 8+ chars with a letter and a number'))} />
    </div>
  );
}
