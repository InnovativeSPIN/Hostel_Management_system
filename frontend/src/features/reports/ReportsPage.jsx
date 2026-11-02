import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText, FileDown, Printer } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import { FilterSelect } from '../../components/ui/Misc';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useHostels, useDepartments, hostelOptions } from '../../hooks/useLookups';
import { download } from '../../services/api';
import { todayStr, addDaysStr, label, fmtDate } from '../../utils/format';

function DailyStatus({ hostelId }) {
  const [date, setDate] = useState(todayStr());
  const { data, loading, error, reload } = useFetch('/reports/daily-status', { date, hostelId });
  return (
    <Card title="HOSTEL DAILY STATUS" subtitle={data ? `${fmtDate(data.date)} · ${data.hostels.join(', ')}` : ''}
      actions={<>
        <input type="date" aria-label="Date" className="input w-auto py-1" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
        <Button size="sm" variant="secondary" icon={FileDown} onClick={() => download('/reports/daily-status', { date, hostelId, format: 'pdf' }, `daily-status-${date}.pdf`).catch((e) => toast.error(e.message))}>PDF</Button>
        <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()}>Print</Button>
      </>}>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
          {data.sections.map((s) => (
            <section key={s.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">{s.title}</h3>
              <dl className="space-y-1.5">
                {s.items.map(([l, v, flag]) => (
                  <div key={l} className="flex justify-between gap-2 border-b border-dashed border-slate-100 pb-1 text-sm">
                    <dt className="text-slate-600">{l}</dt><dd className={clsx('font-semibold tabular-nums', flag ? 'text-red-600' : 'text-slate-900')}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
      {data && date !== todayStr() && <p className="mt-3 text-xs text-slate-500">Attendance figures are for the selected date; other figures are current.</p>}
    </Card>
  );
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const types = useFetch('/reports');
  const hostels = useHostels();
  const depts = useDepartments();
  const type = params.get('type') || 'daily-status';
  const [f, setF] = useState({ hostelId: '', from: addDaysStr(todayStr(), -29), to: todayStr(), departmentId: '', year: '', status: '' });
  const filters = { hostelId: f.hostelId || undefined, from: f.from, to: f.to, departmentId: f.departmentId || undefined, year: f.year || undefined, status: f.status || undefined };
  const report = useFetch(type !== 'daily-status' ? `/reports/${type}` : null, filters);
  const exp = (format) => download(`/reports/${type}`, { ...filters, format }, `${type}.${format}`).catch((e) => toast.error(e.message));

  return (
    <div className="space-y-5">
      <PageHeader title="Reports & Analytics" subtitle="Operational reports with CSV, Excel and PDF export" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Reports' }]} />
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <nav className="card h-fit p-2" aria-label="Reports">
          {(types.data || []).map((t) => (
            <button key={t.key} type="button" onClick={() => setParams({ type: t.key })}
              className={clsx('block w-full rounded-lg px-3 py-2 text-left text-sm', type === t.key ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
              {t.title}<span className="block text-xs font-normal text-slate-400">{t.description}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <div className="card flex flex-wrap items-center gap-2 p-3">
            <FilterSelect value={f.hostelId} onChange={(v) => setF({ ...f, hostelId: v })} placeholder="All hostels in scope" options={hostelOptions(hostels)} />
            {type !== 'daily-status' && <>
              {!['students', 'departments', 'occupancy', 'fees'].includes(type) && <>
                <input type="date" aria-label="From" className="input w-auto py-1.5" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
                <input type="date" aria-label="To" className="input w-auto py-1.5" value={f.to} max={todayStr()} onChange={(e) => setF({ ...f, to: e.target.value })} />
              </>}
              {type === 'students' && <>
                <FilterSelect value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.short_name }))} />
                <FilterSelect value={f.year} onChange={(v) => setF({ ...f, year: v })} placeholder="All years" options={[1, 2, 3, 4].map((y) => ({ value: y, label: `Year ${y}` }))} />
              </>}
              {type === 'fees' && <FilterSelect value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any status" options={['overdue', 'partial', 'pending', 'paid'].map((s) => ({ value: s, label: label(s) }))} />}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="secondary" icon={FileText} onClick={() => exp('csv')}>CSV</Button>
                <Button size="sm" variant="secondary" icon={FileSpreadsheet} onClick={() => exp('xlsx')}>Excel</Button>
                <Button size="sm" variant="secondary" icon={FileDown} onClick={() => exp('pdf')}>PDF</Button>
              </div>
            </>}
          </div>
          {type === 'daily-status' ? <DailyStatus hostelId={f.hostelId || undefined} /> : (
            <Card title={report.data?.title || 'Report'} subtitle={report.data?.meta?.join(' · ')} bodyClassName="p-0">
              <DataTable rows={report.data?.rows?.slice(0, 500)} loading={report.loading} error={report.error} onRetry={report.reload} rowKey="__none" dense
                columns={(report.data?.columns || []).map((c) => ({ key: c.key, header: c.label, render: (r) => (r[c.key] === null || r[c.key] === undefined || r[c.key] === '' ? '—' : String(r[c.key])) }))} />
              {report.data?.rows?.length > 500 && <p className="p-3 text-xs text-slate-500">Showing first 500 rows. Export for the full report.</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
