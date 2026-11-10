import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Star, UserPlus, Play, CheckCircle2, RotateCcw, XCircle, MessageSquare, Hammer, Clock } from 'lucide-react';
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
            {c.attachments && c.attachments.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Image Proofs ({c.attachments.length})</h4>
                <div className="flex flex-wrap gap-3">
                  {c.attachments.map((att) => (
                    <a key={att.id} href={`/api/complaints/${c.id}/attachments/${att.id}`} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-lg border border-slate-200">
                      <img src={`/api/complaints/${c.id}/attachments/${att.id}`} alt={att.original_name} className="h-24 w-32 object-cover transition-transform group-hover:scale-105" />
                      <span className="block max-w-[128px] truncate bg-slate-900/70 p-1 text-center text-[10px] text-white">{att.original_name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>
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
      <ConfirmDialog open={modal === 'resolve'} onClose={() => setModal(null)} loading={pending} onConfirm={(n) => changeStatus('resolved', n)} tone="success" title="Mark as resolved" message="The student will be asked to confirm the fix." reasonLabel="What was done?" confirmLabel="Resolve" />
      <ConfirmDialog open={modal === 'reopen'} onClose={() => setModal(null)} loading={pending} onConfirm={(n) => changeStatus('in_progress', n)} title="Reopen complaint" reasonLabel="What is still not fixed?" confirmLabel="Reopen" />
      <ConfirmDialog open={modal === 'reject'} onClose={() => setModal(null)} loading={pending} onConfirm={(n) => changeStatus('rejected', n)} tone="danger" title="Reject complaint" reasonLabel="Reason (shared with student)" confirmLabel="Reject" />
      <ConfirmDialog open={modal === 'note'} onClose={() => setModal(null)} loading={pending} onConfirm={addNote} title="Add a note" reasonLabel="Note" confirmLabel="Add note" />
      <ConfirmDialog open={modal === 'task'} onClose={() => setModal(null)} loading={pending} onConfirm={createTask} title="Create maintenance task" message="Links a maintenance request to this complaint." reasonLabel="Work description" confirmLabel="Create task" />
      {is('student') && <p className="text-xs text-slate-400">Need help urgently? <Link to="/" className="text-brand-600">Contact your warden</Link>.</p>}
    </div>
  );
}
