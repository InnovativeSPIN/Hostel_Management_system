import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { useFetch, useListState } from '../../hooks/useFetch';
import api from '../../services/api';
import { leaveSchema } from '../../validations/schemas';
import { fmtDate, fmtDateTime, label, todayStr, addDaysStr } from '../../utils/format';
import { LeaveDrawer } from './LeavesPage';

function ApplyLeave({ onClose, onDone, guardian }) {
  const [file, setFile] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(leaveSchema),
    defaultValues: { leaveType: 'home', fromDate: addDaysStr(todayStr(), 1), toDate: addDaysStr(todayStr(), 2), expectedReturnAt: `${addDaysStr(todayStr(), 2)}T19:00`, guardianContact: guardian?.parent_phone || '', emergencyContact: guardian?.emergency_contact_phone || '' },
  });
  const submit = async (v) => {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.append(k, val));
    if (file) fd.append('document', file);
    try { const { data } = await api.post('/leaves', fd); toast.success(`Leave ${data.data.leaveCode} submitted for approval`); onDone(); } catch (err) { toast.error(err.message); }
  };
  const e = (k) => errors[k]?.message;
  return (
    <Modal open onClose={onClose} size="lg" title="Apply for leave" description="Your warden reviews the request; attendance reflects approved leave automatically."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="leave-form" loading={isSubmitting}>Submit request</Button></>}>
      <form id="leave-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Select label="Leave type" options={['home', 'medical', 'personal', 'academic', 'emergency'].map((t) => ({ value: t, label: label(t) }))} {...register('leaveType')} />
        <Input label="Destination" required error={e('destination')} {...register('destination')} />
        <Input label="From date" type="date" min={todayStr()} required error={e('fromDate')} {...register('fromDate')} />
        <Input label="To date" type="date" min={todayStr()} required error={e('toDate')} {...register('toDate')} />
        <Input label="Expected return (date & time)" type="datetime-local" required error={e('expectedReturnAt')} {...register('expectedReturnAt')} />
        <Input label="Parent / guardian contact" required error={e('guardianContact')} {...register('guardianContact')} />
        <Input label="Emergency contact" required error={e('emergencyContact')} {...register('emergencyContact')} />
        <label className="text-sm"><span className="label">Supporting document (optional)</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" onChange={(ev) => setFile(ev.target.files[0] || null)} /></label>
        <Textarea label="Reason" required className="sm:col-span-2" error={e('reason')} {...register('reason')} />
      </form>
    </Modal>
  );
}

export default function MyLeavesPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useListState();
  const { data, meta, loading, error, reload } = useFetch('/leaves', q);
  const me = useFetch('/students/me');
  const [applying, setApplying] = useState(params.get('new') === '1');
  const [cancel, setCancel] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [pending, setPending] = useState(false);
  const resident = me.data?.allocation;
  const doCancel = async (remarks) => {
    setPending(true);
    try { await api.patch(`/leaves/${cancel.id}/cancel`, { remarks: remarks || undefined }); toast.success('Leave cancelled'); setCancel(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <div>
      <PageHeader title="My Leave" subtitle="Apply for leave and track approvals" actions={<Button size="sm" icon={Plus} disabled={me.data && !resident} title={!resident ? 'Only hostel residents can apply' : undefined} onClick={() => setApplying(true)}>Apply for leave</Button>} />
      <div className="card">
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} onRowClick={(r) => setViewing(r.id)} columns={[
          { key: 'leave_code', header: 'Leave', render: (r) => <span className="font-medium">{r.leave_code}<span className="block text-xs font-normal text-slate-500">{label(r.leave_type)}</span></span> },
          { key: 'period', header: 'Period', render: (r) => `${fmtDate(r.from_date)} → ${fmtDate(r.to_date)}` },
          { key: 'ret', header: 'Return by', hideOnMobile: true, render: (r) => fmtDateTime(r.expected_return_at) },
          { key: 'destination', header: 'Destination', hideOnMobile: true },
          { key: 'status', header: 'Status', render: (r) => <div className="flex flex-col items-start gap-1"><StatusBadge status={r.status} />{r.is_overdue ? <Badge tone="red">Return overdue</Badge> : null}{r.review_remarks && <span className="text-xs text-slate-500">{r.review_remarks}</span>}</div> },
          { key: 'act', header: '', render: (r) => (r.status === 'pending' || (r.status === 'approved' && r.from_date > todayStr())) && <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setCancel(r); }}>Cancel</Button> },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {applying && <ApplyLeave guardian={me.data?.student} onClose={() => setApplying(false)} onDone={() => { setApplying(false); reload(); }} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} loading={pending} tone="danger" title={`Cancel ${cancel?.leave_code}?`} confirmLabel="Cancel leave" reasonLabel="Reason (optional)" reasonRequired={false} />
      <LeaveDrawer id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
