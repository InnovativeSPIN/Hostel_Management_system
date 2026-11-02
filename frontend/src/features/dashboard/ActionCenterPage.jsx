import { useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Misc';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { ActionList } from './widgets';

const TYPES = {
  complaint_sla: 'Complaints', complaint_unassigned: 'Complaints', leave_overdue: 'Leave', leave_pending: 'Leave', repeated_absence: 'Attendance',
  maintenance: 'Maintenance', application: 'Admissions', allocation: 'Admissions', exit: 'Admissions', visitor: 'Visitors', fee: 'Fees',
};

export default function ActionCenterPage() {
  const { data, loading, error, reload } = useFetch('/dashboard/actions');
  const [tab, setTab] = useState('all');
  const groups = useMemo(() => {
    const counts = { all: data?.length || 0 };
    (data || []).forEach((a) => { counts[TYPES[a.type]] = (counts[TYPES[a.type]] || 0) + 1; });
    return counts;
  }, [data]);
  const items = (data || []).filter((a) => tab === 'all' || TYPES[a.type] === tab);
  const bySeverity = (s) => items.filter((a) => a.severity === s);

  return (
    <div>
      <PageHeader title="Action Center" subtitle="Every record that needs a decision, in one place. Click an item to open it." breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Action Center' }]} />
      <Tabs className="mb-4" value={tab} onChange={setTab}
        tabs={[{ value: 'all', label: 'All', count: groups.all }, ...['Complaints', 'Leave', 'Attendance', 'Admissions', 'Maintenance', 'Visitors', 'Fees'].filter((g) => groups[g]).map((g) => ({ value: g, label: g, count: groups[g] }))]} />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <Skeleton className="h-80" /> : (
        <div className="grid gap-5 lg:grid-cols-3">
          {[['high', 'High priority', 'text-red-700'], ['medium', 'Medium priority', 'text-amber-700'], ['low', 'Low priority', 'text-slate-600']].map(([s, t, cls]) => (
            <Card key={s} title={<span className={cls}>{t} ({bySeverity(s).length})</span>}>
              <ActionList items={bySeverity(s)} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
