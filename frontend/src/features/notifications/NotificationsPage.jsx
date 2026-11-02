import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCheck, Bell } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Misc';
import { ErrorState, PageLoader, EmptyState } from '../../components/ui/States';
import { useFetch, useListState } from '../../hooks/useFetch';
import api from '../../services/api';
import { fmtDateTime, timeAgo, label } from '../../utils/format';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useListState();
  const { data, loading, error, reload } = useFetch('/notifications', { limit: 100, unread: q.unread });
  const open = async (n) => {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    window.dispatchEvent(new Event('notifications:refresh'));
    if (n.link) navigate(n.link); else reload();
  };
  const readAll = async () => { await api.patch('/notifications/read-all'); window.dispatchEvent(new Event('notifications:refresh')); reload(); };
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  return (
    <div>
      <PageHeader title="Notifications" subtitle={`${data.unread} unread`} actions={data.unread > 0 && <Button size="sm" variant="secondary" icon={CheckCheck} onClick={readAll}>Mark all read</Button>} />
      <Tabs className="mb-3" value={q.unread === 'true' ? 'unread' : 'all'} onChange={(t) => setQ({ unread: t === 'unread' ? 'true' : '' })} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: data.unread }]} />
      <div className="card divide-y divide-slate-100">
        {data.items.length === 0 && <EmptyState icon={Bell} title="No notifications" />}
        {data.items.map((n) => (
          <button key={n.id} type="button" onClick={() => open(n)} className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.is_read && 'bg-brand-50/40')}>
            <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-slate-200' : 'bg-brand-500')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-slate-800">{n.title}</span><span className="text-[11px] uppercase tracking-wide text-slate-400">{label(n.type)}</span></span>
              <span className="block text-sm text-slate-600">{n.message}</span>
              <span className="block text-xs text-slate-400" title={fmtDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
