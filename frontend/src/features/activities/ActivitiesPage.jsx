import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, MapPin, CalendarClock, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, Drawer } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Tabs } from '../../components/ui/Misc';
import { ErrorState, SkeletonCards, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDateTime, label } from '../../utils/format';

const CATS = ['cultural', 'sports', 'technical', 'welfare', 'meeting', 'other'];

function ActivityForm({ onClose, onDone }) {
  const { is } = useAuth();
  const hostels = useHostels();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: { category: 'cultural', hostelId: is('super_admin') ? '' : hostels[0]?.id } });
  const submit = async (v) => {
    try {
      await api.post('/activities', { ...v, hostelId: v.hostelId ? Number(v.hostelId) : null, maxParticipants: v.maxParticipants ? Number(v.maxParticipants) : null, description: v.description || undefined, venue: v.venue || undefined });
      toast.success('Activity created'); onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="New activity" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="act-form" loading={isSubmitting}>Create</Button></>}>
      <form id="act-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" required className="sm:col-span-2" {...register('title', { required: true })} />
        <Select label="Category" options={CATS.map((c) => ({ value: c, label: label(c) }))} {...register('category')} />
        <Select label="Hostel" placeholder={is('super_admin') ? 'All hostels (campus-wide)' : undefined} options={hostelOptions(hostels)} {...register('hostelId')} />
        <Input label="Starts" type="datetime-local" required {...register('startAt', { required: true })} />
        <Input label="Ends" type="datetime-local" required {...register('endAt', { required: true })} />
        <Input label="Venue" {...register('venue')} />
        <Input label="Max participants" type="number" min={1} {...register('maxParticipants')} />
        <Textarea label="Description" className="sm:col-span-2" {...register('description')} />
      </form>
    </Modal>
  );
}

function Participants({ activity, onClose }) {
  const { data } = useFetch(activity ? `/activities/${activity.id}/participants` : null);
  return (
    <Drawer open={!!activity} onClose={onClose} title={activity?.title || ''} description={`${data?.length ?? 0} registered`}>
      {data?.length === 0 ? <EmptyState title="No registrations yet" /> : (
        <ul className="divide-y divide-slate-100">{data?.map((p) => <li key={p.student_id} className="flex justify-between py-2 text-sm"><span><b>{p.name}</b> <span className="text-slate-500">· {p.register_number} · {p.department} Y{p.year_of_study}</span></span>{p.attended ? <Badge tone="green">Attended</Badge> : null}</li>)}</ul>
      )}
    </Drawer>
  );
}

export default function ActivitiesPage() {
  const { can, is } = useAuth();
  const [tab, setTab] = useState('upcoming');
  const { data, loading, error, reload } = useFetch('/activities', { upcoming: tab === 'upcoming' ? 'true' : undefined });
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const toggle = async (a) => {
    try {
      if (a.registered) await api.delete(`/activities/${a.id}/register`); else await api.post(`/activities/${a.id}/register`);
      toast.success(a.registered ? 'Registration withdrawn' : 'You are registered'); reload();
    } catch (err) { toast.error(err.message); }
  };
  const setStatus = async (a, status) => {
    try { await api.patch(`/activities/${a.id}/status`, { status }); toast.success(`Marked ${status}`); reload(); } catch (err) { toast.error(err.message); }
  };
  return (
    <div>
      <PageHeader title="Hostel Activities" subtitle="Cultural, sports, technical and welfare events" actions={can('activities.manage') && <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>New activity</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'all', label: 'All' }]} />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <SkeletonCards count={3} /> : data?.length === 0 ? <EmptyState title="No activities" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((a) => (
            <article key={a.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2"><Badge tone="indigo">{label(a.category)}</Badge><StatusBadge status={a.status} /></div>
              <h3 className="mt-2 font-semibold text-slate-800">{a.title}</h3>
              {a.description && <p className="mt-1 line-clamp-3 text-sm text-slate-600">{a.description}</p>}
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <p className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{fmtDateTime(a.start_at)} – {fmtDateTime(a.end_at).split(', ').pop()}</p>
                {a.venue && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{a.venue} · {a.hostel_name || 'All hostels'}</p>}
                <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{a.participants}{a.max_participants ? ` / ${a.max_participants}` : ''} registered</p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {is('student') && a.status === 'scheduled' && <Button size="sm" variant={a.registered ? 'secondary' : 'primary'} onClick={() => toggle(a)} disabled={!a.registered && a.max_participants && a.participants >= a.max_participants}>{a.registered ? 'Withdraw' : 'Register'}</Button>}
                {can('activities.manage') && <Button size="sm" variant="secondary" onClick={() => setViewing(a)}>Participants</Button>}
                {can('activities.manage') && a.status === 'scheduled' && <><Button size="sm" variant="ghost" onClick={() => setStatus(a, 'completed')}>Complete</Button><Button size="sm" variant="ghost" onClick={() => setStatus(a, 'cancelled')}>Cancel</Button></>}
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && <ActivityForm onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      <Participants activity={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
