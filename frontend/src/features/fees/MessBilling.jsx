import { useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, Download, CheckCircle2, Send, Calculator, Users, Utensils, RefreshCw } from 'lucide-react';
import { Card, StatCard } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Misc';
import { PageLoader, EmptyState } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api, { download } from '../../services/api';
import { fmtMoney, todayStr } from '../../utils/format';

export default function MessBilling() {
  const { can } = useAuth();
  const currentMonth = todayStr().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [billType, setBillType] = useState('student');
  const [generating, setGenerating] = useState(false);
  const [acting, setActing] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState(null);

  // Data queries
  const billsList = useFetch('/mess/billing/bills');
  const activeBill = useFetch(selectedBillId ? `/mess/billing/bills/${selectedBillId}` : null);
  const rules = useFetch('/mess/billing/rules', { monthYear: month });
  const staffAtt = useFetch('/mess/billing/staff-attendance', { date: todayStr() });

  // 1-Click Preview Generation
  const generatePreview = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post('/mess/billing/preview', {
        monthYear: month,
        billType,
      });
      toast.success(`Generated preview for ${data.data.totalMembers} ${billType}s (₹${data.data.totalAmount.toLocaleString('en-IN')})`);
      billsList.reload();
      setSelectedBillId(data.data.billId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Confirm Bill
  const confirmBill = async (id) => {
    setActing(true);
    try {
      await api.patch(`/mess/billing/${id}/confirm`);
      toast.success('Mess bill confirmed and ready to publish');
      billsList.reload();
      activeBill.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  // Publish to Ledgers
  const publishBill = async (id) => {
    if (!window.confirm('Publishing will create separate ledger entries for all students in this bill. Proceed?')) return;
    setActing(true);
    try {
      const { data } = await api.post(`/mess/billing/${id}/publish`);
      toast.success(`Published! Added to ${data.data.ledgerEntriesCount} student ledgers.`);
      billsList.reload();
      activeBill.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1-Click Control Panel */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="label block text-xs">Billing Month</span>
              <input type="month" className="input w-auto font-medium" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>

            <div>
              <span className="label block text-xs">Member Type</span>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button type="button" onClick={() => setBillType('student')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${billType === 'student' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  Students Mess
                </button>
                <button type="button" onClick={() => setBillType('staff')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${billType === 'staff' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  Staff Mess
                </button>
              </div>
            </div>

            {rules.data && (
              <div className="text-xs text-slate-500 pl-2">
                Rate: <b>₹{billType === 'student' ? rules.data.student_per_day_rate : rules.data.staff_per_day_rate}/day</b> · Session = <b>0.5 day</b>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" icon={Calculator} loading={generating} onClick={generatePreview}>
              Generate 1-Click Preview
            </Button>
          </div>
        </div>
      </div>

      {/* Active Bill Preview & Action View */}
      {selectedBillId && activeBill.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-blue-950">{activeBill.data.bill.bill_code}</h3>
                <StatusBadge status={activeBill.data.bill.status} />
                <Badge tone="blue">{activeBill.data.bill.bill_type.toUpperCase()}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-blue-800">
                Month: <b>{activeBill.data.bill.month_year}</b> · Total: <b>{fmtMoney(activeBill.data.bill.total_amount)}</b> · Members: <b>{activeBill.data.bill.total_members}</b>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" icon={Download} onClick={() => download(`/mess/billing/${activeBill.data.bill.id}/pdf`, null, `${activeBill.data.bill.bill_code}.pdf`)}>
                Download PDF Statement
              </Button>

              {activeBill.data.bill.status === 'preview' && (
                <Button size="sm" variant="success" icon={CheckCircle2} loading={acting} onClick={() => confirmBill(activeBill.data.bill.id)}>
                  Confirm Bill
                </Button>
              )}

              {activeBill.data.bill.status === 'confirmed' && (
                <Button size="sm" icon={Send} loading={acting} onClick={() => publishBill(activeBill.data.bill.id)}>
                  Publish to Ledgers
                </Button>
              )}

              {activeBill.data.bill.status === 'published' && (
                <Badge tone="green">Published to Ledgers on {activeBill.data.bill.published_at?.slice(0, 10)}</Badge>
              )}
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="card">
            <div className="border-b border-slate-100 p-3">
              <h4 className="text-sm font-semibold text-slate-800">Member Breakdown & Attendance Calculation</h4>
            </div>
            <DataTable rows={activeBill.data.items} dense columns={[
              { key: 'member_name', header: 'Member', render: (r) => <span><b>{r.member_name}</b><span className="block text-xs text-slate-500">{r.register_number || r.email} {r.room_number ? `· Room ${r.room_number}` : ''}</span></span> },
              { key: 'total_sessions', header: 'Total Sessions', render: (r) => r.total_sessions },
              { key: 'present_sessions', header: 'Present', render: (r) => <span className="font-semibold text-emerald-700">{r.present_sessions}</span> },
              { key: 'absent_sessions', header: 'Absent', render: (r) => <span className={r.absent_sessions > 0 ? 'font-semibold text-red-700' : ''}>{r.absent_sessions}</span> },
              { key: 'chargeable_days', header: 'Chargeable Days', render: (r) => <b>{r.chargeable_days}</b> },
              { key: 'daily_rate', header: 'Daily Rate', render: (r) => `₹${Number(r.daily_rate).toFixed(0)}` },
              { key: 'net_amount', header: 'Net Mess Fee', render: (r) => <span className="font-bold text-slate-900">{fmtMoney(r.net_amount)}</span> },
              { key: 'ledger_status', header: 'Ledger', render: (r) => r.student_fee_id ? <Badge tone="green">Posted #{r.student_fee_id}</Badge> : <Badge tone="yellow">Pending</Badge> },
            ]} />
          </div>
        </div>
      )}

      {/* Generated Bills History */}
      <div className="card">
        <div className="border-b border-slate-100 p-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Mess Bills Register ({billsList.data?.length || 0})</h3>
          <Button size="xs" variant="ghost" icon={RefreshCw} onClick={billsList.reload}>Refresh</Button>
        </div>
        {billsList.data && (
          <DataTable rows={billsList.data} loading={billsList.loading} empty={<EmptyState icon={Utensils} title="No mess bills generated yet" message="Click 'Generate 1-Click Preview' above to calculate bills based on attendance." />}
            columns={[
              { key: 'bill_code', header: 'Bill Code', render: (r) => <button type="button" onClick={() => setSelectedBillId(r.id)} className="font-mono text-xs font-bold text-brand-600 hover:underline">{r.bill_code}</button> },
              { key: 'month_year', header: 'Month', render: (r) => <b>{r.month_year}</b> },
              { key: 'bill_type', header: 'Type', render: (r) => <Badge tone={r.bill_type === 'student' ? 'blue' : 'purple'}>{r.bill_type.toUpperCase()}</Badge> },
              { key: 'total_members', header: 'Members', render: (r) => r.total_members },
              { key: 'total_amount', header: 'Total Amount', render: (r) => <span className="font-bold text-slate-900">{fmtMoney(r.total_amount)}</span> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'actions', header: '', render: (r) => (
                <div className="flex gap-1.5">
                  <Button size="xs" variant="secondary" onClick={() => setSelectedBillId(r.id)}>View Details</Button>
                  <Button size="xs" variant="ghost" icon={Download} onClick={() => download(`/mess/billing/${r.id}/pdf`, null, `${r.bill_code}.pdf`)} />
                </div>
              ) },
            ]} />
        )}
      </div>
    </div>
  );
}
