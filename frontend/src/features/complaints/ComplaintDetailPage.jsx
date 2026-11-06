import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Star, UserPlus, Play, CheckCircle2, RotateCcw, XCircle, MessageSquare, Hammer, Clock, Camera, Image, X, ExternalLink } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, DefinitionList } from '../../components/ui/Card';
import { StatusBadge, SlaBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Select, Textarea } from '../../components/ui/Field';
import { Timeline } from '../../components/ui/Misc';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDateTime, label, duration } from '../../utils/format';

function lifecycle(c) {
  const find = (to) => c.updates.find((u) => u.to_status === to);
  const steps = [
    { title: 'Submitted', done: true, time: c.created_at, by: c.student_name },
    { title: `Assigned${c.assigned_to_name ? ` to ${c.assigned_to_name}` : ''}`, done: !!c.assigned_to, time: find('assigned')?.created_at },
    { title: 'Work in progress', done: ['in_progress', 'resolved', 'closed'].includes(c.status) || !!find('in_progress'), time: find('in_progress')?.created_at },
    { title: 'Resolved', done: ['resolved', 'closed'].includes(c.status), time: c.resolved_at, note: c.resolution_note },
    { title: 'Student confirmation', done: c.status === 'closed', time: c.closed_at, note: c.student_rating ? `Rated ${c.student_rating}/5${c.student_feedback ? ` — ${c.student_feedback}` : ''}` : null },
  ];
  if (c.status === 'rejected') return [steps[0], { title: 'Rejected', done: true, tone: 'red', time: c.closed_at, note: find('rejected')?.note }];
  return steps;
}

function AssignModal({ c, onClose, onDone }) {
  const { data: staff } = useFetch('/users/staff', { hostelId: c.hostel_id });
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try { await api.patch(`/complaints/${c.id}/assign`, { assignedTo: Number(assignedTo), note: note || undefined }); toast.success('Assigned'); onDone(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Assign ${c.complaint_code}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!assignedTo}>Assign</Button></>}>
      <div className="space-y-4">
        <Select label="Staff member" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Select…"
          options={(staff || []).filter((s) => s.id !== c.assigned_to).map((s) => ({ value: s.id, label: `${s.name} · ${s.designation || s.role}${s.staff_skill === c.category ? ' ★ skill match' : ''} · ${s.open_complaints} open` }))} />
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}


function AddPhotoModal({ c, onClose, onDone }) {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [type, setType] = useState('complaint');
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

  const remove = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!images.length) { toast.error('Please select at least one photo'); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.append('attachmentType', type);
      images.forEach((img) => fd.append('images', img));
      await api.post(`/complaints/${c.id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Added ${images.length} photo(s)`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Add Photo Proof"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!images.length}>Upload</Button></>}>
      <div className="space-y-4">
        <Select label="Photo type" value={type} onChange={(e) => setType(e.target.value)}
          options={[
            { value: 'complaint', label: 'Complaint Photo' },
            { value: 'before', label: 'Before Work Photo' },
            { value: 'after', label: 'Resolution Proof Photo' },
          ]} />
        <div>
          <label className="label mb-1 block">Select photos (max 3)</label>
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
                <img src={src} alt="Preview" className="h-full w-full object-cover" />
                <button type="button" onClick={() => remove(i)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                <Camera className="h-4 w-4 text-slate-400" />
                <span className="text-[9px] text-slate-500">Upload</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ResolveWithProofModal({ c, onClose, onDone }) {
  const [note, setNote] = useState('');
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

  const remove = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!note.trim()) { toast.error('Please enter what was done'); return; }
    setPending(true);
    try {
      let body;
      let headers;
      if (images.length > 0) {
        const fd = new FormData();
        fd.append('status', 'resolved');
        fd.append('note', note.trim());
        images.forEach((img) => fd.append('images', img));
        body = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        body = { status: 'resolved', note: note.trim() };
      }
      await api.patch(`/complaints/${c.id}/status`, body, { headers });
      toast.success('Marked as resolved');
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Mark as resolved" description="The student will be asked to confirm the fix."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" onClick={submit} loading={pending}>Resolve</Button></>}>
      <div className="space-y-4">
        <Textarea label="What was done?" required placeholder="e.g. Capacitor replaced, tested and running normally." value={note} onChange={(e) => setNote(e.target.value)} />
        <div>
          <label className="label mb-1 block">Resolution proof photos (optional, max 3)</label>
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
                <img src={src} alt="Proof" className="h-full w-full object-cover" />
                <button type="button" onClick={() => remove(i)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                <Camera className="h-4 w-4 text-slate-400" />
                <span className="text-[9px] text-slate-500">Proof photo</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmResolution({ c, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try { await api.patch(`/complaints/${c.id}/status`, { status: 'closed', rating, feedback: feedback || undefined }); toast.success('Thanks! Complaint closed.'); onDone(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Confirm the issue is fixed" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" onClick={submit} loading={pending}>Confirm & close</Button></>}>
      <div className="space-y-4">
        <div><span className="label">How satisfied are you?</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star`} onClick={() => setRating(n)}>
                <Star className={clsx('h-7 w-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
              </button>
            ))}
          </div></div>
        <Textarea label="Feedback (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function ComplaintDetailPage() {
  const { id } = useParams();
  const { can, is } = useAuth();
  const { data: c, loading, error, reload } = useFetch(`/complaints/${id}`);
  const [modal, setModal] = useState(null);
  const [pending, setPending] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !c) return <PageLoader />;
  const allowed = c.allowedTransitions;
  const role = c.actorRole;

  const changeStatus = async (status, note) => {
    setPending(true);
    try { await api.patch(`/complaints/${c.id}/status`, { status, note: note || undefined }); toast.success(`Status: ${label(status)}`); setModal(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  const addNote = async (note) => {
    setPending(true);
    try { await api.post(`/complaints/${c.id}/notes`, { note }); toast.success('Note added'); setModal(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  const createTask = async (note) => {
    setPending(true);
    try {
      const { data } = await api.post('/maintenance', { complaintId: c.id, category: ['electrical', 'plumbing', 'cleaning', 'furniture', 'internet'].includes(c.category) ? c.category : 'other', priority: c.priority, title: c.title, description: note, assignedTo: c.assigned_to || undefined });
      toast.success(`Maintenance task ${data.data.requestCode} created`); setModal(null); reload();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  const elapsed = (Date.now() - new Date(c.created_at.replace(' ', 'T')).getTime()) / 60000;

  return (
    <div className="space-y-5">
      <PageHeader title={`${c.complaint_code} · ${c.title}`} breadcrumbs={[{ label: is('student') ? 'My complaints' : 'Complaints', to: '/complaints' }, { label: c.complaint_code }]}
        actions={<div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={c.status} /><StatusBadge status={c.priority} /><SlaBadge breached={c.sla_breached} minutesToSla={c.minutes_to_sla} status={c.status} />{c.escalation_level > 0 && <Badge tone="purple">Escalated to {c.escalation_level === 1 ? 'warden' : 'administrator'}</Badge>}</div>} />

      {role && (
        <div className="card flex flex-wrap gap-2 p-3">
          {role === 'manager' && ['pending', 'assigned', 'in_progress'].includes(c.status) && <Button size="sm" icon={UserPlus} onClick={() => setModal('assign')}>{c.assigned_to ? 'Reassign' : 'Assign'}</Button>}
          {allowed.includes('in_progress') && c.status === 'assigned' && <Button size="sm" variant="secondary" icon={Play} onClick={() => changeStatus('in_progress', 'Work started')} loading={pending}>Start work</Button>}
          {allowed.includes('resolved') && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setModal('resolve')}>Mark resolved</Button>}
          {allowed.includes('closed') && role === 'student' && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setModal('confirm')}>Yes, it's fixed</Button>}
          {allowed.includes('in_progress') && c.status === 'resolved' && <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setModal('reopen')}>{role === 'student' ? 'Not fixed — reopen' : 'Reopen'}</Button>}
          {allowed.includes('closed') && role === 'manager' && <Button size="sm" variant="secondary" onClick={() => changeStatus('closed', 'Closed by warden')}>Close</Button>}
          {allowed.includes('rejected') && <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setModal('reject')}>Reject</Button>}
          {can('maintenance.manage') && ['assigned', 'in_progress'].includes(c.status) && c.maintenance.length === 0 && <Button size="sm" variant="ghost" icon={Hammer} onClick={() => setModal('task')}>Create maintenance task</Button>}
          {!['closed', 'rejected'].includes(c.status) && <Button size="sm" variant="ghost" icon={Camera} onClick={() => setModal('photo')}>Add photos</Button>}
          {!['closed', 'rejected'].includes(c.status) && <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => setModal('note')}>Add note</Button>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Details">
            <p className="whitespace-pre-line text-sm text-slate-700">{c.description}</p>
            <div className="mt-4"><DefinitionList cols={3} items={[
              ['Category', label(c.category)], ['Raised by', `${c.student_name} (${c.register_number})`], ['Location', `${c.hostel_name}, Room ${c.room_number || '—'}`],
              ['Assigned to', c.assigned_to_name ? `${c.assigned_to_name}${c.assigned_to_phone && !is('student') ? ` · ${c.assigned_to_phone}` : ''}` : 'Unassigned'],
              ['SLA', `${c.sla_hours}h · due ${fmtDateTime(c.sla_due_at)}`], ['Age', duration(elapsed)],
              c.maintenance.length > 0 && ['Maintenance', c.maintenance.map((m) => `${m.request_code} (${label(m.status)})`).join(', ')],
            ]} /></div>
          </Card>
          {c.attachments && c.attachments.length > 0 && (
            <Card title={`Photo Proof & Attachments (${c.attachments.length})`} icon={Image}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {c.attachments.map((att) => {
                  const isResolution = att.attachment_type === 'after';
                  const isBefore = att.attachment_type === 'before';
                  return (
                    <div
                      key={att.id}
                      onClick={() => setPreviewImg(att)}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm transition hover:shadow-md"
                    >
                      <img src={att.url} alt={att.original_name} className="h-28 w-full object-cover transition duration-200 group-hover:scale-105" />
                      <div className="p-2">
                        <span className={clsx(
                          'inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                          isResolution ? 'bg-emerald-100 text-emerald-800' : isBefore ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        )}>
                          {isResolution ? 'Resolution Proof' : isBefore ? 'Before Work' : 'Complaint Photo'}
                        </span>
                        <p className="mt-1 truncate text-xs text-slate-600" title={att.original_name}>{att.original_name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Activity log" icon={Clock}>
            <ul className="space-y-3">
              {c.updates.slice().reverse().map((u) => (
                <li key={u.id} className="flex gap-3 text-sm">
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', u.update_type === 'escalation' ? 'bg-red-500' : u.update_type === 'note' ? 'bg-slate-400' : 'bg-brand-500')} aria-hidden />
                  <div>
                    <p className="text-slate-800">{u.from_status && u.to_status && u.from_status !== u.to_status ? <><b>{label(u.from_status)}</b> → <b>{label(u.to_status)}</b>{u.note ? ` · ${u.note}` : ''}</> : u.note || label(u.to_status)}</p>
                    <p className="text-xs text-slate-500">{fmtDateTime(u.created_at)} · {u.user_name ? `${u.user_name}${u.user_role ? ` (${u.user_role})` : ''}` : 'System'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card title="Complaint lifecycle"><Timeline steps={lifecycle(c)} /></Card>
      </div>

      {modal === 'assign' && <AssignModal c={c} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'confirm' && <ConfirmResolution c={c} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'resolve' && <ResolveWithProofModal c={c} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'photo' && <AddPhotoModal c={c} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      <ConfirmDialog open={modal === 'reopen'} onClose={() => setModal(null)} loading={pending} onConfirm={(n) => changeStatus('in_progress', n)} title="Reopen complaint" reasonLabel="What is still not fixed?" confirmLabel="Reopen" />
      <ConfirmDialog open={modal === 'reject'} onClose={() => setModal(null)} loading={pending} onConfirm={(n) => changeStatus('rejected', n)} tone="danger" title="Reject complaint" reasonLabel="Reason (shared with student)" confirmLabel="Reject" />
      <ConfirmDialog open={modal === 'note'} onClose={() => setModal(null)} loading={pending} onConfirm={addNote} title="Add a note" reasonLabel="Note" confirmLabel="Add note" />
      <ConfirmDialog open={modal === 'task'} onClose={() => setModal(null)} loading={pending} onConfirm={createTask} title="Create maintenance task" message="Links a maintenance request to this complaint." reasonLabel="Work description" confirmLabel="Create task" />

      {previewImg && (
        <Modal open onClose={() => setPreviewImg(null)} size="lg" title={previewImg.original_name} description={`${previewImg.attachment_type === 'after' ? 'Resolution Proof' : previewImg.attachment_type === 'before' ? 'Before Work' : 'Complaint Photo'} · ${fmtDateTime(previewImg.created_at)}`}
          footer={<><Button variant="secondary" onClick={() => setPreviewImg(null)}>Close</Button><a href={previewImg.url} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open original</a></>}>
          <div className="flex items-center justify-center overflow-hidden rounded-lg bg-slate-900">
            <img src={previewImg.url} alt={previewImg.original_name} className="max-h-[70vh] max-w-full object-contain" />
          </div>
        </Modal>
      )}

      {is('student') && <p className="text-xs text-slate-400">Need help urgently? <Link to="/" className="text-brand-600">Contact your warden</Link>.</p>}
    </div>
  );
}
