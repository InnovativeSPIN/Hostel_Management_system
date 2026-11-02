import { useState } from 'react';
import { Lock } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Drawer } from '../../components/ui/Modal';
import { SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { fmtDateTime, label } from '../../utils/format';

function Json({ value }) {
  if (!value) return <p className="text-sm text-slate-400">—</p>;
  const obj = typeof value === 'string' ? JSON.parse(value) : value;
  return <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(obj, null, 2)}</pre>;
}

export default function AuditPage() {
  const [q, setQ] = useListState({ limit: 30 });
  const { data, meta, loading, error, reload } = useFetch('/audit', q);
  const facets = useFetch('/audit/facets');
  const [entry, setEntry] = useState(null);
  return (
    <div>
      <PageHeader title="Audit Logs" subtitle={<span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Read-only trail of who changed what — enforced by the database</span>}
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Audit logs' }]} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Summary, user, action" />
          <FilterSelect value={q.module} onChange={(v) => setQ({ module: v })} placeholder="All modules" options={(facets.data?.modules || []).map((m) => ({ value: m, label: label(m) }))} />
          <FilterSelect value={q.action} onChange={(v) => setQ({ action: v })} placeholder="All actions" options={(facets.data?.actions || []).map((a) => ({ value: a, label: a }))} />
          <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
          <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} onRowClick={setEntry} dense columns={[
          { key: 'created_at', header: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</span> },
          { key: 'user', header: 'Who', render: (r) => <span>{r.user_name}<span className="block text-xs text-slate-500">{label(r.user_role)}</span></span> },
          { key: 'action', header: 'What', render: (r) => <Badge tone="indigo">{r.action}</Badge> },
          { key: 'module', header: 'Module', hideOnMobile: true, render: (r) => label(r.module) },
          { key: 'record_id', header: 'Record', hideOnMobile: true },
          { key: 'summary', header: 'Summary', render: (r) => <span className="line-clamp-2 text-sm">{r.summary}</span> },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      <Drawer open={!!entry} onClose={() => setEntry(null)} title={entry?.action || ''} description={entry ? `${entry.user_name} · ${fmtDateTime(entry.created_at)} · ${entry.ip_address || ''}` : ''}>
        {entry && <div className="space-y-4">
          <p className="text-sm">{entry.summary}</p>
          <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Old value</h3><Json value={entry.old_value} /></div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">New value</h3><Json value={entry.new_value} /></div>
        </div>}
      </Drawer>
    </div>
  );
}
