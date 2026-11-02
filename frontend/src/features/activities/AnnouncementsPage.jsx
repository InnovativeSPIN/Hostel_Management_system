import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Megaphone, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDateTime, timeAgo } from '../../utils/format';

function Publish({ onClose, onDone }) {
  const { is } = useAuth();
  const hostels = useHostels();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: { priority: 'normal', audience: 'all', hostelId: is('super_admin') ? '' : hostels[0]?.id } });
  const submit = async (v) => {
    try {
      await api.post('/announcements', { ...v, hostelId: v.hostelId ? Number(v.hostelId) : null, expiresAt: v.expiresAt ? v.expiresAt.replace('T', ' ') : null });
      toast.success(v.priority === 'normal' ? 'Published' : 'Published and notified the audience'); onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Publish announcement" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="ann-form" loading={isSubmitting} icon={Megaphone}>Publish</Button></>}>
      <form id="ann-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" required className="sm:col-span-2" {...register('title', { required: true, minLength: 3 })} />
        <Textarea label="Message" required rows={5} className="sm:col-span-2" {...register('body', { required: true, minLength: 5 })} />
        <Select label="Hostel" placeholder={is('super_admin') ? 'All hostels' : undefined} options={hostelOptions(hostels)} {...register('hostelId')} />
        <Select label="Audience" options={[{ value: 'all', label: 'Everyone' }, { value: 'students', label: 'Students' }, { value: 'staff', label: 'Staff' }]} {...register('audience')} />
        <Select label="Priority" hint="Important / urgent also send a notification" options={[{ value: 'normal', label: 'Normal' }, { value: 'important', label: 'Important' }, { value: 'urgent', label: 'Urgent' }]} {...register('priority')} />
        <Input label="Expires (optional)" type="datetime-local" {...register('expiresAt')} />
      </form>
    </Modal>
  );
}

export default function AnnouncementsPage() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useFetch('/announcements');
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const remove = async () => {
    try { await api.delete(`/announcements/${removing.id}`); toast.success('Announcement removed'); setRemoving(null); reload(); } catch (err) { toast.error(err.message); }
  };
  return (
    <div>
      <PageHeader title="Announcements" actions={can('announcements.manage') && <Button size="sm" icon={Megaphone} onClick={() => setOpen(true)}>Publish</Button>} />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <SkeletonCards count={2} /> : data?.length === 0 ? <EmptyState icon={Megaphone} title="No announcements" /> : (
        <div className="space-y-3">
          {data?.map((a) => (
            <article key={a.id} className={clsx('card border-l-4 p-4', a.priority === 'urgent' ? 'border-l-red-500' : a.priority === 'important' ? 'border-l-orange-400' : 'border-l-slate-200')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-800">{a.title}</h3>{a.priority !== 'normal' && <StatusBadge status={a.priority} />}<Badge>{a.hostel_name || 'All hostels'}</Badge>{a.audience !== 'all' && <Badge tone="indigo">{a.audience}</Badge>}</div>
                {can('announcements.manage') && <Button size="xs" variant="ghost" icon={Trash2} onClick={() => setRemoving(a)} aria-label="Remove" />}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
              <p className="mt-2 text-xs text-slate-400">{a.published_by_name} · {timeAgo(a.published_at)}{a.expires_at ? ` · expires ${fmtDateTime(a.expires_at)}` : ''}</p>
            </article>
          ))}
        </div>
      )}
      {open && <Publish onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} tone="danger" title="Remove announcement?" message={removing?.title} confirmLabel="Remove" />
    </div>
  );
}
