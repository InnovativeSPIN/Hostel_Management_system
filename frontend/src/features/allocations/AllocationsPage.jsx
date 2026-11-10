import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { BedDouble, ArrowRightLeft, LogOut, Sparkles, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Drawer, Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Select, Textarea } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import api from '../../services/api';
import { fmtDate, fmtDateTime, label } from '../../utils/format';

function BedChooser({ gender, value, onChange, excludeBedId }) {
  const hostels = useHostels();
  const [hostelId, setHostelId] = useState('');
  const { data, loading } = useFetch('/beds/available', { hostelId: hostelId || undefined, gender });
  const beds = (data || []).filter((b) => b.id !== excludeBedId);
  const rooms = beds.reduce((acc, b) => { (acc[`${b.hostel_code}-${b.room_number}`] ||= []).push(b); return acc; }, {});
  return (
    <div className="space-y-3">
      <Select label="Hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)} placeholder="All eligible hostels"
        options={hostelOptions(hostels.filter((h) => !gender || h.gender === gender || h.gender === 'co-ed'))} />
      {loading ? <Spinner /> : beds.length === 0 ? <p className="text-sm text-slate-500">No available beds for this filter.</p> : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {Object.entries(rooms).map(([room, list]) => (
            <div key={room} className="rounded-lg border border-slate-200 p-2">
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Room {room} · {label(list[0].room_type)}{list[0].is_ac ? ' · AC' : ''} · {list[0].current_occupancy}/{list[0].capacity} occupied</p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((b) => (
                  <button key={b.id} type="button" onClick={() => onChange(b)} aria-pressed={value?.id === b.id}
                    className={clsx('rounded-md border px-2 py-1 text-xs font-medium', value?.id === b.id ? 'border-brand-500 bg-brand-600 text-white' : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100')}>
                    {b.bed_code}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AllocateDrawer({ student, onClose, onDone }) {
  const suggest = useFetch(student ? '/allocations/suggest' : null, { studentId: student?.student_id });
  const [bed, setBed] = useState(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setBed(null), [student]);
  const submit = async () => {
    setPending(true);
    try {
      const { data } = await api.post('/allocations', { studentId: student.student_id, bedId: bed.id ?? bed.bed_id });
      toast.success(`${student.name} allocated to ${data.data.bedCode}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  const selectedId = bed?.id ?? bed?.bed_id;
  return (
    <Drawer open={!!student} onClose={onClose} title={`Allocate bed · ${student?.name || ''}`} description={student ? `${student.register_number} · ${student.department} · Year ${student.year_of_study} · ${label(student.gender)}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={CheckCircle2} disabled={!bed} loading={pending} onClick={submit}>Allocate {bed ? (bed.bed_code) : ''}</Button></>}>
      {student && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Sparkles className="h-4 w-4 text-brand-500" />Suggested beds</h3>
            <p className="mb-2 text-xs text-slate-500">Ranked by preference match and roommates from the same year/department. You make the final choice.</p>
            {suggest.loading ? <Spinner /> : !suggest.data?.length ? <p className="text-sm text-slate-500">No suitable free beds found.</p> : (
              <ul className="space-y-1.5">
                {suggest.data.slice(0, 6).map((s) => (
                  <li key={s.bed_id}>
                    <button type="button" onClick={() => setBed(s)} aria-pressed={selectedId === s.bed_id}
                      className={clsx('w-full rounded-lg border p-2.5 text-left', selectedId === s.bed_id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50')}>
                      <span className="flex items-center justify-between gap-2"><b className="text-sm">{s.bed_code}</b><span className="text-xs text-slate-500">{s.hostel_name} · {label(s.room_type)} · {s.current_occupancy}/{s.capacity}</span></span>
                      {s.reasons.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{s.reasons.map((r) => <Badge key={r} tone="indigo">{r}</Badge>)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Or choose any available bed</h3>
            <BedChooser gender={student.gender} value={bed?.id ? bed : null} onChange={setBed} />
          </section>
        </div>
      )}
    </Drawer>
  );
}

function TransferModal({ allocation, onClose, onDone }) {
  const [bed, setBed] = useState(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const gender = allocation.gender;
  const submit = async () => {
    setPending(true);
    try {
      const { data } = await api.post(`/allocations/${allocation.id}/transfer`, { newBedId: bed.id, reason });
      toast.success(`Transferred ${data.data.from} → ${data.data.to}`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Transfer ${allocation.student_name}`} description={`Current bed ${allocation.bed_code}. The old allocation is kept as history.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={ArrowRightLeft} disabled={!bed || reason.trim().length < 5} loading={pending} onClick={submit}>Transfer{bed ? ` to ${bed.bed_code}` : ''}</Button></>}>
      <div className="space-y-4">
        <BedChooser gender={gender} value={bed} onChange={setBed} excludeBedId={allocation.bed_id} />
        <Textarea label="Reason for transfer" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Roommate conflict / medical ground floor request" />
      </div>
    </Modal>
  );
}

export default function AllocationsPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'pending');
  const [q, setQ] = useListState();
  const hostels = useHostels();
  const pending = useFetch('/allocations/pending');
  const active = useFetch(tab === 'active' ? '/allocations' : null, q);
  const history = useFetch(tab === 'history' ? '/allocations/history' : null, q);
  const [allocating, setAllocating] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [vacate, setVacate] = useState(null);
  const [vacating, setVacating] = useState(false);

  // Deep links: ?studentId= opens the allocate drawer, ?transfer=<allocationId> opens the transfer dialog.
  useEffect(() => {
    const sid = params.get('studentId');
    if (sid && pending.data) {
      const s = pending.data.find((p) => String(p.student_id) === sid);
      if (s) setAllocating(s); else toast.error('This student has no approved admission awaiting allocation');
      params.delete('studentId'); setParams(params, { replace: true });
    }
  }, [pending.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tid = params.get('transfer');
    if (!tid) return;
    api.get('/allocations', { params: { limit: 500 } }).then((r) => {
      const a = r.data.data.find((x) => String(x.id) === tid);
      if (a) api.get(`/students/${a.student_id}`).then((s) => setTransfer({ ...a, gender: s.data.data.student.gender, bed_id: s.data.data.allocation?.bed_id }));
    }).catch(() => {});
    params.delete('transfer'); setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTransfer = async (a) => {
    try {
      const s = await api.get(`/students/${a.student_id}`);
      setTransfer({ ...a, gender: s.data.data.student.gender, bed_id: s.data.data.allocation?.bed_id });
    } catch (err) { toast.error(err.message); }
  };
  const doVacate = async (reason) => {
    setVacating(true);
    try { await api.post(`/allocations/${vacate.id}/vacate`, { reason }); toast.success(`Bed ${vacate.bed_code} released`); setVacate(null); active.reload(); } catch (err) { toast.error(err.message); } finally { setVacating(false); }
  };
  const refresh = () => { pending.reload(); active.reload(); history.reload(); };

  return (
    <div>
      <PageHeader title="Room Allocation" subtitle="Allocation engine with row-level locking: one student per bed, one bed per student, capacity enforced"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Allocations' }]} actions={<Button size="sm" variant="secondary" icon={BedDouble} to="/bed-map?availableOnly=true">Free beds</Button>} />
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[
        { value: 'pending', label: 'Awaiting allocation', count: pending.data?.length }, { value: 'active', label: 'Current residents' }, { value: 'history', label: 'History & transfers' },
      ]} />

      {tab === 'pending' && (
        <div className="card">
          <DataTable rows={pending.data} rowKey="application_id" loading={pending.loading} error={pending.error} onRetry={pending.reload}
            empty={<EmptyState icon={CheckCircle2} title="No approved students waiting" message="Approved admissions appear here until a bed is allocated." />}
            columns={[
              { key: 'name', header: 'Student', render: (r) => <span className="font-medium">{r.name}<span className="block text-xs font-normal text-slate-500">{r.register_number} · {r.department} · Y{r.year_of_study} · {label(r.gender)}</span></span> },
              { key: 'application_code', header: 'Application', render: (r) => <Link className="text-brand-600" to={`/applications/${r.application_id}`}>{r.application_code}</Link> },
              { key: 'pref', header: 'Preference', render: (r) => `${r.preferred_hostel || 'Any'} · ${r.preferred_room_type ? label(r.preferred_room_type) : 'any room'}${r.needs_ac ? ' · AC' : ''}` },
              { key: 'status', header: 'Stage', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'reviewed_at', header: 'Approved', hideOnMobile: true, render: (r) => fmtDate(r.reviewed_at) },
              { key: 'act', header: '', render: (r) => <Button size="xs" icon={BedDouble} onClick={() => setAllocating(r)}>Allocate</Button> },
            ]} />
        </div>
      )}

      {tab === 'active' && (
        <div className="card">
          <FilterBar>
            <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student, register no, bed, room" />
            <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
          </FilterBar>
          <DataTable rows={active.data} loading={active.loading} error={active.error} onRetry={active.reload} columns={[
            { key: 'bed_code', header: 'Bed', render: (r) => <b>{r.bed_code}</b> },
            { key: 'student', header: 'Student', render: (r) => <Link to={`/students/${r.student_id}`} className="hover:text-brand-700">{r.student_name}<span className="block text-xs text-slate-500">{r.register_number} · {r.department} Y{r.year_of_study}</span></Link> },
            { key: 'room_type', header: 'Room', hideOnMobile: true, render: (r) => `${r.hostel_code}-${r.room_number} · ${label(r.room_type)}` },
            { key: 'allocated_at', header: 'Since', hideOnMobile: true, render: (r) => fmtDate(r.allocated_at) },
            { key: 'act', header: '', render: (r) => <div className="flex gap-1"><Button size="xs" variant="secondary" icon={ArrowRightLeft} onClick={() => openTransfer(r)}>Transfer</Button><Button size="xs" variant="ghost" icon={LogOut} onClick={() => setVacate(r)}>Vacate</Button></div> },
          ]} />
          <Pagination meta={active.meta} onPage={(page) => setQ({ page })} />
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-5">
          <div className="card">
            <FilterBar>
              <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student or bed" />
              <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any status" options={['active', 'transferred', 'vacated'].map((s) => ({ value: s, label: label(s) }))} />
              <input type="date" aria-label="From" className="input w-auto py-1.5" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} />
              <input type="date" aria-label="To" className="input w-auto py-1.5" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} />
            </FilterBar>
            <DataTable rows={history.data?.allocations} loading={history.loading} error={history.error} columns={[
              { key: 'student_name', header: 'Student', render: (r) => <span>{r.student_name}<span className="block text-xs text-slate-500">{r.register_number}</span></span> },
              { key: 'bed_code', header: 'Bed' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'allocated_at', header: 'From', render: (r) => fmtDateTime(r.allocated_at) },
              { key: 'ended_at', header: 'To', render: (r) => (r.ended_at ? fmtDateTime(r.ended_at) : 'Present') },
              { key: 'end_reason', header: 'Reason', hideOnMobile: true },
              { key: 'allocated_by', header: 'By', hideOnMobile: true },
            ]} />
            <Pagination meta={history.meta} onPage={(page) => setQ({ page })} />
          </div>
          <div className="card">
            <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Transfers</h3>
            <DataTable rows={history.data?.transfers} columns={[
              { key: 'created_at', header: 'Date', render: (r) => fmtDateTime(r.created_at) },
              { key: 'student_name', header: 'Student', render: (r) => `${r.student_name} (${r.register_number})` },
              { key: 'move', header: 'Move', render: (r) => <span><b>{r.from_bed}</b> → <b>{r.to_bed}</b></span> },
              { key: 'reason', header: 'Reason' }, { key: 'transferred_by', header: 'By' },
            ]} />
          </div>
        </div>
      )}

      <AllocateDrawer student={allocating} onClose={() => setAllocating(null)} onDone={() => { setAllocating(null); refresh(); }} />
      {transfer && <TransferModal allocation={transfer} onClose={() => setTransfer(null)} onDone={() => { setTransfer(null); refresh(); }} />}
      <ConfirmDialog open={!!vacate} onClose={() => setVacate(null)} onConfirm={doVacate} loading={vacating} tone="danger" confirmLabel="Release bed"
        title={`Release ${vacate?.bed_code}?`} message={`This ends ${vacate?.student_name}'s allocation immediately. For graduating or leaving students, prefer the Hostel Exit workflow (fee verification + room inspection).`}
        reasonLabel="Reason" />
    </div>
  );
}
