import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination, toggleSort } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SearchInput, FilterSelect, FilterBar, Avatar } from '../../components/ui/Misc';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, useDepartments, hostelOptions } from '../../hooks/useLookups';
import { useAuth } from '../../context/AuthContext';
import { download } from '../../services/api';
import StudentForm from './StudentForm';

const STATUS = ['not_applied', 'applied', 'approved', 'resident', 'exited', 'rejected'].map((s) => ({ value: s, label: s.replace('_', ' ') }));

export default function StudentsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useListState();
  const { data, meta, loading, error, reload } = useFetch('/students', q);
  const hostels = useHostels();
  const depts = useDepartments();
  const [formOpen, setFormOpen] = useState(false);

  const columns = [
    {
      key: 'name',
      header: 'Student',
      sortKey: 'name',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} src={r.photo_url} className="h-8 w-8 text-xs shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-slate-800 truncate">{r.name}</p>
              {r.student_type === 'NS-CBSE' && (
                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">CBSE</span>
              )}
            </div>
            <p className="text-xs text-slate-500">{r.register_number}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department / Class',
      sortKey: 'department',
      render: (r) => (
        r.student_type === 'NS-CBSE' ? (
          <span>
            <span className="font-medium text-purple-900">{r.cbse_class_level || 'School'}</span>
            <span className="block text-xs text-slate-500">Sec {r.cbse_section || '—'}{r.cbse_admission_number ? ` · Adm ${r.cbse_admission_number}` : ''}</span>
          </span>
        ) : (
          <span>
            {r.department}
            <span className="block text-xs text-slate-500">Year {r.year_of_study} · Sem {r.semester}{r.section ? ` · ${r.section}` : ''}</span>
          </span>
        )
      ),
    },
    { key: 'room', header: 'Hostel / Room', sortKey: 'room', render: (r) => (r.bed_code ? <span>{r.hostel_code}-{r.room_number}<span className="block text-xs text-slate-500">{r.bed_code}</span></span> : <span className="text-slate-400">—</span>) },
    { key: 'phone', header: 'Phone', hideOnMobile: true },
    { key: 'batch', header: 'Batch', hideOnMobile: true },
    { key: 'hostel_status', header: 'Status', render: (r) => <StatusBadge status={r.hostel_status} /> },
  ];

  return (
    <div>
      <PageHeader title="Students" subtitle="All students with department, class, year and hostel placement" breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Students' }]}
        actions={<>
          {can('reports.view') && <Button variant="secondary" size="sm" icon={Download} onClick={() => download('/reports/students', { format: 'xlsx', departmentId: q.departmentId, year: q.year }, 'students.xlsx')}>Export</Button>}
          {can('students.manage') && <Button size="sm" icon={UserPlus} onClick={() => setFormOpen(true)}>Add student</Button>}
        </>} />
      <div className="card">
        <FilterBar>
          <SearchInput className="w-full sm:w-64" value={q.search || ''} onSearch={(search) => setQ({ search })} placeholder="Name, register, email, phone" />
          <FilterSelect value={q.studentType} onChange={(v) => setQ({ studentType: v })} placeholder="All student types" options={[{ value: 'NSCET', label: 'NSCET (College)' }, { value: 'NS-CBSE', label: 'NS-CBSE (School)' }]} />
          <FilterSelect value={q.departmentId} onChange={(v) => setQ({ departmentId: v })} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.short_name }))} />
          <FilterSelect value={q.year} onChange={(v) => setQ({ year: v })} placeholder="All years" options={[1, 2, 3, 4].map((y) => ({ value: y, label: `Year ${y}` }))} />
          <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
          <input aria-label="Room number" className="input w-28 py-1.5" placeholder="Room no." defaultValue={q.room || ''} onBlur={(e) => setQ({ room: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && setQ({ room: e.target.value.trim() })} />
          <FilterSelect value={q.hostelStatus} onChange={(v) => setQ({ hostelStatus: v })} placeholder="Any status" options={STATUS} />
          <FilterSelect value={q.gender} onChange={(v) => setQ({ gender: v })} placeholder="Any gender" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </FilterBar>
        <DataTable columns={columns} rows={data} loading={loading} error={error} onRetry={reload} sort={q} onSort={(k) => setQ(toggleSort(q, k))} onRowClick={(r) => navigate(`/students/${r.id}`)} />
        <Pagination meta={meta} onPage={(page) => setQ({ page })} />
      </div>
      <StudentForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(r) => (r.id ? navigate(`/students/${r.id}`) : reload())} />
    </div>
  );
}
