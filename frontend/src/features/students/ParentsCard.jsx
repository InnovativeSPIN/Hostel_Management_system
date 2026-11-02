import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { UserPlus, Unlink, Users } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Field';
import { useFetch } from '../../hooks/useFetch';
import api from '../../services/api';
import { fmtDateTime } from '../../utils/format';

function LinkParent({ student, onClose, onDone }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({
    defaultValues: { name: student.parent_name || '', email: student.parent_email || '', phone: student.parent_phone || '', relation: student.parent_relation || 'Father' },
  });
  const submit = async (v) => {
    try {
      const { data } = await api.post('/parents/link', { ...v, studentId: student.id });
      const d = data.data;
      toast.success(d.created ? `Parent account created. Temporary password: ${d.temporaryPassword}` : 'Existing parent account linked', { duration: d.created ? 12000 : 4000 });
      onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} title={`Link a parent to ${student.name}`}
      description="If the email already has a parent login (e.g. for a sibling), that account is linked; otherwise a new one is created."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="parent-form" loading={isSubmitting} icon={UserPlus}>Link parent</Button></>}>
      <form id="parent-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Parent / guardian name" required error={errors.name && 'Name is required'} {...register('name', { required: true, minLength: 2 })} />
        <Select label="Relation" options={['Father', 'Mother', 'Guardian', 'Brother', 'Sister', 'Uncle', 'Aunt']} {...register('relation')} />
        <Input label="Login email" type="email" required error={errors.email && 'A valid email is required'} {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })} />
        <Input label="Phone" {...register('phone')} />
        <Input label="Initial password (optional)" type="password" className="sm:col-span-2" hint="Leave blank to generate a temporary password (Parent@ + last 4 digits of the register number)" {...register('password')} />
      </form>
    </Modal>
  );
}

export default function ParentsCard({ student }) {
  const { data, reload } = useFetch(`/parents/student/${student.id}`);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(null);
  const [pending, setPending] = useState(false);
  const unlink = async () => {
    setPending(true);
    try { await api.delete(`/parents/link/${unlinking.id}/${student.id}`); toast.success('Parent unlinked'); setUnlinking(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Card title="Parent portal access" icon={Users} actions={<Button size="xs" variant="subtle" icon={UserPlus} onClick={() => setLinking(true)}>Link parent</Button>}>
      {!data?.length ? <p className="text-sm text-slate-500">No parent login linked. Parents can follow attendance, fees, leave and activities once linked.</p> : (
        <ul className="divide-y divide-slate-100">
          {data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 text-sm"><b>{p.name}</b> <span className="text-slate-500">· {p.relation}</span>
                <span className="block text-xs text-slate-500">{p.email}{p.phone ? ` · ${p.phone}` : ''} · last login {p.last_login_at ? fmtDateTime(p.last_login_at) : 'never'}</span></span>
              <span className="flex items-center gap-1">
                {p.children > 1 && <Badge tone="indigo">{p.children} children</Badge>}
                {p.status !== 'active' && <StatusBadge status={p.status} />}
                <Button size="xs" variant="ghost" icon={Unlink} onClick={() => setUnlinking(p)} aria-label={`Unlink ${p.name}`} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {linking && <LinkParent student={student} onClose={() => setLinking(false)} onDone={() => { setLinking(false); reload(); }} />}
      <ConfirmDialog open={!!unlinking} onClose={() => setUnlinking(null)} onConfirm={unlink} loading={pending} tone="danger" confirmLabel="Unlink"
        title={`Unlink ${unlinking?.name}?`} message="They will no longer see this student's records. Their login stays active for any other linked children." />
    </Card>
  );
}
