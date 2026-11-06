import MessBilling from './MessBilling';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { IndianRupee, Plus, Download, Users, Edit2, ShieldAlert } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, StatCard } from '../../components/ui/Card';
import DataTable, { Pagination, toggleSort } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Checkbox, Textarea } from '../../components/ui/Field';
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
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({ defaultValues: { academicYear: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, hostelFee: 0, messFee: 0, maintenanceFee: 0, securityDeposit: 0, otherFee: 0 } });
  const total = ['hostelFee', 'messFee', 'maintenanceFee', 'securityDeposit', 'otherFee'].reduce((s, k) => s + (Number(watch(k)) || 0), 0);
  const submit = async (v) => {
    try {
      await api.post('/fees/structures', { ...v, hostelId: v.hostelId ? Number(v.hostelId) : null, roomType: v.roomType || null });
      toast.success('Fee structure created'); onDone();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="New fee structure (Legacy)" footer={<><span className="mr-auto text-sm">Total <b>{fmtMoney(total)}</b></span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="fs-form" loading={isSubmitting}>Create</Button></>}>
      <form id="fs-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" required className="sm:col-span-2" placeholder="Hostel Fee 2026-27 · Term III" {...register('name', { required: true })} />
        <Input label="Academic year" required {...register('academicYear', { required: true })} />
        <Input label="Due date" type="date" required {...register('dueDate', { required: true })} />
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
      const { data } = await api.post('/fees/assign', { feeStructureId: structure.id, allResidents, discount: Number(discount) || 0 });
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
        { key: 'name', header: 'Structure', render: (r) => <span className="font-medium">{r.name}<span className="block text-xs font-normal text-slate-500">{r.hostel_name || 'All hostels'}{r.room_type ? ` · ${label(r.room_type)}` : ''}</span></span> },
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

// ==================== FEE STRUCTURES V2 COMPONENT ====================

function StructureV2Modal({ item, onClose, onDone }) {
  const isEdit = !!item?.id;
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: item ? {
      name: item.name,
      studentType: item.student_type,
      roomCategory: item.room_category,
      academicYear: item.academic_year,
      admissionFee: Number(item.admission_fee) || 0,
      cautionDeposit: Number(item.caution_deposit) || 0,
      roomRent: Number(item.room_rent) || 0,
      messCharges: Number(item.mess_charges) || 0,
      perDayMessRate: Number(item.per_day_mess_rate) || 0,
      otherCharges: Number(item.other_charges) || 0,
      dueDate: item.due_date ? item.due_date.slice(0, 10) : '',
      status: item.status || 'active',
      remarks: item.remarks || '',
    } : {
      name: '',
      studentType: 'NSCET',
      roomCategory: 'Normal Room',
      academicYear: '2026-27',
      admissionFee: 5000,
      cautionDeposit: 5000,
      roomRent: 12000,
      messCharges: 30000,
      perDayMessRate: 150,
      otherCharges: 2000,
      dueDate: '2026-08-31',
      status: 'active',
      remarks: '',
    },
  });

  const admission = Number(watch('admissionFee')) || 0;
  const caution = Number(watch('cautionDeposit')) || 0;
  const rent = Number(watch('roomRent')) || 0;
  const mess = Number(watch('messCharges')) || 0;
  const other = Number(watch('otherCharges')) || 0;
  const total = admission + caution + rent + mess + other;

  const submit = async (values) => {
    try {
      if (isEdit) {
        await api.put(`/fees/structures-v2/${item.id}`, values);
        toast.success('Fee structure updated');
      } else {
        await api.post('/fees/structures-v2', values);
        toast.success('Fee structure created');
      }
      onDone();
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={isEdit ? `Edit: ${item.name}` : 'New Fee Structure (V2)'}
      description="Admin-editable dynamic fee matrix by student type, room category and academic year."
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-sm">Calculated Total: <b className="text-lg font-bold text-brand-700">{fmtMoney(total)}</b></div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="fs-v2-form" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Create structure'}</Button>
          </div>
        </div>
      }>
      <form id="fs-v2-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
        <Input label="Structure Name" required className="sm:col-span-2" placeholder="e.g. NSCET - AC Room (2026-27)" {...register('name', { required: true })} />
        <Select label="Student Type" required options={[{ value: 'NSCET', label: 'NSCET (College)' }, { value: 'NS-CBSE', label: 'NS-CBSE (School)' }]} {...register('studentType', { required: true })} />
        <Select label="Room Category" required options={[{ value: 'AC Room', label: 'AC Room' }, { value: 'Attached Toilet', label: 'Attached Toilet' }, { value: 'Normal Room', label: 'Normal Room' }]} {...register('roomCategory', { required: true })} />
        <Input label="Academic Year" required placeholder="2026-27" {...register('academicYear', { required: true })} />
        <Input label="Due Date" type="date" {...register('dueDate')} />
        <Input label="Admission Fee (₹)" type="number" min={0} {...register('admissionFee')} />
        <Input label="Caution Deposit (₹)" type="number" min={0} {...register('cautionDeposit')} />
        <Input label="Room Rent (₹)" type="number" min={0} {...register('roomRent')} />
        <Input label="Mess Charges (₹)" type="number" min={0} {...register('messCharges')} />
        <Input label="Per-Day Mess Rate (₹)" type="number" step="0.5" min={0} hint="Used for daily mess calculation & rebates" {...register('perDayMessRate')} />
        <Input label="Other Charges (₹)" type="number" min={0} {...register('otherCharges')} />
        <Select label="Status" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }]} {...register('status')} />
        <Input label="Remarks" placeholder="Optional notes" className="sm:col-span-2" {...register('remarks')} />
      </form>
    </Modal>
  );
}

function StructuresV2() {
  const { can } = useAuth();
  const [filterType, setFilterType] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useFetch('/fees/structures-v2', {
    studentType: filterType || undefined,
    roomCategory: filterCat || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect value={filterType} onChange={setFilterType} placeholder="All Student Types" options={[{ value: 'NSCET', label: 'NSCET (College)' }, { value: 'NS-CBSE', label: 'NS-CBSE (School)' }]} />
            <FilterSelect value={filterCat} onChange={setFilterCat} placeholder="All Room Categories" options={[{ value: 'AC Room', label: 'AC Room' }, { value: 'Attached Toilet', label: 'Attached Toilet' }, { value: 'Normal Room', label: 'Normal Room' }]} />
          </div>
          {can('fees.manage') && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'new' })}>New rate structure</Button>
          )}
        </div>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          {
            key: 'name',
            header: 'Structure & Type',
            render: (r) => (
              <div>
                <p className="font-semibold text-slate-800">{r.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`inline-block px-1.5 py-0.2 rounded font-semibold ${r.student_type === 'NS-CBSE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-brand-700'}`}>{r.student_type}</span>
                  <span>· {r.room_category}</span>
                  <span>· {r.academic_year}</span>
                </div>
              </div>
            ),
          },
          {
            key: 'breakdown',
            header: 'Itemized Breakdown',
            render: (r) => (
              <div className="text-xs text-slate-600 space-y-0.5">
                <div>Rent: <b>{fmtMoney(r.room_rent)}</b> · Mess: <b>{fmtMoney(r.mess_charges)}</b></div>
                <div className="text-slate-500">Adm: {fmtMoney(r.admission_fee)} · Deposit: {fmtMoney(r.caution_deposit)} · Other: {fmtMoney(r.other_charges)}</div>
              </div>
            ),
          },
          {
            key: 'per_day_mess_rate',
            header: 'Daily Mess Rate',
            render: (r) => <span className="font-medium text-slate-700">{fmtMoney(r.per_day_mess_rate)} / day</span>,
          },
          {
            key: 'total_amount',
            header: 'Total Fee',
            render: (r) => <b className="text-base text-slate-900">{fmtMoney(r.total_amount)}</b>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusBadge status={r.status === 'archived' ? 'closed' : r.status}>{label(r.status)}</StatusBadge>,
          },
          {
            key: 'act',
            header: '',
            render: (r) => can('fees.manage') && (
              <Button size="xs" variant="ghost" icon={Edit2} onClick={() => setModal({ type: 'edit', item: r })}>Edit</Button>
            ),
          },
        ]} />
      </div>

      {modal && (
        <StructureV2Modal
          item={modal.type === 'edit' ? modal.item : null}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload(); }}
        />
      )}
    </div>
  );
}

export default function FeesPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'ledger');
  return (
    <div>
      <PageHeader title="Fees & Payments" subtitle="Fee structures, itemized rates, ledger, risk alerts and collections" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Fees' }]} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { value: 'ledger', label: 'Fee ledger' },
        { value: 'mess-billing', label: 'Mess Bills (Students & Staff)' },
        { value: 'structures-v2', label: 'Room & Category Fees (V2)' },
        { value: 'alerts', label: 'Fee risk alerts' },
        { value: 'payments', label: 'Payment register' },
        { value: 'structures', label: 'Legacy structures' }
      ]} />
      {tab === 'ledger' && <Ledger />}
      {tab === 'mess-billing' && <MessBilling />}
      {tab === 'structures-v2' && <StructuresV2 />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'payments' && <Payments />}
      {tab === 'structures' && <Structures />}
    </div>
  );
}
