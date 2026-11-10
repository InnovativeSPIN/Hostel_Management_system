import { useState } from 'react';
import toast from 'react-hot-toast';
import { Utensils, FileDown, CheckCircle2, Send, Plus, Users, Calendar } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDate, fmtMoney, label, todayStr } from '../../utils/format';

function GenerateMessBillsModal({ onClose, onDone }) {
  const currentMonth = todayStr().slice(0, 7);
  const [billMonth, setBillMonth] = useState(currentMonth);
  const [dailyRate, setDailyRate] = useState(120);
  const [userType, setUserType] = useState('student');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchPreview = async () => {
    setLoadingPreview(true);
    try {
      const { data } = await api.post('/mess/bills/preview', { billMonth, dailyRate: Number(dailyRate), userType });
      setPreview(data.data.preview);
    } catch (err) { toast.error(err.message); } finally { setLoadingPreview(false); }
  };

  const confirmBills = async () => {
    if (!preview || preview.length === 0) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/mess/bills/confirm', { bills: preview });
      toast.success(`Generated ${data.data.count} mess bills successfully!`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
  };

  return (
    <Modal open onClose={onClose} size="xl" title="One-Click Mess Bill Generation"
      description="Calculates student and staff dining dues strictly from morning and evening attendance records."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!preview ? (
            <Button onClick={fetchPreview} loading={loadingPreview}>Preview Attendance-Based Bills</Button>
          ) : (
            <Button variant="success" icon={CheckCircle2} onClick={confirmBills} loading={submitting}>Confirm & Generate {preview.length} Bills</Button>
          )}
        </>
      }>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Billing Month" type="month" required value={billMonth} onChange={(e) => { setBillMonth(e.target.value); setPreview(null); }} />
          <Input label="Daily Mess Rate (₹)" type="number" min={1} required value={dailyRate} onChange={(e) => { setDailyRate(e.target.value); setPreview(null); }} />
          <Select label="Recipient Category" value={userType} onChange={(e) => { setUserType(e.target.value); setPreview(null); }} options={[{ value: 'student', label: 'Students (Residents)' }, { value: 'staff', label: 'Hostel Staff' }]} />
        </div>

        {preview && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Calculated Bill Preview ({preview.length} persons)</span>
              <span className="text-xs font-bold text-brand-700">Total Billed: {fmtMoney(preview.reduce((sum, b) => sum + b.netAmount, 0))}</span>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Room / ID</th>
                    <th className="p-2 text-center">Total Days</th>
                    <th className="p-2 text-center">Present (Diet) Days</th>
                    <th className="p-2 text-right">Daily Rate</th>
                    <th className="p-2 text-right">Net Bill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2 text-slate-500">{p.roomNumber ? `Rm ${p.roomNumber}` : p.role || p.registerNumber}</td>
                      <td className="p-2 text-center">{p.totalDays}d</td>
                      <td className="p-2 text-center font-semibold text-emerald-700">{p.presentDays}d</td>
                      <td className="p-2 text-right">₹{p.dailyRate}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{fmtMoney(p.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StaffMessAttendanceModal({ onClose, onDone }) {
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('morning');
  const { data: staffList, reload } = useFetch('/mess/attendance/staff', { date, session });
  const [marks, setMarks] = useState({});
  const [pending, setPending] = useState(false);

  const toggle = (id) => {
    setMarks((prev) => ({ ...prev, [id]: prev[id] === 'absent' ? 'present' : 'absent' }));
  };

  const submit = async () => {
    setPending(true);
    try {
      const records = (staffList || []).map((s) => ({
        userId: s.id,
        status: marks[s.id] || s.status || 'present',
      }));
      await api.post('/mess/attendance/staff', { records, attendanceDate: date, session });
      toast.success('Staff mess attendance saved');
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Staff Mess Attendance" description="Record staff meals for morning or evening sessions"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save Roster</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select label="Session" value={session} onChange={(e) => setSession(e.target.value)} options={[{ value: 'morning', label: 'Morning Session' }, { value: 'evening', label: 'Evening Session' }]} />
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(staffList || []).map((s) => {
            const currentStatus = marks[s.id] || s.status || 'present';
            return (
              <div key={s.id} className="flex items-center justify-between p-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{s.staff_name || s.name}</p>
                  <p className="text-xs text-slate-500">{s.role_label || 'Staff'}</p>
                </div>
                <button type="button" onClick={() => toggle(s.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${currentStatus === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  {currentStatus === 'present' ? 'Present' : 'Absent'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export default function MessPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('bills');
  const [q, setQ] = useListState();
  const { data: bills, meta, loading: billsLoading, reload: reloadBills } = useFetch('/mess/bills', q);
  const { data: weeklyMenu } = useFetch('/mess/menu');
  const [modal, setModal] = useState(null);

  const publishBill = async (id) => {
    try {
      await api.patch(`/mess/bills/${id}/publish`);
      toast.success('Mess bill published & recorded in student ledger');
      reloadBills();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Mess Management & Dining" subtitle="Attendance-based dining bills, one-click generation, PDF statements & weekly menus"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Mess' }]}
        actions={
          <div className="flex gap-2">
            {can('fees.manage') && <Button size="sm" icon={Utensils} onClick={() => setModal('generate')}>Generate Monthly Bills</Button>}
            {can('attendance.mark') && <Button size="sm" variant="secondary" icon={Users} onClick={() => setModal('staff_att')}>Staff Dining Roll Call</Button>}
          </div>
        }
      />

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'bills', label: 'Monthly Mess Bills' }, { value: 'menu', label: 'Weekly Catering Menu' }]} />

      {tab === 'bills' ? (
        <div className="card">
          <FilterBar>
            <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Bill code, student name" />
            <input type="month" aria-label="Month" className="input w-auto py-1.5" value={q.billMonth || ''} onChange={(e) => setQ({ billMonth: e.target.value })} />
          </FilterBar>
          <DataTable rows={bills} loading={billsLoading} onRetry={reloadBills} columns={[
            { key: 'bill_code', header: 'Bill Code', render: (b) => <span className="font-semibold text-slate-900">{b.bill_code}</span> },
            { key: 'recipient', header: 'Resident / Staff', render: (b) => <span><b>{b.student_name || b.staff_name}</b><span className="block text-xs text-slate-500">{b.register_number || 'Staff'}</span></span> },
            { key: 'bill_month', header: 'Billing Month', render: (b) => <span>{b.bill_month}</span> },
            { key: 'days', header: 'Diet / Total Days', render: (b) => <span><b>{b.present_days}</b> / {b.total_days} days</span> },
            { key: 'rate', header: 'Daily Rate', render: (b) => <span>₹{Number(b.daily_rate).toFixed(2)}</span> },
            { key: 'net_amount', header: 'Total Bill', render: (b) => <span className="font-bold text-slate-900">{fmtMoney(b.net_amount)}</span> },
            { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
            { key: 'act', header: '', render: (b) => (
              <div className="flex items-center gap-1.5">
                {b.status === 'confirmed' && can('fees.manage') && (
                  <Button size="xs" variant="success" icon={Send} onClick={() => publishBill(b.id)}>Publish</Button>
                )}
                <a href={`/api/mess/bills/${b.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-slate-50">
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </a>
              </div>
            ) },
          ]} />
          <Pagination meta={meta} onPage={(page) => setQ({ page })} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
            const dayMeals = (weeklyMenu || []).filter((m) => m.day_of_week === day);
            return (
              <div key={day} className="card p-4 space-y-3 border border-slate-200">
                <h3 className="font-bold text-base text-brand-900 capitalize border-b border-slate-100 pb-2">{day}</h3>
                <div className="space-y-2 text-xs">
                  {['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => {
                    const m = dayMeals.find((x) => x.meal_type === meal);
                    return (
                      <div key={meal} className="flex flex-col">
                        <span className="font-semibold uppercase tracking-wider text-slate-500">{meal}</span>
                        <span className="text-slate-800">{m?.items || 'Not scheduled'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal === 'generate' && <GenerateMessBillsModal onClose={() => setModal(null)} onDone={() => { setModal(null); reloadBills(); }} />}
      {modal === 'staff_att' && <StaffMessAttendanceModal onClose={() => setModal(null)} onDone={() => setModal(null)} />}
    </div>
  );
}

