import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Play, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDate, fmtMoney, label } from '../../utils/format';

const CATS = ['electrical', 'plumbing', 'cleaning', 'furniture', 'structural', 'internet', 'pest_control', 'other'];

function NewRequest({ onClose, onDone }) {
  const hostels = useHostels();
  const [form, setForm] = useState({ hostelId: hostels[0]?.id || '', roomId: '', category: 'electrical', priority: 'medium', title: '', description: '', blocksRoom: false, assignedTo: '' });
  const [beforeImage, setBeforeImage] = useState(null);
  const rooms = useFetch(form.hostelId ? '/rooms' : null, { hostelId: form.hostelId, limit: 200 });
  const staff = useFetch(form.hostelId ? '/users/staff' : null, { hostelId: form.hostelId, role: 'staff' });
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.append('hostelId', String(form.hostelId));
      if (form.roomId) fd.append('roomId', String(form.roomId));
      fd.append('category', form.category);
      fd.append('priority', form.priority);
      fd.append('title', form.title);
      if (form.description) fd.append('description', form.description);
      fd.append('blocksRoom', String(form.blocksRoom));
      if (form.assignedTo) fd.append('assignedTo', String(form.assignedTo));
      if (beforeImage) fd.append('beforeImage', beforeImage);

      const { data } = await api.post('/maintenance', fd);
      toast.success(`${data.data.requestCode} created${form.blocksRoom ? ' · room blocked from allocation' : ''}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="New maintenance request" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={form.title.trim().length < 3 || !form.hostelId}>Create</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Hostel" value={form.hostelId} onChange={set('hostelId')} options={hostelOptions(hostels)} />
        <Select label="Room (optional)" value={form.roomId} onChange={set('roomId')} placeholder="Common area / whole hostel" options={(rooms.data || []).map((r) => ({ value: r.id, label: `Room ${r.room_number} (${r.floor_label})` }))} />
        <Select label="Category" value={form.category} onChange={set('category')} options={CATS.map((c) => ({ value: c, label: label(c) }))} />
        <Select label="Priority" value={form.priority} onChange={set('priority')} options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: label(p) }))} />
        <Input label="Title" required className="sm:col-span-2" value={form.title} onChange={set('title')} />
        <Textarea label="Description" className="sm:col-span-2" value={form.description} onChange={set('description')} />
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">Before Photo (Optional)</label>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => setBeforeImage(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100" />
        </div>
        <Select label="Assign to" value={form.assignedTo} onChange={set('assignedTo')} placeholder="Unassigned" options={(staff.data || []).map((s) => ({ value: s.id, label: `${s.name} · ${s.designation}` }))} />
        {form.roomId && <Checkbox className="sm:mt-6" label="Block room while work is open" hint="Free beds become unavailable; occupants are notified." checked={form.blocksRoom} onChange={set('blocksRoom')} />}
      </div>
    </Modal>
  );
}

function UpdateModal({ item, onClose, onDone }) {
  const next = item.status === 'open' ? 'in_progress' : 'completed';
  const [form, setForm] = useState({ status: next, notes: item.notes || '', cost: item.cost ?? '' });
  const [afterImage, setAfterImage] = useState(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.append('status', form.status);
      if (form.notes) fd.append('notes', form.notes);
      if (form.cost !== '') fd.append('cost', String(form.cost));
      if (afterImage) fd.append('afterImage', afterImage);

      const { data } = await api.patch(`/maintenance/${item.id}`, fd);
      toast.success(`${item.request_code}: ${label(form.status)}${data.data.roomReleased ? ' · room reactivated for allocation' : ''}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Update ${item.request_code}`} description={item.title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save</Button></>}>
      <div className="space-y-4">
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={(item.status === 'open' ? ['in_progress', 'completed', 'cancelled'] : ['completed', 'open', 'cancelled']).map((s) => ({ value: s, label: label(s) }))} />
        <Textarea label={form.status === 'completed' ? 'Completion notes' : 'Notes'} required={form.status === 'completed'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Input label="Cost (₹)" type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        <div>
          <label className="block text-sm font-medium text-slate-700">After Photo (Completion Proof)</label>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => setAfterImage(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100" />
        </div>
      </div>
    </Modal>
  );
}

export default function MaintenancePage() {
  const { can } = useAuth();
  const hostels = useHostels();
  const [q, setQ] = useListState({ open: 'true' });
  const { data, meta, loading, error, reload } = useFetch('/maintenance', q);
  const [modal, setModal] = useState(null);
  const done = () => { setModal(null); reload(); };
  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Room → Maintenance blocks new allocation, notifies occupants and tracks the task to completion" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Maintenance' }]}
        actions={can('maintenance.manage') && <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'new' })}>New request</Button>} />
      <Tabs className="mb-3" value={q.open === 'true' ? 'open' : q.status || 'all'} onChange={(t) => setQ({ open: t === 'open' ? 'true' : '', status: ['completed', 'cancelled'].includes(t) ? t : '' })}
        tabs={[{ value: 'open', label: 'Open' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-60" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Code, title, room" />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
          <FilterSelect value={q.category} onChange={(v) => setQ({ category: v })} placeholder="All categories" options={CATS.map((c) => ({ value: c, label: label(c) }))} />
          <FilterSelect value={q.priority} onChange={(v) => setQ({ priority: v })} placeholder="Any priority" options={['critical', 'high', 'medium', 'low'].map((p) => ({ value: p, label: label(p) }))} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          { key: 'request_code', header: 'Request', render: (r) => (
            <span>
              <b>{r.request_code}</b> {r.title}
              <span className="block text-xs text-slate-500">
                {label(r.category)}{r.complaint_code ? ` · from ${r.complaint_code}` : ''}
                {r.before_image && <a href={`/api/maintenance/${r.id}/images/before`} target="_blank" rel="noreferrer" className="ml-2 font-medium text-brand-600 underline">Before photo</a>}
                {r.after_image && <a href={`/api/maintenance/${r.id}/images/after`} target="_blank" rel="noreferrer" className="ml-2 font-medium text-emerald-600 underline">After photo</a>}
              </span>
            </span>
          ) },
          { key: 'loc', header: 'Location', render: (r) => <span>Hostel {r.hostel_code}{r.room_number ? ` · Room ${r.room_number}` : ''}{r.blocks_room ? <Badge tone="yellow" className="ml-1">Room blocked</Badge> : null}</span> },
          { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
          { key: 'assigned_to_name', header: 'Assigned', hideOnMobile: true, render: (r) => r.assigned_to_name || '—' },
          { key: 'age', header: 'Opened', hideOnMobile: true, render: (r) => <span>{fmtDate(r.created_at)}{['open', 'in_progress'].includes(r.status) && r.age_days > 3 && <Badge tone="red" className="ml-1">{r.age_days}d</Badge>}</span> },
          { key: 'cost', header: 'Cost', hideOnMobile: true, render: (r) => (r.cost ? fmtMoney(r.cost) : '—') },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'act', header: '', render: (r) => can('maintenance.manage') && ['open', 'in_progress'].includes(r.status) && <Button size="xs" variant="secondary" icon={r.status === 'open' ? Play : CheckCircle2} onClick={() => setModal({ type: 'update', item: r })}>Update</Button> },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {modal?.type === 'new' && <NewRequest onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'update' && <UpdateModal item={modal.item} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}
