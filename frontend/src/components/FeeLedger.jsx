import { Card, StatCard } from './ui/Card';
import DataTable from './ui/DataTable';
import { StatusBadge } from './ui/Badge';
import { fmtDate, fmtDateTime, fmtMoney } from '../utils/format';

const PARTS = [['hostel_fee', 'Hostel fee'], ['mess_fee', 'Mess fee'], ['maintenance_fee', 'Maintenance'], ['security_deposit', 'Security deposit'], ['other_fee', 'Other']];

/** Fee breakdown per structure, totals and payment history (student and parent views). */
export default function FeeLedger({ fees, payments, totals }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total billed" value={fmtMoney(totals.billed)} />
        <StatCard label="Paid" value={fmtMoney(totals.paid)} tone="green" />
        <StatCard label="Outstanding" value={fmtMoney(totals.due)} tone={fees.some((f) => f.status === 'overdue') ? 'red' : totals.due ? 'orange' : 'green'} />
      </div>
      {fees.length === 0 && <p className="text-sm text-slate-500">No fees assigned yet.</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        {fees.map((f) => (
          <Card key={f.id} title={f.fee_name} subtitle={`Academic year ${f.academic_year} · due ${fmtDate(f.due_date)}`} actions={<StatusBadge status={f.status} />}>
            <dl className="space-y-1.5 text-sm">
              {PARTS.filter(([k]) => Number(f[k])).map(([k, l]) => <div key={k} className="flex justify-between"><dt className="text-slate-600">{l}</dt><dd className="tabular-nums">{fmtMoney(f[k])}</dd></div>)}
              {Number(f.discount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Concession</dt><dd>− {fmtMoney(f.discount)}</dd></div>}
              <div className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold"><dt>Total</dt><dd>{fmtMoney(f.total_amount - f.discount)}</dd></div>
              <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd>{fmtMoney(f.amount_paid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Outstanding</dt><dd className={f.balance > 0 ? 'text-red-700' : ''}>{fmtMoney(f.waived || f.status === 'waived' ? 0 : f.balance)}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      <Card title="Payment history" bodyClassName="p-0">
        <DataTable rows={payments} rowKey="receipt_number" columns={[
          { key: 'receipt_number', header: 'Receipt', render: (p) => <span className="font-mono text-xs">{p.receipt_number}</span> },
          { key: 'paid_at', header: 'Date', render: (p) => fmtDateTime(p.paid_at) },
          { key: 'fee_name', header: 'Fee' },
          { key: 'payment_mode', header: 'Mode', render: (p) => p.payment_mode.toUpperCase() },
          { key: 'transaction_id', header: 'Transaction ID', hideOnMobile: true, render: (p) => <span className="font-mono text-xs">{p.transaction_id}</span> },
          { key: 'amount', header: 'Amount', render: (p) => <b>{fmtMoney(p.amount)}</b> },
        ]} />
      </Card>
    </div>
  );
}
