import { useState } from 'react';
import toast from 'react-hot-toast';
import { DoorOpen, ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterBar } from '../../components/ui/Misc';
import StudentPicker from '../../components/StudentPicker';
import { useFetch, useListState } from '../../hooks/useFetch';
import api from '../../services/api';
import { fmtDate, fmtMoney, label, todayStr, addDaysStr } from '../../utils/format';

const REASONS = ['course_completed', 'discontinued', 'transfer_to_day_scholar', 'medical', 'disciplinary', 'other'];

function NewExit({ onClose, onDone }) {
  const [student, setStudent] = useState(null);
  const [form, setForm] = useState({ requestedExitDate: addDaysStr(todayStr(), 7), reason: 'course_completed', reasonDetails: '' });
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      const { data } = await api.post('/exits', { ...form, studentId: student.id, reasonDetails: form.reasonDetails || undefined });
      toast.success(`Exit requested${data.data.pendingFees ? ` · pending fees ${fmtMoney(data.data.pendingFees)}` : ''}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} title="New exit request" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!student}>Create request</Button></>}>
      <div className="space-y-4">
        <StudentPicker value={student} onChange={setStudent} filters={{ hostelStatus: 'resident' }} required />
        <Input label="Requested exit date" type="date" min={todayStr()} value={form.requestedExitDate} onChange={(e) => setForm({ ...form, requestedExitDate: e.target.value })} />
        <Select label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} options={REASONS.map((r) => ({ value: r, label: label(r) }))} />
        <Textarea label="Details" value={form.reasonDetails} onChange={(e) => setForm({ ...form, reasonDetails: e.target.value })} />
      </div>
    </Modal>
  );
}

function InspectModal({ exit, onClose, onDone }) {
  const [form, setForm] = useState({ roomCondition: 'good', inspectionNotes: '', damageCharges: 0 });
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try { await api.patch(`/exits/${exit.id}/inspect`, { ...form, damageCharges: Number(form.damageCharges) || 0 }); toast.success('Inspection recorded'); onDone(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Room inspection · ${exit.bed_code}`} description={`${exit.student_name} (${exit.register_number})`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={form.inspectionNotes.trim().length < 3}>Save inspection</Button></>}>
      <div className="space-y-4">
        <Select label="Room condition" value={form.roomCondition} onChange={(e) => setForm({ ...form, roomCondition: e.target.value })} options={[{ value: 'good', label: 'Good' }, { value: 'minor_damage', label: 'Minor damage' }, { value: 'major_damage', label: 'Major damage' }]} />
        <Textarea label="Inspection notes" required value={form.inspectionNotes} onChange={(e) => setForm({ ...form, inspectionNotes: e.target.value })} placeholder="Keys returned, furniture condition, cleanliness…" />
        <Input label="Damage charges (₹)" type="number" min={0} value={form.damageCharges} onChange={(e) => setForm({ ...form, damageCharges: e.target.value })} />
      </div>
    </Modal>
  );
}

function ClearModal({ exit, onClose, onDone }) {
  const [exitDate, setExitDate] = useState(exit.requested_exit_date > todayStr() ? exit.requested_exit_date : todayStr());
  const [ack, setAck] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [pending, setPending] = useState(false);
  const outstanding = Number(exit.pending_fees) + Number(exit.damage_charges);
  const submit = async () => {
    setPending(true);
    try {
      await api.patch(`/exits/${exit.id}/clear`, { exitDate, acknowledgeDues: ack, remarks: remarks || undefined });
      toast.success(`Exit cleared · bed ${exit.bed_code} released`);
      onDone();
    } catch (err) { toast.error(err.message); if (err.code === 'PENDING_DUES') setAck(false); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} title="Final clearance" description="Fee verification → release bed → mark student exited (single transaction)"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" icon={CheckCircle2} onClick={submit} loading={pending} disabled={outstanding > 0 && !ack}>Clear & release bed</Button></>}>
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
          <dt className="text-slate-500">Pending fees (at inspection)</dt><dd className="text-right font-medium">{fmtMoney(exit.pending_fees)}</dd>
          <dt className="text-slate-500">Damage charges</dt><dd className="text-right font-medium">{fmtMoney(exit.damage_charges)}</dd>
          <dt className="text-slate-500">Room condition</dt><dd className="text-right">{label(exit.room_condition)}</dd>
        </dl>
        <Input label="Exit date" type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
        <Textarea label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        {outstanding > 0 && <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label={`Clear with ${fmtMoney(outstanding)} outstanding recorded against the student`} hint="The server re-checks dues at clearance time." />}
      </div>
    </Modal>
  );
}

export default function ExitsPage() {
  const [q, setQ] = useListState();
  const { data, meta, loading, error, reload } = useFetch('/exits', q);
  const [modal, setModal] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const done = () => { setModal(null); reload(); };
  const reject = async (remarks) => {
    setRejecting(true);
    try { await api.patch(`/exits/${modal.exit.id}/reject`, { remarks }); toast.success('Exit request rejected'); done(); } catch (err) { toast.error(err.message); } finally { setRejecting(false); }
  };
  return (
    <div>
      <PageHeader title="Hostel Exits" subtitle="Exit request → Fee verification → Room inspection → Clearance → Bed released"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Exits' }]} actions={<Button size="sm" icon={DoorOpen} onClick={() => setModal({ type: 'new' })}>New exit request</Button>} />
      <Tabs className="mb-3" value={q.status || ''} onChange={(status) => setQ({ status })} tabs={[
        { value: '', label: 'All' }, { value: 'requested', label: 'Awaiting inspection' }, { value: 'inspected', label: 'Awaiting clearance' }, { value: 'cleared', label: 'Cleared' }, { value: 'rejected', label: 'Rejected' },
      ]} />
      <div className="card">
        <FilterBar><SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student or register no" /></FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          { key: 'student', header: 'Student', render: (r) => <span className="font-medium">{r.student_name}<span className="block text-xs font-normal text-slate-500">{r.register_number} · {r.department} · {r.bed_code}</span></span> },
          { key: 'reason', header: 'Reason', render: (r) => <span>{label(r.reason)}{r.reason_details && <span className="block max-w-xs truncate text-xs text-slate-500">{r.reason_details}</span>}</span> },
          { key: 'requested_exit_date', header: 'Exit date', render: (r) => (r.exit_date ? fmtDate(r.exit_date) : `${fmtDate(r.requested_exit_date)} (req.)`) },
          { key: 'dues', header: 'Dues', render: (r) => (Number(r.pending_fees) + Number(r.damage_charges) > 0 ? <span className="text-red-700">{fmtMoney(Number(r.pending_fees) + Number(r.damage_charges))}</span> : fmtMoney(0)) },
          { key: 'room_condition', header: 'Room', hideOnMobile: true, render: (r) => label(r.room_condition) },
          { key: 'clearance_status', header: 'Status', render: (r) => <StatusBadge status={r.clearance_status} /> },
          { key: 'act', header: '', render: (r) => (
            <div className="flex gap-1">
              {r.clearance_status === 'requested' && <Button size="xs" icon={ClipboardCheck} onClick={() => setModal({ type: 'inspect', exit: r })}>Inspect</Button>}
              {r.clearance_status === 'inspected' && <Button size="xs" variant="success" icon={CheckCircle2} onClick={() => setModal({ type: 'clear', exit: r })}>Clear</Button>}
              {['requested', 'inspected'].includes(r.clearance_status) && <Button size="xs" variant="ghost" icon={XCircle} onClick={() => setModal({ type: 'reject', exit: r })}>Reject</Button>}
            </div>
          ) },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {modal?.type === 'new' && <NewExit onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'inspect' && <InspectModal exit={modal.exit} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'clear' && <ClearModal exit={modal.exit} onClose={() => setModal(null)} onDone={done} />}
      <ConfirmDialog open={modal?.type === 'reject'} onClose={() => setModal(null)} onConfirm={reject} loading={rejecting} tone="danger" title="Reject exit request" reasonLabel="Reason" confirmLabel="Reject" />
    </div>
  );
}
