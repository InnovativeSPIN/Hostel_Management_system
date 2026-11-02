import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useFetch, useListState } from '../../hooks/useFetch';
import api from '../../services/api';
import { fmtDateTime } from '../../utils/format';
import VisitorForm from './VisitorForm';

export default function MyVisitorsPage() {
  const [q, setQ] = useListState();
  const { data, meta, loading, error, reload } = useFetch('/visitors', q);
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState(null);
  const [pending, setPending] = useState(false);
  const doCancel = async () => {
    setPending(true);
    try { await api.post(`/visitors/${cancel.id}/cancel`); toast.success('Visit cancelled'); setCancel(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <div>
      <PageHeader title="My Visitors" subtitle="Pre-register family visits so entry at the gate is quick" actions={<Button size="sm" icon={UserPlus} onClick={() => setOpen(true)}>Pre-register visitor</Button>} />
      <div className="card">
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          { key: 'pass_code', header: 'Pass', render: (r) => <span className="font-mono text-xs">{r.pass_code}</span> },
          { key: 'visitor_name', header: 'Visitor', render: (r) => <span><b>{r.visitor_name}</b><span className="block text-xs text-slate-500">{r.relationship} · {r.purpose}</span></span> },
          { key: 'when', header: 'When', render: (r) => (r.entry_time ? `${fmtDateTime(r.entry_time)}${r.exit_time ? ` → ${fmtDateTime(r.exit_time)}` : ''}` : `Expected ${fmtDateTime(r.expected_at)}`) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'act', header: '', render: (r) => r.status === 'expected' && <Button size="xs" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button> },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {open && <VisitorForm mode="student" onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} loading={pending} tone="danger" title={`Cancel visit by ${cancel?.visitor_name}?`} confirmLabel="Cancel visit" />
    </div>
  );
}
