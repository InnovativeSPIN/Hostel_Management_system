import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { IndianRupee, Plus, Download, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, StatCard } from '../../components/ui/Card';
import DataTable, { Pagination, toggleSort } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Checkbox } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, useDepartments, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api, { download } from '../../services/api';
import { paymentSchema } from '../../validations/schemas';
import { fmtDate, fmtDateTime, fmtMoney, label, todayStr } from '../../utils/format';

export function PaymentModal({ fee, onClose, onDone }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(paymentSchema), defaultValues: { amount: fee.balance, paymentMode: 'upi', paidAt: '' },
  });
  const submit = async (v) => {
    try {
      const { data } = await api.post('/payments', { ...v, paidAt: v.paidAt ? v.paidAt.replace('T', ' ') : undefined, remarks: v.remarks || undefined });
      toast.success(`Receipt ${data.data.receiptNumber} · balance ${fmtMoney(data.data.balance)}`);
      onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} title="Record payment" description={`${fee.student_name} (${fee.register_number}) · ${fee.fee_name} · outstanding ${fmtMoney(fee.balance)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="pay-form" loading={isSubmitting} icon={IndianRupee}>Record payment</Button></>}>
      <form id="pay-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Amount (₹)" type="number" step="0.01" required error={errors.amount?.message} hint={`Max ${fmtMoney(fee.balance)} — overpayment is rejected`} {...register('amount')} />
        <Select label="Mode" options={[['upi', 'UPI'], ['netbanking', 'Net banking'], ['card', 'Card'], ['cash', 'Cash'], ['dd', 'Demand draft'], ['cheque', 'Cheque']].map(([value, l]) => ({ value, label: l }))} {...register('paymentMode')} />
        <Input label="Transaction / reference ID" required error={errors.transactionId?.message} hint="Must be unique" {...register('transactionId')} />
        <Input label="Paid on" type="datetime-local" max={`${todayStr()}T23:59`} hint="Defaults to now" {...register('paidAt')} />
        <Input label="Remarks" className="sm:col-span-2" {...register('remarks')} />
      </form>
    </Modal>
  );
}

function Ledger() {
  const [params] = useSearchParams();
  const hostels = useHostels();
  const depts = useDepartments();
  const [q, setQ] = useListState({ status: params.get('status') || '' });
  const { data, meta, loading, error, reload } = useFetch('/fees', q);
  const [paying, setPaying] = useState(null);
  const { can } = useAuth();
  const t = meta?.totals;
  return (
    <div className="space-y-4">
      {t && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Billed (filtered)" value={fmtMoney(t.billed)} /><StatCard label="Collected" value={fmtMoney(t.collected)} tone="green" />
        <StatCard label="Outstanding" value={fmtMoney(t.outstanding)} tone="orange" /><StatCard label="Overdue" value={fmtMoney(t.overdue_amount)} tone="red" />
      </div>}
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-56" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student or register no" />
          <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any status" options={['overdue', 'partial', 'pending', 'paid', 'waived'].map((s) => ({ value: s, label: label(s) }))} />
          <FilterSelect value={q.departmentId} onChange={(v) => setQ({ departmentId: v })} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.short_name }))} />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
          <label className="flex items-center gap-1 text-xs text-slate-500">Due <input type="date" aria-label="Due from" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} /></label>
          <input type="date" aria-label="Due to" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
          <Button size="sm" variant="ghost" icon={Download} onClick={() => download('/reports/fees', { format: 'xlsx', status: q.status || undefined }, 'fees.xlsx').catch((e) => toast.error(e.message))}>Export</Button>
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} sort={q} onSort={(k) => setQ(toggleSort(q, k))} columns={[
          { key: 'student', header: 'Student', sortKey: 'student', render: (r) => <Link to={`/students/${r.student_id}`} className="hover:text-brand-700"><b>{r.student_name}</b><span className="block text-xs text-slate-500">{r.register_number} · {r.department} · {r.hostel_code ? `${r.hostel_code}-${r.room_number}` : 'no room'}</span></Link> },
          { key: 'fee_name', header: 'Fee', hideOnMobile: true },
          { key: 'net', header: 'Amount', render: (r) => fmtMoney(r.total_amount - r.discount) },
          { key: 'amount_paid', header: 'Paid', sortKey: 'paid', render: (r) => fmtMoney(r.amount_paid) },
          { key: 'balance', header: 'Balance', sortKey: 'balance', render: (r) => <b className={r.balance > 0 ? 'text-slate-900' : 'text-slate-400'}>{fmtMoney(r.balance)}</b> },
          { key: 'due_date', header: 'Due', sortKey: 'due', render: (r) => <span>{fmtDate(r.due_date)}{r.status === 'overdue' && <span className="block text-xs text-red-600">{r.days_overdue} days overdue</span>}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'act', header: '', render: (r) => can('payments.record') && r.balance > 0 && !r.waived && <Button size="xs" variant="subtle" onClick={() => setPaying(r)}>Record payment</Button> },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {paying && <PaymentModal fee={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} />}
    </div>
  );
}

function AlertList({ rows, empty, extra }) {
  return rows.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
    <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.id || r.student_id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <Link to={`/students/${r.student_id}`} className="min-w-0 hover:text-brand-700"><b className="block truncate">{r.student_name}</b><span className="text-xs text-slate-500">{r.register_number}{r.hostel_code ? ` · ${r.hostel_code}-${r.room_number}` : ''}</span></Link>
          <span className="shrink-0 text-right text-xs">{extra(r)}</span>
        </li>
      ))}
    </ul>
  );
}

function Alerts() {
  const { data, loading, error, reload } = useFetch('/fees/alerts');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Alerts only — students are never blocked automatically unless an administrator enables the fee policy.</p>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card title={<span className="text-red-700">Overdue ({data.overdue.length})</span>}><AlertList rows={data.overdue} empty="No overdue fees." extra={(r) => <><b>{fmtMoney(r.balance)}</b><span className="block text-red-600">{-r.days_to_due} days late</span></>} /></Card>
        <Card title={<span className="text-orange-700">Due within {data.dueSoonDays} days ({data.dueSoon.length})</span>}><AlertList rows={data.dueSoon} empty="Nothing due soon." extra={(r) => <><b>{fmtMoney(r.balance)}</b><span className="block">{fmtDate(r.due_date)}</span></>} /></Card>
        <Card title={<span className="text-amber-700">Partial payments ({data.partial.length})</span>}><AlertList rows={data.partial} empty="No partial payments." extra={(r) => <><b>{fmtMoney(r.balance)}</b> left<span className="block">{fmtMoney(r.amount_paid)} paid</span></>} /></Card>
        <Card title={`Repeat defaulters (${data.repeatDefaulters.length})`}><AlertList rows={data.repeatDefaulters} empty="None." extra={(r) => <Badge tone="red">{r.overdue_records} late records</Badge>} /></Card>
      </div>
    </div>
  );
}

function Payments() {
  const [q, setQ] = useListState();
  const { data, meta, loading, error, reload } = useFetch('/payments', q);
  return (
    <div className="card">
      <FilterBar>
        <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student, receipt or transaction ID" />
        <FilterSelect value={q.mode} onChange={(v) => setQ({ mode: v })} placeholder="Any mode" options={['upi', 'netbanking', 'card', 'cash', 'dd', 'cheque'].map((m) => ({ value: m, label: m.toUpperCase() }))} />
        <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
        <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
      </FilterBar>
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
        { key: 'receipt_number', header: 'Receipt', render: (r) => <span className="font-mono text-xs">{r.receipt_number}</span> },
        { key: 'paid_at', header: 'Date', render: (r) => fmtDateTime(r.paid_at) },
        { key: 'student', header: 'Student', render: (r) => <span>{r.student_name}<span className="block text-xs text-slate-500">{r.register_number}</span></span> },
        { key: 'fee_name', header: 'Fee', hideOnMobile: true },
        { key: 'payment_mode', header: 'Mode', render: (r) => r.payment_mode.toUpperCase() },
        { key: 'transaction_id', header: 'Txn ID', hideOnMobile: true, render: (r) => <span className="font-mono text-xs">{r.transaction_id}</span> },
        { key: 'amount', header: 'Amount', render: (r) => <b>{fmtMoney(r.amount)}</b> },
        { key: 'recorded_by', header: 'By', hideOnMobile: true },
      ]} />
      <Pagination meta={meta} onPage={(page) => setQ({ page })} />
    </div>
  );
}

function StructureForm({ onClose, onDone }) {
  const hostels = useHostels();
  const y = new Date().getMonth() >= 5 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({ defaultValues: { academicYear: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, studentType: 'nscet', hostelFee: 0, messFee: 0, maintenanceFee: 0, securityDeposit: 0, otherFee: 0 } });
  const total = ['hostelFee', 'messFee', 'maintenanceFee', 'securityDeposit', 'otherFee'].reduce((s, k) => s + (Number(watch(k)) || 0), 0);
  const submit = async (v) => {
    try {
      await api.post('/fees/structures', { ...v, hostelId: v.hostelId ? Number(v.hostelId) : null, roomType: v.roomType || null });
      toast.success('Fee structure created'); onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="New fee structure" footer={<><span className="mr-auto text-sm">Total <b>{fmtMoney(total)}</b></span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="fs-form" loading={isSubmitting}>Create</Button></>}>
      <form id="fs-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" required className="sm:col-span-2" placeholder="Hostel Fee 2026-27 · Term III" {...register('name', { required: true })} />
        <Input label="Academic year" required {...register('academicYear', { required: true })} />
        <Input label="Due date" type="date" required {...register('dueDate', { required: true })} />
        <Select label="Student Category" options={[{ value: 'nscet', label: 'College (NSCET)' }, { value: 'ns_cbse', label: 'School (NS-CBSE)' }]} {...register('studentType')} />
        <Select label="Applies to hostel" placeholder="All hostels" options={hostelOptions(hostels)} {...register('hostelId')} />
        <Select label="Room type" placeholder="All room types" options={['single', 'double', 'triple', 'quad'].map((t) => ({ value: t, label: label(t) }))} {...register('roomType')} />
        {[['hostelFee', 'Hostel fee'], ['messFee', 'Mess fee'], ['maintenanceFee', 'Maintenance'], ['securityDeposit', 'Security deposit'], ['otherFee', 'Other']].map(([k, l]) => <Input key={k} label={`${l} (₹)`} type="number" min={0} {...register(k)} />)}
      </form>
    </Modal>
  );
}

function AssignModal({ structure, onClose, onDone }) {
  const [allResidents, setAll] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      const { data } = await api.post('/fees', { feeStructureId: structure.id, allResidents, discount: Number(discount) || 0 });
      toast.success(`Assigned to ${data.data.assigned} student(s)${data.data.skipped ? ` · ${data.data.skipped} already had it` : ''}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Assign ${structure.name}`} description={`${fmtMoney(structure.total_amount)} · due ${fmtDate(structure.due_date)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} icon={Users}>Assign</Button></>}>
      <div className="space-y-4">
        <Checkbox checked={allResidents} onChange={(e) => setAll(e.target.checked)} label={`All current residents${structure.hostel_name ? ` of ${structure.hostel_name}` : ''}${structure.room_type ? ` in ${structure.room_type} rooms` : ''}`} hint="Students who already have this fee are skipped. Approved applicants move to 'fee assigned'." />
        <Input label="Discount per student (₹)" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </div>
    </Modal>
  );
}

function Structures() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useFetch('/fees/structures');
  const [modal, setModal] = useState(null);
  return (
    <div className="card">
      {can('fees.manage') && <div className="flex justify-end border-b border-slate-100 p-3"><Button size="sm" icon={Plus} onClick={() => setModal({ type: 'new' })}>New structure</Button></div>}
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
        { key: 'name', header: 'Structure', render: (r) => <span className="font-medium">{r.name}<span className="block text-xs font-normal text-slate-500"><span className="font-semibold text-brand-700">{r.student_type === 'ns_cbse' ? 'NS-CBSE' : 'NSCET'}</span> · {r.hostel_name || 'All hostels'}{r.room_type ? ` · ${label(r.room_type)}` : ''}</span></span> },
        { key: 'breakdown', header: 'Breakdown', hideOnMobile: true, render: (r) => <span className="text-xs text-slate-600">Hostel {fmtMoney(r.hostel_fee)} · Mess {fmtMoney(r.mess_fee)} · Maint. {fmtMoney(r.maintenance_fee)}{Number(r.security_deposit) ? ` · Deposit ${fmtMoney(r.security_deposit)}` : ''}</span> },
        { key: 'total_amount', header: 'Total', render: (r) => <b>{fmtMoney(r.total_amount)}</b> },
        { key: 'due_date', header: 'Due', render: (r) => fmtDate(r.due_date) },
        { key: 'assigned_count', header: 'Assigned', render: (r) => <span>{r.assigned_count}<span className="block text-xs text-slate-500">{fmtMoney(r.collected)} collected</span></span> },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'archived' ? 'closed' : 'active'}>{label(r.status)}</StatusBadge> },
        { key: 'act', header: '', render: (r) => can('fees.manage') && r.status === 'active' && <Button size="xs" variant="subtle" onClick={() => setModal({ type: 'assign', s: r })}>Assign</Button> },
      ]} />
      {modal?.type === 'new' && <StructureForm onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal?.type === 'assign' && <AssignModal structure={modal.s} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}

export default function FeesPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'ledger');
  return (
    <div>
      <PageHeader title="Fees & Payments" subtitle="Ledger, risk alerts and collections" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Fees' }]} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'ledger', label: 'Fee ledger' }, { value: 'alerts', label: 'Fee risk alerts' }, { value: 'payments', label: 'Payment register' }, { value: 'structures', label: 'Fee structures' }]} />
      {tab === 'ledger' && <Ledger />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'payments' && <Payments />}
      {tab === 'structures' && <Structures />}
    </div>
  );
}
