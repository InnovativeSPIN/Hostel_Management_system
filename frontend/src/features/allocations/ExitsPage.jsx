import { useState } from 'react';
import toast from 'react-hot-toast';
import { DoorOpen, ClipboardCheck, CheckCircle2, XCircle, FileText, Camera, Check, ShieldCheck, Download, X } from 'lucide-react';
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


function ApproveModal({ exit, onClose, onDone }) {
  const [remarks, setRemarks] = useState('Approved by warden. Ready for room inspection.');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      await api.patch(`/exits/${exit.id}/approve`, { remarks });
      toast.success('Exit request approved by warden');
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Warden Approval · ${exit.student_name}`} description={`${exit.register_number} · Bed ${exit.bed_code}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" icon={ShieldCheck} onClick={submit} loading={pending}>Approve Request</Button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
          <p><b>Requested Exit Date:</b> {fmtDate(exit.requested_exit_date)}</p>
          <p><b>Reason:</b> {label(exit.reason)}</p>
          {exit.reason_details && <p className="text-slate-600">"{exit.reason_details}"</p>}
        </div>
        <Textarea label="Warden Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Add instructions for room inspection or clearance…" />
      </div>
    </Modal>
  );
}

function InspectModal({ exit, onClose, onDone }) {
  const [form, setForm] = useState({ roomCondition: 'good', inspectionNotes: '', damageCharges: 0 });
  const [checklist, setChecklist] = useState({
    keysReturned: true,
    electricalOk: true,
    furnitureOk: true,
    cleanlinessOk: true,
    plumbingOk: true,
  });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(false);

  const toggleCheck = (k) => setChecklist((prev) => ({ ...prev, [k]: !prev[k] }));

  const handlePhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png'].includes(f.type)) {
      toast.error('Only JPG and PNG images are allowed');
      return;
    }
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    setPending(true);
    try {
      let body;
      let headers;
      if (photo) {
        const fd = new FormData();
        fd.append('roomCondition', form.roomCondition);
        fd.append('inspectionNotes', form.inspectionNotes || 'Inspection completed.');
        fd.append('damageCharges', String(Number(form.damageCharges) || 0));
        fd.append('checklist', JSON.stringify(checklist));
        fd.append('damage_photo', photo);
        body = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        body = {
          roomCondition: form.roomCondition,
          inspectionNotes: form.inspectionNotes || 'Inspection completed.',
          damageCharges: Number(form.damageCharges) || 0,
          checklist,
        };
      }
      await api.patch(`/exits/${exit.id}/inspect`, body, { headers });
      toast.success('Inspection and settlement calculation recorded');
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`Room inspection & Checklist · ${exit.bed_code}`} description={`${exit.student_name} (${exit.register_number})`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={form.inspectionNotes.trim().length < 3}>Save inspection & Calculate</Button></>}>
      <div className="space-y-4">
        <div>
          <label className="label mb-2 block font-semibold text-slate-800">Inspection Checklist</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <Checkbox label="Room keys handed over" checked={checklist.keysReturned} onChange={() => toggleCheck('keysReturned')} />
            <Checkbox label="Electrical fittings intact (fan, light, switches)" checked={checklist.electricalOk} onChange={() => toggleCheck('electricalOk')} />
            <Checkbox label="Furniture & almirah intact" checked={checklist.furnitureOk} onChange={() => toggleCheck('furnitureOk')} />
            <Checkbox label="Restroom & plumbing fixtures clean & undamaged" checked={checklist.plumbingOk} onChange={() => toggleCheck('plumbingOk')} />
            <Checkbox label="Room broom-clean and personal belongings cleared" checked={checklist.cleanlinessOk} onChange={() => toggleCheck('cleanlinessOk')} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Room condition" value={form.roomCondition} onChange={(e) => setForm({ ...form, roomCondition: e.target.value })} options={[{ value: 'good', label: 'Good · No issues' }, { value: 'minor_damage', label: 'Minor damage' }, { value: 'major_damage', label: 'Major damage' }]} />
          <Input label="Damage charges (₹)" type="number" min={0} value={form.damageCharges} onChange={(e) => setForm({ ...form, damageCharges: e.target.value })} />
        </div>

        <Textarea label="Inspection notes" required value={form.inspectionNotes} onChange={(e) => setForm({ ...form, inspectionNotes: e.target.value })} placeholder="Details of room condition, returned keys, or damages…" />

        <div>
          <label className="label mb-1 block">Damage Proof Photo (Optional)</label>
          <div className="flex items-center gap-3">
            {preview ? (
              <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img src={preview} alt="Damage Proof" className="h-full w-full object-cover" />
                <button type="button" onClick={() => { setPhoto(null); setPreview(null); }} className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-20 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition">
                <Camera className="h-5 w-5 text-slate-400" />
                <span className="mt-1 text-[11px] text-slate-500 font-medium">Add Photo</span>
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhoto} />
              </label>
            )}
            <p className="text-xs text-slate-400">Attach photo evidence of any room or fixture damage.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ClearModal({ exit, onClose, onDone }) {
  const { data: settle, loading } = useFetch(`/exits/${exit.id}/settlement`);
  const [exitDate, setExitDate] = useState(exit.requested_exit_date > todayStr() ? exit.requested_exit_date : todayStr());
  const [ack, setAck] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [pending, setPending] = useState(false);

  const downloadStatement = async () => {
    try {
      const res = await api.get(`/exits/${exit.id}/statement`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Exit_Settlement_${exit.register_number}_${exit.id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) { toast.error('Failed to download settlement statement'); }
  };

  const submit = async () => {
    setPending(true);
    try {
      await api.patch(`/exits/${exit.id}/clear`, { exitDate, acknowledgeDues: ack, remarks: remarks || undefined });
      toast.success(`Exit cleared · bed ${exit.bed_code} released & student archived`);
      onDone();
    } catch (err) { toast.error(err.message); if (err.code === 'PENDING_DUES') setAck(false); } finally { setPending(false); }
  };

  const netPayable = settle?.settlementType === 'payable' ? settle.netAmount : 0;
  const isRefundable = settle?.settlementType === 'refundable';

  return (
    <Modal open onClose={onClose} size="lg" title="Exit Clearance & Final Settlement" description={`Student: ${exit.student_name} (${exit.register_number}) · Bed: ${exit.bed_code}`}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="secondary" icon={Download} onClick={downloadStatement}>Download Statement (PDF)</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="success" icon={CheckCircle2} onClick={submit} loading={pending} disabled={netPayable > 0 && !ack}>
              Clear & Free Bed
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-4 text-sm">
        {loading ? (
          <p className="py-6 text-center text-slate-500">Calculating settlement breakdown from attendance and fees…</p>
        ) : settle && (
          <div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">Settlement Calculation</h4>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-slate-600">Pending Mess Bill (attendance based):</span>
                <span className="text-right font-medium">{fmtMoney(settle.pendingMessBill)} ({settle.attendanceSessions} sessions)</span>
                <span className="text-slate-600">Room Rent Due:</span>
                <span className="text-right font-medium">{fmtMoney(settle.roomRentDue)}</span>
                <span className="text-slate-600">Damage / Repair Charges:</span>
                <span className="text-right font-medium text-amber-700">{fmtMoney(settle.damageCharges)}</span>
                <span className="text-slate-600">Other Pending Fees:</span>
                <span className="text-right font-medium">{fmtMoney(settle.pendingFees)}</span>
                <div className="col-span-2 border-t border-slate-200 my-1" />
                <span className="text-slate-600">Less: Caution Deposit:</span>
                <span className="text-right font-medium text-emerald-700">- {fmtMoney(settle.cautionDeposit)}</span>
                {settle.advancePaid > 0 && (
                  <>
                    <span className="text-slate-600">Less: Advance Paid:</span>
                    <span className="text-right font-medium text-emerald-700">- {fmtMoney(settle.advancePaid)}</span>
                  </>
                )}
                <div className="col-span-2 border-t-2 border-slate-300 my-1" />
                <span className="font-bold text-slate-900 text-sm">
                  {isRefundable ? 'Net Refundable to Student:' : settle.settlementType === 'payable' ? 'Net Payable by Student:' : 'Final Balance:'}
                </span>
                <span className={`text-right font-bold text-sm ${isRefundable ? 'text-emerald-700' : settle.settlementType === 'payable' ? 'text-red-700' : 'text-slate-800'}`}>
                  {fmtMoney(settle.netAmount)} {isRefundable ? '(Refund)' : settle.settlementType === 'payable' ? '(Due)' : '(Nil Dues)'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Actual Exit Date" type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
          <div className="space-y-1">
            <label className="label">Room Condition</label>
            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{label(exit.room_condition || 'Inspected')}</p>
          </div>
        </div>

        <Textarea label="Clearance Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Remarks for settlement, refund transaction details, or key return…" />

        {netPayable > 0 && (
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} label={`Confirm clearance with ${fmtMoney(netPayable)} net dues recorded against student`} hint="The bed will be released to available status immediately." />
        )}
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
          { key: 'student', header: 'Student', render: (r) => (
            <span className="font-medium">
              {r.student_name}
              <span className="block text-xs font-normal text-slate-500">{r.register_number} · {r.department} · {r.bed_code}</span>
              {r.warden_approved_at && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 mt-0.5">
                  <ShieldCheck className="h-2.5 w-2.5" />Warden approved
                </span>
              )}
            </span>
          ) },
          { key: 'reason', header: 'Reason', render: (r) => <span>{label(r.reason)}{r.reason_details && <span className="block max-w-xs truncate text-xs text-slate-500">{r.reason_details}</span>}</span> },
          { key: 'requested_exit_date', header: 'Exit date', render: (r) => (r.exit_date ? fmtDate(r.exit_date) : `${fmtDate(r.requested_exit_date)} (req.)`) },
          { key: 'settlement', header: 'Settlement', render: (r) => {
            if (r.net_amount !== null && r.net_amount !== undefined) {
              if (r.settlement_type === 'refundable') return <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">Refund {fmtMoney(r.net_amount)}</span>;
              if (r.settlement_type === 'payable') return <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200">Due {fmtMoney(r.net_amount)}</span>;
              return <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">Nil Dues</span>;
            }
            return <span className="text-slate-400 text-xs">Pending insp.</span>;
          } },
          { key: 'room_condition', header: 'Inspection', hideOnMobile: true, render: (r) => (
            <div>
              <span className="text-xs">{label(r.room_condition || 'Pending')}</span>
              {r.damage_photo_url && (
                <a href={r.damage_photo_url} target="_blank" rel="noreferrer" className="block text-[11px] text-brand-600 hover:underline flex items-center gap-1 mt-0.5">
                  <Camera className="h-3 w-3" />Damage photo
                </a>
              )}
            </div>
          ) },
          { key: 'clearance_status', header: 'Status', render: (r) => <StatusBadge status={r.clearance_status} /> },
          { key: 'act', header: '', render: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.clearance_status === 'requested' && !r.warden_approved_at && (
                <Button size="xs" variant="secondary" icon={ShieldCheck} onClick={() => setModal({ type: 'approve', exit: r })}>Approve</Button>
              )}
              {r.clearance_status === 'requested' && (
                <Button size="xs" icon={ClipboardCheck} onClick={() => setModal({ type: 'inspect', exit: r })}>Inspect</Button>
              )}
              {r.clearance_status === 'inspected' && (
                <Button size="xs" variant="success" icon={CheckCircle2} onClick={() => setModal({ type: 'clear', exit: r })}>Clear & Settle</Button>
              )}
              {['inspected', 'cleared'].includes(r.clearance_status) && (
                <Button size="xs" variant="ghost" icon={FileText} onClick={async () => {
                  try {
                    const res = await api.get(`/exits/${r.id}/statement`, { responseType: 'blob' });
                    const blob = new Blob([res.data], { type: 'application/pdf' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Exit_Settlement_${r.register_number}_${r.id}.pdf`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch (_) { toast.error('Failed to download PDF'); }
                }}>PDF</Button>
              )}
              {['requested', 'inspected'].includes(r.clearance_status) && (
                <Button size="xs" variant="ghost" icon={XCircle} onClick={() => setModal({ type: 'reject', exit: r })}>Reject</Button>
              )}
            </div>
          ) },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {modal?.type === 'new' && <NewExit onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'inspect' && <InspectModal exit={modal.exit} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'approve' && <ApproveModal exit={modal.exit} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'clear' && <ClearModal exit={modal.exit} onClose={() => setModal(null)} onDone={done} />}
      <ConfirmDialog open={modal?.type === 'reject'} onClose={() => setModal(null)} onConfirm={reject} loading={rejecting} tone="danger" title="Reject exit request" reasonLabel="Reason" confirmLabel="Reject" />
    </div>
  );
}
