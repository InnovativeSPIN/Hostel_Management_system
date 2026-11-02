import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import { SearchInput, FilterSelect, FilterBar, Tabs } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, useDepartments, hostelOptions } from '../../hooks/useLookups';
import { fmtDate, label } from '../../utils/format';

const STAGES = ['submitted', 'documents_verified', 'eligible', 'approved', 'fee_assigned', 'allocated', 'confirmed', 'rejected', 'cancelled'];

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useListState({ open: 'true' });
  const { data, meta, loading, error, reload } = useFetch('/applications', q);
  const hostels = useHostels();
  const depts = useDepartments();
  return (
    <div>
      <PageHeader title="Hostel Admissions" subtitle="Application → Document verification → Eligibility → Decision → Fee → Allocation → Confirmation"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Admissions' }]} />
      <Tabs className="mb-3" value={q.open === 'true' ? 'open' : 'all'} onChange={(v) => setQ({ open: v === 'open' ? 'true' : '', status: '' })}
        tabs={[{ value: 'open', label: 'In progress' }, { value: 'all', label: 'All applications' }]} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Student, register no, APP code" />
          <FilterSelect value={q.status} onChange={(v) => setQ({ status: v })} placeholder="Any stage" options={STAGES.map((s) => ({ value: s, label: label(s) }))} />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="Any hostel" options={hostelOptions(hostels)} />
          <FilterSelect value={q.departmentId} onChange={(v) => setQ({ departmentId: v })} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.short_name }))} />
          <FilterSelect value={q.year} onChange={(v) => setQ({ year: v })} placeholder="All years" options={[1, 2, 3, 4].map((y) => ({ value: y, label: `Year ${y}` }))} />
        </FilterBar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} onRowClick={(r) => navigate(`/applications/${r.id}`)} columns={[
          { key: 'application_code', header: 'Application', render: (r) => <span className="font-medium text-slate-800">{r.application_code}<span className="block text-xs font-normal text-slate-500">{r.academic_year}</span></span> },
          { key: 'student_name', header: 'Student', render: (r) => <span>{r.student_name}<span className="block text-xs text-slate-500">{r.register_number} · {r.department} · Y{r.year_of_study}</span></span> },
          { key: 'preferred_hostel', header: 'Preference', hideOnMobile: true, render: (r) => <span>{r.preferred_hostel || 'Any'}<span className="block text-xs text-slate-500">{r.preferred_room_type ? label(r.preferred_room_type) : 'Any room'}{r.needs_ac ? ' · AC' : ''}</span></span> },
          { key: 'distance', header: 'Distance', hideOnMobile: true, render: (r) => (r.distance_from_home_km ? `${r.distance_from_home_km} km` : '—') },
          { key: 'documents', header: 'Docs', render: (r) => <Badge tone={r.documents >= 2 ? 'green' : 'yellow'}>{r.documents}</Badge> },
          { key: 'created_at', header: 'Submitted', render: (r) => fmtDate(r.created_at) },
          { key: 'status', header: 'Stage', render: (r) => <StatusBadge status={r.status} /> },
        ]} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
    </div>
  );
}
