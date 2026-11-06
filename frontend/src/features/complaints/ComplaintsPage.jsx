import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Lightbulb, Camera, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination, toggleSort } from '../../components/ui/DataTable';
import { StatusBadge, SlaBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState, useDebounce } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { complaintSchema } from '../../validations/schemas';
import { fmtDateTime, label, timeAgo } from '../../utils/format';

export const CATEGORIES = ['electrical', 'plumbing', 'cleaning', 'internet', 'furniture', 'food', 'security', 'other'];
const SLA_HINT = { critical: '4 hours', high: '12 hours', medium: '24 hours', low: '72 hours' };

function RaiseComplaint({ onClose, onDone }) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(complaintSchema), defaultValues: { category: 'electrical', priority: 'medium' } });
  const [suggestion, setSuggestion] = useState(null);
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const text = useDebounce(`${watch('title') || ''} ${watch('description') || ''}`.trim(), 500);
  const priority = watch('priority');

  useEffect(() => {
    if (text.length < 8) { setSuggestion(null); return; }
    api.post('/complaints/suggest', { text }).then((r) => setSuggestion(r.data.data)).catch(() => {});
  }, [text]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) {
      toast.error('You can upload a maximum of 3 images');
      return;
    }
    const valid = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) {
      toast.error('Only JPG and PNG images under 5MB are allowed');
    }
    const next = [...images, ...valid].slice(0, 3);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async (v) => {
    try {
      let payload = v;
      let headers = undefined;
      if (images.length > 0) {
        const fd = new FormData();
        Object.entries(v).forEach(([k, val]) => {
          if (val !== undefined && val !== null) fd.append(k, val);
        });
        images.forEach((img) => fd.append('images', img));
        payload = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      }
      const { data } = await api.post('/complaints', payload, { headers });
      toast.success(`${data.data.complaintCode} registered${data.data.assignedTo ? ` · assigned to ${data.data.assignedTo}` : ''}`);
      onDone(data.data.id);
    } catch (err) { toast.error(err.message); }
  };

  const differs = suggestion && (suggestion.category !== watch('category') || suggestion.priority !== priority);
  return (
    <Modal open onClose={onClose} size="lg" title="Raise a complaint" description="Your complaint is routed to the right staff member and tracked against a resolution deadline."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="cmp-form" loading={isSubmitting}>Submit</Button></>}>
      <form id="cmp-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Input label="Title" required placeholder="e.g. Ceiling fan not working" error={errors.title?.message} {...register('title')} />
        <Textarea label="Describe the problem" required rows={4} error={errors.description?.message} {...register('description')} />
        {differs && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
            <Lightbulb className="h-4 w-4" />Suggested: <b>{label(suggestion.category)}</b> · <b>{label(suggestion.priority)}</b>
            <span className="text-xs text-amber-700">(keyword rules)</span>
            <Button size="xs" variant="secondary" className="ml-auto" onClick={() => { setValue('category', suggestion.category); setValue('priority', suggestion.priority); }}>Use suggestion</Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} {...register('category')} />
          <Select label="Priority" hint={`Target resolution: ${SLA_HINT[priority]}`} options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: label(p) }))} {...register('priority')} />
        </div>
        <div>
          <label className="label mb-1 block">Photo Proof (Optional, max 3 photos)</label>
          <div className="flex flex-wrap items-center gap-3">
            {previews.map((src, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
                <img src={src} alt={`Proof ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white hover:bg-slate-900 transition-colors"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-100 transition-colors">
                <Camera className="h-5 w-5 text-slate-400" />
                <span className="mt-1 text-[10px] font-medium text-slate-500">Add Photo</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">JPG or PNG, max 5MB each. Useful for damaged items, electrical issues, or repairs.</p>
        </div>
      </form>
    </Modal>
  );
}

export default function ComplaintsPage() {
  const { is, can } = useAuth();
  const student = is('student');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hostels = useHostels();
  const [q, setQ] = useListState(student || params.get('sla') || params.get('status') ? {} : { open: 'true' });
  const { data, meta, loading, error, reload } = useFetch('/complaints', q);
  const staffList = useFetch(can('complaints.assign') ? '/users/staff' : null);
  const [raising, setRaising] = useState(params.get('new') === '1');
  const tab = q.sla === 'breached' ? 'breached' : q.sla === 'due_today' ? 'due' : q.open === 'true' ? 'open' : q.status === 'resolved' ? 'resolved' : 'all';
  const setTab = (t) => setQ({ open: t === 'open' ? 'true' : '', sla: t === 'breached' ? 'breached' : t === 'due' ? 'due_today' : '', status: t === 'resolved' ? 'resolved' : '' });

  return (
    <div>
      <PageHeader title={student ? 'My Complaints' : 'Complaints'} subtitle={student ? 'Track every complaint from submission to resolution' : 'Lifecycle tracking with SLA escalation (staff → warden → administrator)'}
        breadcrumbs={student ? undefined : [{ label: 'Dashboard', to: '/' }, { label: 'Complaints' }]}
        actions={can('complaints.create') && <Button size="sm" icon={Plus} onClick={() => setRaising(true)}>Raise complaint</Button>} />
      {!student && <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Open' }, { value: 'breached', label: '⚠ SLA breached' }, { value: 'due', label: 'Due today' }, { value: 'resolved', label: 'Awaiting student confirmation' }, { value: 'all', label: 'All' }]} />}
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Code, title, student, room" />
          <FilterSelect value={q.category} onChange={(v) => setQ({ category: v })} placeholder="All categories" options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} />
          <FilterSelect value={q.priority} onChange={(v) => setQ({ priority: v })} placeholder="Any priority" options={['critical', 'high', 'medium', 'low'].map((p) => ({ value: p, label: label(p) }))} />
          {!(tab === 'resolved') && <FilterSelect value={q.status} onChange={(v) => setQ({ status: v, open: '' })} placeholder="Any status" options={['pending', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected'].map((s) => ({ value: s, label: label(s) }))} />}
          {!student && <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />}
          {staffList.data && <FilterSelect value={q.assignedTo} onChange={(v) => setQ({ assignedTo: v })} placeholder="Any staff" options={staffList.data.map((s) => ({ value: s.id, label: s.name }))} />}
          {!student && <FilterSelect value={q.sla} onChange={(v) => setQ({ sla: v })} placeholder="Any SLA" options={[{ value: 'breached', label: 'Breached' }, { value: 'due_today', label: 'Due today' }, { value: 'on_track', label: 'On track' }]} />}
          <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
          <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} onRowClick={(r) => navigate(`/complaints/${r.id}`)} sort={q} onSort={(k) => setQ(toggleSort(q, k))}
          rowClassName={(r) => (r.sla_breached ? 'bg-red-50/40' : '')} columns={[
            { key: 'complaint_code', header: 'Complaint', sortKey: 'created', render: (r) => (
              <span>
                <b>{r.complaint_code}</b> <span className="text-slate-700">{r.title}</span>
                {r.attachments_count > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200 ml-1.5">
                    <Camera className="h-3 w-3" />{r.attachments_count}
                  </span>
                )}
                <span className="block text-xs text-slate-500">{label(r.category)} · {timeAgo(r.created_at)}</span>
              </span>
            ) },
            ...(student ? [] : [{ key: 'student', header: 'Student / room', hideOnMobile: true, render: (r) => <span>{r.student_name}<span className="block text-xs text-slate-500">{r.hostel_code}-{r.room_number}</span></span> }]),
            { key: 'priority', header: 'Priority', sortKey: 'priority', render: (r) => <StatusBadge status={r.priority} /> },
            { key: 'assigned', header: 'Assigned to', hideOnMobile: true, render: (r) => r.assigned_to_name || <span className="text-slate-400">Unassigned</span> },
            { key: 'sla', header: 'SLA due', sortKey: 'sla', render: (r) => <span className="text-xs">{fmtDateTime(r.sla_due_at)}<span className="mt-0.5 block"><SlaBadge breached={r.sla_breached} minutesToSla={r.minutes_to_sla} status={r.status} />{r.escalation_level > 0 && <Badge tone="purple" className="ml-1">Escalated L{r.escalation_level}</Badge>}</span></span> },
            { key: 'status', header: 'Status', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {raising && <RaiseComplaint onClose={() => setRaising(false)} onDone={(id) => { setRaising(false); navigate(`/complaints/${id}`); }} />}
    </div>
  );
}
