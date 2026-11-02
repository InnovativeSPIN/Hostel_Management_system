import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Pencil, Layers } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, DefinitionList } from '../../components/ui/Card';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Checkbox } from '../../components/ui/Field';
import { FilterSelect, FilterBar, SearchInput } from '../../components/ui/Misc';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { label } from '../../utils/format';
import { HealthCard } from '../dashboard/widgets';
import { HostelForm } from './HostelsPage';
import RoomDrawer from '../rooms/RoomDrawer';

const CAP = { single: 1, double: 2, triple: 3, quad: 4, dormitory: 6 };

function RoomForm({ hostel, room, onClose, onSaved }) {
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: room ? { roomType: room.room_type, capacity: room.capacity, isAc: !!room.is_ac, attachedBath: !!room.attached_bath }
      : { floorId: hostel.floors[0]?.id, roomType: 'triple', capacity: 3, isAc: false, attachedBath: false },
  });
  const type = watch('roomType');
  const submit = async (v) => {
    try {
      if (room) await api.put(`/rooms/${room.id}`, { roomType: v.roomType, capacity: Number(v.capacity), isAc: v.isAc, attachedBath: v.attachedBath });
      else await api.post('/rooms', { ...v, hostelId: hostel.id, floorId: Number(v.floorId), capacity: Number(v.capacity) });
      toast.success(room ? 'Room updated' : 'Room and beds created');
      onSaved();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} title={room ? `Edit room ${room.room_number}` : 'Add room'} description={room ? 'Capacity cannot drop below current occupancy.' : 'One bed is created per capacity slot with a unique bed code.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="room-form" loading={isSubmitting}>Save</Button></>}>
      <form id="room-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        {!room && <Select label="Floor" options={hostel.floors.map((f) => ({ value: f.id, label: f.label }))} {...register('floorId')} />}
        {!room && <Input label="Room number" required placeholder="e.g. 204" {...register('roomNumber', { required: true })} />}
        <Select label="Room type" options={Object.keys(CAP).map((t) => ({ value: t, label: label(t) }))} {...register('roomType', { onChange: (e) => setValue('capacity', CAP[e.target.value]) })} />
        <Input label="Capacity (beds)" type="number" min={1} max={20} readOnly={type === 'single'} {...register('capacity')} />
        <Checkbox label="Air-conditioned" {...register('isAc')} />
        <Checkbox label="Attached bathroom" {...register('attachedBath')} />
      </form>
    </Modal>
  );
}

function FloorForm({ hostel, onClose, onSaved }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: { floorNumber: (hostel.floors.at(-1)?.floor_number ?? 0) + 1 } });
  const submit = async (v) => {
    try { await api.post(`/hostels/${hostel.id}/floors`, { floorNumber: Number(v.floorNumber), label: v.label || undefined }); toast.success('Floor added'); onSaved(); } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Add floor" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="floor-form" loading={isSubmitting}>Add</Button></>}>
      <form id="floor-form" onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input label="Floor number" type="number" {...register('floorNumber')} />
        <Input label="Label" placeholder="e.g. Third Floor" {...register('label')} />
      </form>
    </Modal>
  );
}

export default function HostelDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: hostel, loading, error, reload } = useFetch(`/hostels/${id}`);
  const [q, setQ] = useListState({ limit: 50 });
  const rooms = useFetch('/rooms', { ...q, hostelId: id });
  const [modal, setModal] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const refreshAll = () => { reload(); rooms.reload(); };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !hostel) return <PageLoader />;

  return (
    <div className="space-y-5">
      <PageHeader title={hostel.name} subtitle={`${hostel.address || ''}`} breadcrumbs={[{ label: 'Hostels', to: '/hostels' }, { label: hostel.name }]}
        actions={can('hostels.manage') && <>
          <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setModal({ type: 'hostel' })}>Edit hostel</Button>
          <Button size="sm" variant="secondary" icon={Layers} onClick={() => setModal({ type: 'floor' })}>Add floor</Button>
          <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'room' })} disabled={!hostel.floors.length}>Add room</Button>
        </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DefinitionList cols={3} items={[
            ['Code', hostel.code], ['Gender', label(hostel.gender)], ['Type', hostel.hostel_type], ['Status', <StatusBadge key="s" status={hostel.status} />],
            ['Warden', hostel.warden_name], ['Warden phone', hostel.warden_phone], ['Office phone', hostel.contact_phone], ['Email', hostel.contact_email],
            ['Rooms / beds', `${hostel.total_rooms} / ${hostel.total_beds}`], ['Occupied', hostel.occupied_beds], ['Available', hostel.available_beds], ['Maintenance / blocked', hostel.unavailable_beds],
          ]} />
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Floors</h3>
            <div className="flex flex-wrap gap-2">
              {hostel.floors.map((f) => (
                <button key={f.id} type="button" onClick={() => setQ({ floorId: String(q.floorId) === String(f.id) ? '' : f.id })}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${String(q.floorId) === String(f.id) ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <span className="block font-semibold text-slate-800">{f.label}</span>
                  <span className="text-slate-500">{f.rooms} rooms · {Number(f.occupied || 0)}/{f.beds} beds · {Number(f.available || 0)} free</span>
                </button>
              ))}
            </div>
          </div>
          {hostel.staff.length > 0 && (
            <div className="mt-5"><h3 className="mb-2 text-sm font-semibold text-slate-700">Assigned staff</h3>
              <div className="flex flex-wrap gap-2">{hostel.staff.map((s) => <Badge key={s.id} tone="indigo">{s.name} · {s.designation || s.role}</Badge>)}</div></div>
          )}
        </Card>
        <HealthCard hostel={{ ...hostel.health, name: hostel.name }} />
      </div>
      <div className="card">
        <FilterBar>
          <SearchInput className="w-40" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Room no." />
          <FilterSelect value={q.floorId} onChange={(v) => setQ({ floorId: v })} placeholder="All floors" options={hostel.floors.map((f) => ({ value: f.id, label: f.label }))} />
          <FilterSelect value={q.roomType} onChange={(v) => setQ({ roomType: v })} placeholder="All types" options={Object.keys(CAP).map((t) => ({ value: t, label: label(t) }))} />
          <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any status" options={['active', 'maintenance', 'blocked', 'inactive'].map((s) => ({ value: s, label: label(s) }))} />
          <FilterSelect value={q.hasVacancy} onChange={(v) => setQ({ hasVacancy: v })} placeholder="Any vacancy" options={[{ value: 'true', label: 'Has free bed' }]} />
        </FilterBar>
        <DataTable rows={rooms.data} loading={rooms.loading} error={rooms.error} onRetry={rooms.reload} onRowClick={(r) => setRoomId(r.id)} columns={[
          { key: 'room_number', header: 'Room', render: (r) => <span className="font-medium text-slate-800">{r.room_number}<span className="block text-xs font-normal text-slate-500">{r.floor_label}</span></span> },
          { key: 'room_type', header: 'Type', render: (r) => `${label(r.room_type)}${r.is_ac ? ' · AC' : ''}` },
          { key: 'occ', header: 'Occupancy', render: (r) => <span className="tabular-nums">{r.current_occupancy}/{r.capacity}</span> },
          { key: 'available_beds', header: 'Free beds', render: (r) => (r.status === 'active' ? <b className={r.available_beds ? 'text-emerald-700' : 'text-slate-400'}>{r.available_beds}</b> : '—') },
          { key: 'status', header: 'Status', render: (r) => <div className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{r.open_maintenance > 0 && <Badge tone="yellow">{r.open_maintenance} open task</Badge>}</div> },
          ...(can('hostels.manage') ? [{ key: 'edit', header: '', render: (r) => <Button size="xs" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setModal({ type: 'room', room: r }); }}>Edit</Button> }] : []),
        ]} />
        <Pagination meta={rooms.meta} onPage={(page) => setQ({ page })} />
      </div>
      {modal?.type === 'hostel' && <HostelForm hostel={hostel} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.type === 'floor' && <FloorForm hostel={hostel} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshAll(); }} />}
      {modal?.type === 'room' && <RoomForm hostel={hostel} room={modal.room} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshAll(); }} />}
      <RoomDrawer roomId={roomId} onClose={() => setRoomId(null)} onChanged={refreshAll} />
    </div>
  );
}
