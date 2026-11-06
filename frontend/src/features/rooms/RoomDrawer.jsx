import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Wrench, Ban, CheckCircle2 } from 'lucide-react';
import { Drawer, Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Select, Textarea, Checkbox } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/Badge';
import { DefinitionList } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Misc';
import { PageLoader, ErrorState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDate, label } from '../../utils/format';

function RoomStatusModal({ room, onClose, onDone }) {
  const [status, setStatus] = useState(room.status === 'active' ? 'maintenance' : 'active');
  const [reason, setReason] = useState('');
  const [createTask, setCreateTask] = useState(true);
  const [category, setCategory] = useState('other');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      const { data } = await api.patch(`/rooms/${room.id}/status`, { status, reason, createMaintenanceTask: createTask, category });
      toast.success(`Room ${room.room_number} is now ${status}${data.data.maintenanceId ? ' · maintenance task created' : ''}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Change status · Room ${room.room_number}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={reason.trim().length < 3}>Update</Button></>}>
      <div className="space-y-4">
        <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value)} options={['active', 'maintenance', 'blocked', 'inactive'].filter((s) => s !== room.status).map((s) => ({ value: s, label: label(s) }))} />
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ceiling seepage – waterproofing" />
        {status === 'maintenance' && (<>
          <Checkbox label="Create a maintenance task" hint="Free beds are blocked from allocation; occupants are notified." checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />
          {createTask && <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={['electrical', 'plumbing', 'cleaning', 'furniture', 'structural', 'internet', 'pest_control', 'other'].map((c) => ({ value: c, label: label(c) }))} />}
        </>)}
        {status === 'inactive' && room.current_occupancy > 0 && <p className="text-sm text-red-600">Vacate or transfer all occupants first.</p>}
      </div>
    </Modal>
  );
}

export default function RoomDrawer({ roomId, onClose, onChanged }) {
  const { can } = useAuth();
  const { data: room, loading, error, reload } = useFetch(roomId ? `/rooms/${roomId}` : null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [bedAction, setBedAction] = useState(null);
  const [bedPending, setBedPending] = useState(false);
  const refresh = () => { reload(); onChanged?.(); };

  const changeBed = async (reason) => {
    setBedPending(true);
    try {
      await api.patch(`/beds/${bedAction.bed.id}/status`, { status: bedAction.status, reason });
      toast.success(`Bed ${bedAction.bed.bed_code} marked ${bedAction.status}`);
      setBedAction(null);
      refresh();
    } catch (err) { toast.error(err.message); } finally { setBedPending(false); }
  };

  return (
    <Drawer open={!!roomId} onClose={onClose} title={room ? `Room ${room.room_number} · ${room.hostel_name}` : 'Room'} description={room ? `${room.floor_label} · ${room.room_category || label(room.room_type)} · ${room.current_occupancy}/${room.capacity} occupied` : ''}
      footer={room && can('hostels.manage', 'maintenance.manage') && <Button variant="secondary" icon={Wrench} onClick={() => setStatusOpen(true)}>Change room status</Button>}>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !room ? <PageLoader /> : room && (
        <div className="space-y-6">
          <DefinitionList cols={3} items={[
            ['Category', <span key="cat" className="font-semibold text-brand-700">{room.room_category || 'Normal'}</span>],
            ['Capacity', `${room.current_occupancy}/${room.capacity} beds`],
            ['Status', <StatusBadge key="s" status={room.status} />],
            ['AC', room.is_ac ? 'Yes' : 'No'],
            ['Attached bath', room.attached_bath ? 'Yes' : 'No'],
            room.status_reason && ['Reason', room.status_reason]
          ]} />
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Beds</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {room.beds.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {b.student_id ? <Avatar name={b.student_name} src={b.photo_url} size="sm" /> : null}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{b.bed_code}</p>
                      {b.student_id ? <Link to={`/students/${b.student_id}`} className="text-xs text-brand-600 hover:underline">{b.student_name} · {b.register_number} · {b.department} Y{b.year_of_study}</Link> : <p className="text-xs text-slate-500">No occupant</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={b.status} />
                    {can('hostels.manage') && b.status !== 'occupied' && (b.status === 'available'
                      ? <Button size="xs" variant="ghost" icon={Ban} onClick={() => setBedAction({ bed: b, status: 'blocked' })}>Block</Button>
                      : room.status === 'active' && <Button size="xs" variant="ghost" icon={CheckCircle2} onClick={() => setBedAction({ bed: b, status: 'available' })}>Release</Button>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {room.maintenance.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Maintenance</h3>
              <ul className="space-y-1.5">{room.maintenance.map((m) => <li key={m.id} className="flex justify-between gap-2 text-sm"><span>{m.request_code} · {m.title}</span><StatusBadge status={m.status} /></li>)}</ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Allocation history</h3>
            {room.history.length === 0 ? <p className="text-sm text-slate-500">No allocations yet.</p> : (
              <ul className="space-y-2">{room.history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{h.student_name}</span> <span className="text-slate-500">({h.register_number}) · {h.bed_code}</span>
                    <span className="block text-xs text-slate-500">{fmtDate(h.allocated_at)} → {h.ended_at ? fmtDate(h.ended_at) : 'present'}{h.end_reason ? ` · ${h.end_reason}` : ''}</span></span>
                  <StatusBadge status={h.status} />
                </li>))}
              </ul>
            )}
          </section>
        </div>
      )}
      {statusOpen && room && <RoomStatusModal room={room} onClose={() => setStatusOpen(false)} onDone={() => { setStatusOpen(false); refresh(); }} />}
      <ConfirmDialog open={!!bedAction} onClose={() => setBedAction(null)} loading={bedPending} onConfirm={changeBed}
        title={bedAction ? `${bedAction.status === 'blocked' ? 'Block' : 'Release'} bed ${bedAction.bed.bed_code}` : ''}
        message={bedAction?.status === 'blocked' ? 'A blocked bed cannot be allocated until released.' : 'The bed will become available for allocation.'}
        reasonLabel="Reason" confirmLabel="Confirm" />
    </Drawer>
  );
}