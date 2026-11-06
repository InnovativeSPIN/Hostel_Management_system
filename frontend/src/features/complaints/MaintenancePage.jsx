import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Play, CheckCircle2, Camera, X, ExternalLink, Image } from 'lucide-react';
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
  const [beforeImages, setBeforeImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const rooms = useFetch(form.hostelId ? '/rooms' : null, { hostelId: form.hostelId, limit: 200 });
  const staff = useFetch(form.hostelId ? '/users/staff' : null, { hostelId: form.hostelId, role: 'staff' });
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (beforeImages.length + files.length > 3) { toast.error('Max 3 images'); return; }
    const valid = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) toast.error('Only JPG/PNG images under 5MB allowed');
    const next = [...beforeImages, ...valid].slice(0, 3);
    setBeforeImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    const next = beforeImages.filter((_, i) => i !== idx);
    setBeforeImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    setPending(true);
    try {
      let body;
      let headers;
      if (beforeImages.length > 0) {
        const fd = new FormData();
        fd.append('hostelId', String(Number(form.hostelId)));
        if (form.roomId) fd.append('roomId', String(Number(form.roomId)));
        fd.append('category', form.category);
        fd.append('priority', form.priority);
        fd.append('title', form.title);
        if (form.description) fd.append('description', form.description);
        fd.append('blocksRoom', form.blocksRoom ? 'true' : 'false');
        if (form.assignedTo) fd.append('assignedTo', String(Number(form.assignedTo)));
        beforeImages.forEach((img) => fd.append('before_images', img));
        body = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        body = { hostelId: Number(form.hostelId), roomId: form.roomId ? Number(form.roomId) : null, category: form.category, priority: form.priority, title: form.title, description: form.description || undefined, blocksRoom: form.blocksRoom, assignedTo: form.assignedTo ? Number(form.assignedTo) : null };
      }
      const { data } = await api.post('/maintenance', body, { headers });
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
        <Select label="Assign to" value={form.assignedTo} onChange={set('assignedTo')} placeholder="Unassigned" options={(staff.data || []).map((s) => ({ value: s.id, label: `${s.name} · ${s.designation}` }))} />
        {form.roomId && <Checkbox className="sm:mt-6" label="Block room while work is open" hint="Free beds become unavailable; occupants are notified." checked={form.blocksRoom} onChange={set('blocksRoom')} />}
        <div className="sm:col-span-2">
          <label className="label mb-1 block">Before Photos (Optional, max 3 photos)</label>
          <div className="flex flex-wrap items-center gap-3">
            {previews.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
                <img src={src} alt="Before preview" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeImage(i)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {beforeImages.length < 3 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                <Camera className="h-4 w-4 text-slate-400" />
                <span className="text-[9px] text-slate-500">Before</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">Attach initial condition photos before work begins.</p>
        </div>
      </div>
    </Modal>
  );
}

function UpdateModal({ item, onClose, onDone }) {
  const next = item.status === 'open' ? 'in_progress' : 'completed';
  const [form, setForm] = useState({ status: next, notes: item.notes || '', cost: item.cost ?? '' });
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [pending, setPending] = useState(false);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) { toast.error('Max 3 images'); return; }
    const valid = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) toast.error('Only JPG/PNG images under 5MB allowed');
    const next = [...images, ...valid].slice(0, 3);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    setPending(true);
    try {
      let body;
      let headers;
      if (images.length > 0) {
        const fd = new FormData();
        fd.append('status', form.status);
        if (form.notes) fd.append('notes', form.notes);
        if (form.cost !== '') fd.append('cost', String(Number(form.cost)));
        const fieldName = form.status === 'completed' ? 'after_images' : 'before_images';
        images.forEach((img) => fd.append(fieldName, img));
        body = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        body = { status: form.status, notes: form.notes || undefined, cost: form.cost === '' ? undefined : Number(form.cost) };
      }
      const { data } = await api.patch(`/maintenance/${item.id}`, body, { headers });
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
          <label className="label mb-1 block">{form.status === 'completed' ? 'Completion Proof Photos (After)' : 'Work Photos (Optional)'}</label>
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
                <img src={src} alt="Proof" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeImage(i)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                <Camera className="h-4 w-4 text-slate-400" />
                <span className="text-[9px] text-slate-500">Photo</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">Optional: attach up to 3 image proofs (JPG/PNG).</p>
        </div>
      </div>
    </Modal>
  );
}

function MaintenancePhotosModal({ item, onClose }) {
  const { data, loading } = useFetch(`/maintenance/${item.id}`);
  const [previewImg, setPreviewImg] = useState(null);
  const attachments = data?.attachments || [];
  const beforeList = attachments.filter((a) => a.attachment_type === 'before');
  const afterList = attachments.filter((a) => a.attachment_type === 'after');
  const otherList = attachments.filter((a) => !['before', 'after'].includes(a.attachment_type));

  return (
    <Modal open onClose={onClose} size="lg" title={`Proof Photos: ${item.request_code}`} description={item.title}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading proof photos…</p>
      ) : attachments.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No proof photos attached yet.</p>
      ) : (
        <div className="space-y-5">
          {beforeList.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />Before Work ({beforeList.length})
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {beforeList.map((a) => (
                  <div key={a.id} onClick={() => setPreviewImg(a)} className="cursor-pointer overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 p-1 hover:shadow-md transition">
                    <img src={a.url} alt={a.original_name} className="h-28 w-full object-cover rounded" />
                    <p className="mt-1 truncate text-xs text-slate-700 px-1">{a.original_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {afterList.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />After Completion ({afterList.length})
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {afterList.map((a) => (
                  <div key={a.id} onClick={() => setPreviewImg(a)} className="cursor-pointer overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/40 p-1 hover:shadow-md transition">
                    <img src={a.url} alt={a.original_name} className="h-28 w-full object-cover rounded" />
                    <p className="mt-1 truncate text-xs text-slate-700 px-1">{a.original_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherList.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />Other Photos ({otherList.length})
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {otherList.map((a) => (
                  <div key={a.id} onClick={() => setPreviewImg(a)} className="cursor-pointer overflow-hidden rounded-lg border border-blue-200 bg-blue-50/40 p-1 hover:shadow-md transition">
                    <img src={a.url} alt={a.original_name} className="h-28 w-full object-cover rounded" />
                    <p className="mt-1 truncate text-xs text-slate-700 px-1">{a.original_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewImg && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4" onClick={() => setPreviewImg(null)}>
              <div className="relative max-h-[85vh] max-w-2xl overflow-hidden rounded-lg bg-white p-2" onClick={(e) => e.stopPropagation()}>
                <img src={previewImg.url} alt={previewImg.original_name} className="max-h-[75vh] w-auto object-contain rounded" />
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600 px-1">
                  <span>{previewImg.original_name}</span>
                  <button type="button" onClick={() => setPreviewImg(null)} className="btn btn-secondary btn-xs">Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
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
              {r.attachments_count > 0 && (
                <button
                  type="button"
                  onClick={() => setModal({ type: 'photos', item: r })}
                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200 ml-1.5 hover:bg-blue-100 transition"
                  title="View attached proof photos"
                >
                  <Camera className="h-3 w-3" />{r.attachments_count}
                </button>
              )}
              <span className="block text-xs text-slate-500">{label(r.category)}{r.complaint_code ? ` · from ${r.complaint_code}` : ''}</span>
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
      {modal?.type === 'photos' && <MaintenancePhotosModal item={modal.item} onClose={() => setModal(null)} />}
    </div>
  );
}
