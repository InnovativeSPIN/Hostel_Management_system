import { useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, StatCard } from './ui/Card';
import { ErrorState, PageLoader } from './ui/States';
import { useFetch } from '../hooks/useFetch';
import { fmtPct, label, todayStr } from '../utils/format';

const CELL = {
  present: 'bg-emerald-100 text-emerald-800', late: 'bg-orange-100 text-orange-800', absent: 'bg-red-100 text-red-800',
  on_leave: 'bg-blue-100 text-blue-800', out_pass: 'bg-purple-100 text-purple-800',
};
const SHORT = { present: 'P', late: 'L', absent: 'A', on_leave: 'OL', out_pass: 'OP' };

/** Monthly attendance calendar + stats for one student. `url` returns { month, records, stats, history }. */
export default function AttendanceCalendar({ url }) {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const { data, loading, error, reload } = useFetch(url, { month });
  const shift = (n) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const byDate = Object.fromEntries(data.records.map((r) => [r.attendance_date, r]));
  const cells = [...Array((first.getDay() + 6) % 7).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const s = data.stats;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Attendance" value={fmtPct(s.percentage)} tone={s.percentage < 75 && s.present + s.absent ? 'red' : 'green'} />
        <StatCard label="Present" value={s.present} /><StatCard label="Late" value={s.late} tone="orange" />
        <StatCard label="Absent" value={s.absent} tone="red" /><StatCard label="On leave / out pass" value={s.onLeave + s.outPass} tone="blue" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          actions={<div className="flex gap-1">
            <button type="button" className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={month >= todayStr().slice(0, 7)} onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>}>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1 font-medium text-slate-500">{d}</div>)}
            {cells.map((d, i) => (d ? (
              <div key={d} className={clsx('flex aspect-square flex-col items-center justify-center rounded-lg', byDate[d] ? CELL[byDate[d].status] : 'bg-slate-50 text-slate-400', d === todayStr() && 'ring-2 ring-brand-500')}
                title={byDate[d] ? `${label(byDate[d].status)}${byDate[d].check_in_time ? ` · ${byDate[d].check_in_time.slice(0, 5)}` : ''}` : 'Not recorded'}>
                <span className="font-semibold">{Number(d.slice(8))}</span>
                {byDate[d] && <span className="text-[10px] font-bold">{SHORT[byDate[d].status]}</span>}
              </div>
            ) : <div key={`e${i}`} />))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">{Object.entries(SHORT).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className={clsx('rounded px-1.5 font-bold', CELL[k])}>{v}</span>{label(k)}</span>)}</div>
        </Card>
        <Card title="Recent months">
          {data.history.length === 0 ? <p className="text-sm text-slate-500">No attendance recorded yet.</p> : (
            <ul className="space-y-2">
              {data.history.map((h) => <li key={h.month} className="flex justify-between text-sm"><span>{new Date(`${h.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span><b className={h.percentage < 75 ? 'text-red-600' : ''}>{fmtPct(h.percentage)}</b></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
