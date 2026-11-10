import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Calendar, CheckCircle2, LogOut, BedDouble, ShieldAlert, Sparkles } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDate, label, todayStr } from '../../utils/format';

function BookRoomModal({ room, onClose, onDone }) {
  const [form, setForm] = useState({
    guestRoomId: room?.id || '',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    purpose: '',
    checkInDate: todayStr(),
    checkOutDate: todayStr(),
  });
  const { data: availableData } = useFetch('/guest-rooms/available', { checkIn: form.checkInDate, checkOut: form.checkOutDate });
  const [pending, setPending] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.guestRoomId) return toast.error('Select a guest room');
    setPending(true);
    try {
      const { data } = await api.post('/guest-rooms/bookings', form);
      toast.success(`Booking ${data.data.bookingCode} confirmed (Zero fee applied)`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPending(false);
    }
  };

  const roomsList = availableData?.rooms || [];

  return (
    <Modal open onClose={onClose} size="lg" title="Guest Room Allocation" description="Institutional guest policy: Zero fee charged for college guests"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="book-form" loading={pending}>Confirm Booking</Button></>}>
      <form id="book-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200 flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
          <span><b>Complimentary Stay:</b> Institutional rule enforces ₹0.00 tariff for verified campus guests.</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Check-in Date" type="date" required value={form.checkInDate} onChange={set('checkInDate')} />
          <Input label="Check-out Date" type="date" required value={form.checkOutDate} onChange={set('checkOutDate')} />
        </div>

        <Select label="Available Guest Room" required value={form.guestRoomId} onChange={set('guestRoomId')}
          options={roomsList.map((r) => ({ value: r.id, label: `${r.room_number} (${r.capacity} sharing · ${r.is_ac ? 'AC' : 'Non-AC'})${r.notes ? ` - ${r.notes}` : ''}` }))} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Guest Full Name" required value={form.guestName} onChange={set('guestName')} placeholder="e.g. Dr. Rajesh Kumar" />
          <Input label="Guest Phone" required value={form.guestPhone} onChange={set('guestPhone')} placeholder="e.g. +91 98765 43210" />
        </div>

        <Input label="Guest Email (Optional)" type="email" value={form.guestEmail} onChange={set('guestEmail')} placeholder="guest@example.com" />
        <Textarea label="Purpose of Visit" required value={form.purpose} onChange={set('purpose')} placeholder="e.g. External Examiner for Viva / Guest Faculty / Inspection" rows={2} />
      </form>
    </Modal>
  );
}

function NewGuestRoomModal({ onClose, onDone }) {
  const [form, setForm] = useState({ roomNumber: '', capacity: 2, isAc: true, notes: '' });
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    try {
      await api.post('/guest-rooms', { ...form, capacity: Number(form.capacity) });
      toast.success(`Guest room ${form.roomNumber} created`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Add Guest Room Master" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="new-room-form" loading={pending}>Save Room</Button></>}>
      <form id="new-room-form" onSubmit={submit} className="space-y-4">
        <Input label="Room Number / Identifier" required value={form.roomNumber} onChange={set('roomNumber')} placeholder="e.g. GR-101" />
        <Input label="Capacity (Beds)" type="number" min={1} max={10} required value={form.capacity} onChange={set('capacity')} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isAc} onChange={set('isAc')} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          Air Conditioned (AC Room)
        </label>
        <Textarea label="Room Description / Notes" value={form.notes} onChange={set('notes')} placeholder="e.g. VIP suite ground floor near reception" rows={2} />
      </form>
    </Modal>
  );
}

export default function GuestRoomsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('rooms');
  const { data: rooms, loading: roomsLoading, reload: reloadRooms } = useFetch('/guest-rooms');
  const [q, setQ] = useListState();
  const { data: bookings, meta, loading: bookingsLoading, reload: reloadBookings } = useFetch('/guest-rooms/bookings', q);
  const [modal, setModal] = useState(null);

  const checkIn = async (b) => {
    try {
      await api.patch(`/guest-rooms/bookings/${b.id}/check-in`);
      toast.success(`${b.guest_name} checked in`);
      reloadBookings();
      reloadRooms();
    } catch (err) { toast.error(err.message); }
  };

  const checkOut = async (b) => {
    try {
      await api.patch(`/guest-rooms/bookings/${b.id}/check-out`);
      toast.success(`${b.guest_name} checked out · room ${b.room_number} freed`);
      reloadBookings();
      reloadRooms();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Guest Rooms & Suites" subtitle="Guest room master, zero-fee allocations, check-in tracking & reports"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Guest Rooms' }]}
        actions={
          <div className="flex gap-2">
            {can('allocations.manage') && <Button size="sm" icon={Calendar} onClick={() => setModal({ type: 'book' })}>Book Guest Room</Button>}
            {can('hostels.manage') && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setModal({ type: 'new_room' })}>New Room Master</Button>}
          </div>
        }
      />

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'rooms', label: 'Room Master & Live Status' }, { value: 'bookings', label: 'Booking Ledger & History' }]} />

      {tab === 'rooms' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(rooms || []).map((r) => (
            <div key={r.id} className="card p-4 space-y-3 border border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{r.room_number}</h3>
                  <p className="text-xs text-slate-500">{r.capacity} Beds · {r.is_ac ? 'Air Conditioned' : 'Non-AC'}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.notes && <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">{r.notes}</p>}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="text-emerald-700 font-semibold">Tariff: ₹0.00 (Free)</span>
                {r.status === 'available' && can('allocations.manage') && (
                  <Button size="xs" variant="secondary" onClick={() => setModal({ type: 'book', room: r })}>Book This Room</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <FilterBar>
            <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Guest name, phone, code" />
            <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
            <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
          </FilterBar>
          <DataTable rows={bookings} loading={bookingsLoading} onRetry={reloadBookings} columns={[
            { key: 'booking_code', header: 'Booking Code', render: (b) => <span className="font-semibold text-slate-900">{b.booking_code}</span> },
            { key: 'guest', header: 'Guest', render: (b) => <span><b>{b.guest_name}</b><span className="block text-xs text-slate-500">{b.guest_phone}</span></span> },
            { key: 'room', header: 'Room', render: (b) => <span>Room <b>{b.room_number}</b></span> },
            { key: 'dates', header: 'Stay Dates', render: (b) => <span className="text-xs">{fmtDate(b.check_in_date)} → {fmtDate(b.check_out_date)}</span> },
            { key: 'purpose', header: 'Purpose', render: (b) => <span className="text-xs text-slate-700 truncate max-w-xs block">{b.purpose}</span> },
            { key: 'fee', header: 'Fee', render: () => <Badge tone="green">₹0 (Free)</Badge> },
            { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
            { key: 'act', header: '', render: (b) => (
              <div className="flex gap-1">
                {b.status === 'reserved' && <Button size="xs" variant="secondary" icon={CheckCircle2} onClick={() => checkIn(b)}>Check In</Button>}
                {b.status === 'checked_in' && <Button size="xs" variant="ghost" icon={LogOut} onClick={() => checkOut(b)}>Check Out</Button>}
              </div>
            ) },
          ]} />
          <Pagination meta={meta} onPage={(page) => setQ({ page })} />
        </div>
      )}

      {modal?.type === 'book' && <BookRoomModal room={modal.room} onClose={() => setModal(null)} onDone={() => { setModal(null); reloadBookings(); reloadRooms(); }} />}
      {modal?.type === 'new_room' && <NewGuestRoomModal onClose={() => setModal(null)} onDone={() => { setModal(null); reloadRooms(); }} />}
    </div>
  );
}

