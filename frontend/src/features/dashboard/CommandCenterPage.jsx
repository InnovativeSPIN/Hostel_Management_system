import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Users, BedDouble, UserCheck, CalendarDays, DoorOpen, AlertTriangle, Clock, MessageSquareWarning, IndianRupee, ClipboardX, Hammer, RefreshCw, FileText, Siren,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, StatCard } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { FilterSelect } from '../../components/ui/Misc';
import { ErrorState, SkeletonCards, Skeleton } from '../../components/ui/States';
import { OccupancyChart, AttendanceTrend, CategoryBars, moneyShort } from '../../components/charts/Charts';
import { useFetch } from '../../hooks/useFetch';
import { useAction } from '../../hooks/useAction';
import api from '../../services/api';
import { fmtMoney, fmtNum, fmtPct, label, timeAgo } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { ActionList, HealthCard } from './widgets';

function ExceptionTile({ count, label: text, icon: Icon, to, tone }) {
  const active = count > 0;
  const tones = { red: 'border-red-200 bg-red-50 text-red-700', orange: 'border-orange-200 bg-orange-50 text-orange-700', yellow: 'border-amber-200 bg-amber-50 text-amber-800' };
  return (
    <Link to={to} className={clsx('flex items-center gap-3 rounded-xl border p-3 transition hover:shadow-sm', active ? tones[tone] : 'border-slate-200 bg-white text-slate-500')}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-none">{count}</p>
        <p className="mt-1 text-xs font-medium leading-tight">{text}</p>
      </div>
    </Link>
  );
}

export default function CommandCenterPage() {
  const { user, can } = useAuth();
  const [hostelId, setHostelId] = useState('');
  const { data, loading, error, reload } = useFetch('/dashboard/command', { hostelId: hostelId || undefined });
  const runJobs = useAction(() => api.post('/settings/run-jobs'), { success: 'Automation run complete', onSuccess: reload });

  const k = data?.kpis;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Hostel Command Center"
        subtitle={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ').slice(-2).join(' ')}. Exceptions that need action are shown first.`}
        actions={<>
          {data?.hostels?.length > 1 || hostelId ? (
            <FilterSelect label="Hostel" value={hostelId} onChange={setHostelId} placeholder="All hostels" options={(data?.hostels || []).map((h) => ({ value: h.id, label: h.name }))} />
          ) : null}
          {can('reports.view') && <Button variant="secondary" size="sm" icon={FileText} to="/reports?type=daily-status">Daily status</Button>}
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={runJobs.pending} onClick={() => runJobs.run()} title="Run SLA escalation, overdue detection and alerts now">Refresh alerts</Button>
        </>}
      />

      {error && <ErrorState error={error} onRetry={reload} />}

      {/* 1. Exceptions requiring action */}
      <section aria-labelledby="exc-h">
        <h2 id="exc-h" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><AlertTriangle className="h-4 w-4 text-red-500" />Exceptions</h2>
        {!k ? <SkeletonCards count={6} /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <ExceptionTile count={k.absentToday} label="Absent today" icon={ClipboardX} tone="red" to="/attendance/exceptions" />
            <ExceptionTile count={k.overdueReturns} label="Overdue leave returns" icon={Clock} tone="red" to="/leaves?overdue=true" />
            <ExceptionTile count={k.slaBreached} label="SLA-breached complaints" icon={MessageSquareWarning} tone="red" to="/complaints?sla=breached" />
            <ExceptionTile count={k.feeOverdue} label="Overdue fee records" icon={IndianRupee} tone="orange" to="/fees?status=overdue" />
            <ExceptionTile count={k.notMarked} label="Attendance not marked" icon={AlertTriangle} tone="yellow" to="/attendance" />
            <ExceptionTile count={k.staleMaintenance} label="Maintenance > 3 days" icon={Hammer} tone="yellow" to="/maintenance?open=true" />
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* 2. Action Center */}
        <Card title="Action Center" subtitle="Highest priority first" icon={Siren} className="xl:col-span-2"
          actions={<Link to="/action-center" className="text-xs font-medium text-brand-600 hover:text-brand-700">View all ({data?.actions?.length ?? 0})</Link>}>
          {loading && !data ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> : <ActionList items={data?.actions?.slice(0, 8)} compact />}
        </Card>

        {/* 3. Today at a glance */}
        <Card title="Today at a glance" icon={CalendarDays}>
          {!k ? <Skeleton className="h-56" /> : (
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Present / late', `${k.presentToday}`, `${fmtPct(k.attendanceToday)} of marked`],
                ['On leave', k.onLeave, `${k.pendingLeaves} awaiting approval`],
                ['Visitors inside', k.visitorsInside, `${k.visitorsToday} today · ${k.visitorsExpected} expected`],
                ['Complaints open', k.openComplaints, `${k.resolvedToday} resolved today · ${k.unassignedComplaints} unassigned`],
                ['Admissions', k.pendingApplications, `${k.awaitingAllocation} awaiting a bed`],
                ['Exit requests', k.pendingExits, 'awaiting inspection / clearance'],
              ].map(([t, v, hint]) => (
                <div key={t} className="flex items-center justify-between gap-3 py-2">
                  <dt><span className="text-slate-700">{t}</span><span className="block text-xs text-slate-500">{hint}</span></dt>
                  <dd className="text-lg font-semibold tabular-nums text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      {/* 4. Core statistics */}
      {!k ? <SkeletonCards count={4} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Residents" value={fmtNum(k.students)} hint={`${k.totalRooms} rooms · ${k.totalBeds} beds`} icon={Users} to="/students?hostelStatus=resident" />
          <StatCard label="Occupancy" value={fmtPct(k.occupancy)} hint={`${k.occupiedBeds} occupied`} icon={BedDouble} tone="blue" to="/bed-map" />
          <StatCard label="Available beds" value={k.availableBeds} hint={`${k.maintenanceRooms} room(s) under maintenance`} icon={DoorOpen} tone="green" to="/bed-map?availableOnly=true" />
          <StatCard label="Fee collection" value={fmtPct(k.feeCollectionRate)} hint={`${fmtMoney(k.feeOutstanding)} outstanding`} icon={IndianRupee} to="/fees" />
        </div>
      )}

      {/* 5. Hostel health */}
      {data?.health?.length > 0 && (
        <section aria-labelledby="health-h">
          <h2 id="health-h" className="mb-2 text-sm font-semibold text-slate-700">Hostel Health Score</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.health.map((h) => <HealthCard key={h.id} hostel={h} />)}</div>
        </section>
      )}

      {/* 6. Analytics */}
      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Bed occupancy by hostel" icon={BedDouble}><OccupancyChart data={data.charts.occupancy} /></Card>
          <Card title="Daily attendance — last 14 days" icon={UserCheck}><AttendanceTrend data={data.charts.attendance} /></Card>
          <Card title="Complaints by status" icon={MessageSquareWarning}>
            <CategoryBars data={data.charts.complaints.map((c) => ({ ...c, color: c.name === 'SLA breached' ? '#e34948' : undefined }))} />
          </Card>
          <Card title="Fee position (current residents)" icon={IndianRupee}>
            <CategoryBars valueFormatter={moneyShort} data={data.charts.fees.map((f) => ({ ...f, color: f.name === 'Overdue' ? '#e34948' : f.name === 'Collected' ? '#1baf7a' : undefined }))} />
          </Card>
          {data.health.length > 1 && (
            <Card title="Hostel comparison — health score" className="lg:col-span-2">
              <CategoryBars height={60 + data.health.length * 36} valueFormatter={(v) => `${v}%`} data={data.health.map((h) => ({ name: h.name.replace(/ Hostel.*$/, ''), value: h.score }))} />
            </Card>
          )}
          {data.charts.complaintCategories.length > 0 && (
            <Card title="Complaint categories — last 30 days" className="lg:col-span-2">
              <CategoryBars height={40 + data.charts.complaintCategories.length * 30} data={data.charts.complaintCategories.map((c) => ({ name: label(c.category), value: c.count }))} />
            </Card>
          )}
        </div>
      )}
      {data && <p className="text-right text-xs text-slate-400">Updated {timeAgo(new Date(data.generatedAt))} · data refreshes when you reload</p>}
    </div>
  );
}
