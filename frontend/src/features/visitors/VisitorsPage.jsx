import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, LogIn, LogOut, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDateTime, duration, todayStr } from '../../utils/format';
import VisitorForm from './VisitorForm';

export function useVisitorActions(reload) {
  const [confirm, setConfirm] = useState(null);
  const [pending, setPending] = useState(false);
  const run = async (remarks) => {
    const { type, row } = confirm;
    setPending(true);
    try {
      const body = type === 'check-in' && remarks ? { override: true, remarks } : {};
      await api.post(`/visitors/${row.id}/${type}`, body);
      toast.success(`${row.visitor_name}: ${type.replace('-', ' ')}`);
      setConfirm(null);
      reload();
    } catch (err) {
      if (err.code === 'OUTSIDE_VISITING_HOURS') setConfirm({ ...confirm, needsOverride: true });
      toast.error(err.message);
    } finally { setPending(false); }
  };
  const dialog = (
    <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={pending} onConfirm={run}
      title={confirm ? `${confirm.type === 'check-in' ? 'Check in' : confirm.type === 'check-out' ? 'Check out' : 'Cancel visit'} · ${confirm.row.visitor_name}` : ''}
      message={confirm ? `${confirm.row.pass_code} · visiting ${confirm.row.student_name} (${confirm.row.relationship}). ${confirm.type === 'check-in' ? `Verify ${confirm.row.id_proof_type?.replace('_', ' ')} ${confirm.row.id_proof_number}.` : ''}` : ''}
      tone={confirm?.type === 'cancel' ? 'danger' : 'primary'} confirmLabel={confirm?.needsOverride ? 'Override & check in' : 'Confirm'}
      reasonLabel={confirm?.needsOverride ? 'Override remarks (outside visiting hours)' : undefined} />
  );
  return { ask: (type, row) => setConfirm({ type, row }), dialog };
}

export default function VisitorsPage() {
  const { can } = useAuth();
  const hostels = useHostels();
  const [q, setQ] = useListState({ status: 'checked_in' });
  const { data, meta, loading, error, reload } = useFetch('/visitors', q);
  const [registering, setRegistering] = useState(false);
  const { ask, dialog } = useVisitorActions(reload);
  const manage = can('visitors.manage');
  const tab = q.from === todayStr() && !q.status ? 'today' : q.status || 'all';
  return (
    <div>
      <PageHeader title="Visitor Register" subtitle="Who visited, whom, when they entered — and whether they left" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Visitors' }]}
        actions={manage && <Button size="sm" icon={UserPlus} onClick={() => setRegistering(true)}>Register visitor</Button>} />
      <Tabs className="mb-3" value={tab} onChange={(t) => setQ({ status: ['checked_in', 'expected', 'checked_out', 'cancelled'].includes(t) ? t : '', from: t === 'today' ? todayStr() : '', to: t === 'today' ? todayStr() : '' })}
        tabs={[{ value: 'checked_in', label: 'Inside now' }, { value: 'expected', label: 'Expected' }, { value: 'today', label: 'Today' }, { value: 'checked_out', label: 'Checked out' }, { value: 'all', label: 'All' }]} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Visitor, phone, pass, student" />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
          <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
          <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={[
          { key: 'pass_code', header: 'Pass', render: (r) => <span className="font-mono text-xs">{r.pass_code}</span> },
          { key: 'visitor', header: 'Visitor', render: (r) => <span><b>{r.visitor_name}</b><span className="block text-xs text-slate-500">{r.visitor_phone} · {r.relationship}</span></span> },
          { key: 'student', header: 'Visiting', render: (r) => <span>{r.student_name}<span className="block text-xs text-slate-500">{r.hostel_code}-{r.room_number || '—'}</span></span> },
          { key: 'purpose', header: 'Purpose', hideOnMobile: true },
          { key: 'times', header: 'Entry / exit', render: (r) => (r.entry_time ? <span className="text-xs">{fmtDateTime(r.entry_time)}<span className="block">{r.exit_time ? `→ ${fmtDateTime(r.exit_time)}` : <Badge tone={r.minutes_inside > 180 ? 'orange' : 'green'}>Inside {duration(r.minutes_inside)}</Badge>}</span></span> : <span className="text-xs text-slate-500">Expected {fmtDateTime(r.expected_at)}</span>) },
          { key: 'id', header: 'ID proof', hideOnMobile: true, render: (r) => <span className="text-xs">{r.id_proof_type?.replace('_', ' ')}<span className="block font-mono">{r.id_proof_number}</span></span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'act', header: '', render: (r) => manage && (
            <div className="flex gap-1">
              {r.status === 'expected' && <><Button size="xs" icon={LogIn} onClick={() => ask('check-in', r)}>Check in</Button><Button size="xs" variant="ghost" icon={X} onClick={() => ask('cancel', r)} aria-label="Cancel" /></>}
              {r.status === 'checked_in' && <Button size="xs" variant="secondary" icon={LogOut} onClick={() => ask('check-out', r)}>Check out</Button>}
            </div>
          ) },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      {registering && <VisitorForm onClose={() => setRegistering(false)} onDone={() => { setRegistering(false); reload(); }} />}
      {dialog}
    </div>
  );
}
