import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Building2, Phone, BedDouble } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Meter } from '../../components/ui/Card';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Field';
import { ErrorState, SkeletonCards } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { invalidateLookup } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { clean } from '../../validations/schemas';
import { label, fmtPct } from '../../utils/format';

export function HostelForm({ hostel, onClose, onSaved }) {
  const { is } = useAuth();
  const wardens = useFetch(is('super_admin') ? '/users/staff' : null, { role: 'warden' });
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: hostel ? {
      code: hostel.code, name: hostel.name, gender: hostel.gender, hostelType: hostel.hostel_type, address: hostel.address || '',
      wardenId: hostel.warden_id || '', contactPhone: hostel.contact_phone || '', contactEmail: hostel.contact_email || '', status: hostel.status,
    } : { gender: 'male', hostelType: 'UG', status: 'active' },
  });
  const submit = async (v) => {
    try {
      const body = { ...clean(v), wardenId: v.wardenId ? Number(v.wardenId) : null };
      if (hostel) await api.put(`/hostels/${hostel.id}`, body); else await api.post('/hostels', body);
      invalidateLookup('hostels');
      toast.success('Hostel saved');
      onSaved();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={hostel ? `Edit ${hostel.name}` : 'Add hostel'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="hostel-form" loading={isSubmitting}>Save</Button></>}>
      <form id="hostel-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Code" hint="Used in bed IDs, e.g. A" required {...register('code', { required: true })} />
        <Input label="Name" required {...register('name', { required: true })} />
        <Select label="Gender" options={[{ value: 'male', label: 'Boys' }, { value: 'female', label: 'Girls' }, { value: 'co-ed', label: 'Co-ed' }]} {...register('gender')} />
        <Select label="Type" options={['UG', 'PG', 'Mixed', 'International']} {...register('hostelType')} />
        <Input label="Address" className="sm:col-span-2" {...register('address')} />
        {is('super_admin') && <Select label="Primary warden" placeholder="—" options={(wardens.data || []).map((w) => ({ value: w.id, label: w.name }))} {...register('wardenId')} />}
        <Input label="Contact phone" {...register('contactPhone')} />
        <Input label="Contact email" {...register('contactEmail')} />
        <Select label="Status" options={['active', 'maintenance', 'inactive']} {...register('status')} />
      </form>
    </Modal>
  );
}

export default function HostelsPage() {
  const { is } = useAuth();
  const { data, loading, error, reload } = useFetch('/hostels');
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <PageHeader title="Hostels & Rooms" subtitle="Hostel → Floor → Room → Bed" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Hostels' }]}
        actions={<>
          <Button size="sm" variant="secondary" icon={BedDouble} to="/bed-map">Live bed map</Button>
          {is('super_admin') && <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Add hostel</Button>}
        </>} />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <SkeletonCards count={3} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((h) => {
            const usable = Number(h.occupied_beds) + Number(h.available_beds);
            const occ = usable ? (Number(h.occupied_beds) / usable) * 100 : 0;
            return (
              <Link key={h.id} to={`/hostels/${h.id}`} className="card block p-5 transition hover:border-brand-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{h.code}</span>
                    <div><p className="font-semibold text-slate-800">{h.name}</p><p className="text-xs text-slate-500">{label(h.gender === 'male' ? 'boys' : h.gender === 'female' ? 'girls' : 'co-ed')} · {h.hostel_type} · {h.total_floors} floors</p></div>
                  </div>
                  <StatusBadge status={h.status} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-2"><p className="text-lg font-semibold">{h.total_rooms}</p><p className="text-xs text-slate-500">Rooms</p></div>
                  <div className="rounded-lg bg-slate-50 py-2"><p className="text-lg font-semibold">{h.occupied_beds}<span className="text-sm text-slate-400">/{h.total_beds}</span></p><p className="text-xs text-slate-500">Occupied</p></div>
                  <div className="rounded-lg bg-emerald-50 py-2"><p className="text-lg font-semibold text-emerald-700">{h.available_beds}</p><p className="text-xs text-emerald-700">Available</p></div>
                </div>
                <div className="mt-3 flex items-center gap-2"><Meter value={occ} tone="bg-brand-500" /><span className="text-xs font-medium text-slate-600">{fmtPct(occ)}</span></div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Building2 className="h-3.5 w-3.5" />{h.warden_name || 'No warden'}
                  {h.warden_phone && <><Phone className="ml-2 h-3.5 w-3.5" />{h.warden_phone}</>}
                  {Number(h.maintenance_rooms) > 0 && <Badge tone="yellow" className="ml-auto">{h.maintenance_rooms} under maintenance</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <HostelForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </div>
  );
}
