import { useState } from 'react';
import clsx from 'clsx';
import { BedDouble, Snowflake, Wrench } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { FilterSelect, Avatar } from '../../components/ui/Misc';
import { Checkbox } from '../../components/ui/Field';
import { ErrorState, PageLoader, EmptyState } from '../../components/ui/States';
import { useFetch, useListState } from '../../hooks/useFetch';
import { useHostels, hostelOptions } from '../../hooks/useLookups';
import { label } from '../../utils/format';
import RoomDrawer from './RoomDrawer';

// Status is never colour-alone: every bed shows a text label as well.
const BED = {
  available: { cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', text: 'Available' },
  occupied: { cls: 'border-red-200 bg-red-50 text-red-800', dot: 'bg-red-500', text: 'Occupied' },
  reserved: { cls: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-500', text: 'Reserved' },
  maintenance: { cls: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500', text: 'Maintenance' },
  blocked: { cls: 'border-slate-300 bg-slate-100 text-slate-600', dot: 'bg-slate-400', text: 'Blocked' },
};

export default function BedMapPage() {
  const [q, setQ] = useListState();
  const hostels = useHostels();
  const params = { hostelId: q.hostelId, floor: q.floor, roomType: q.roomType, gender: q.gender, capacity: q.capacity, availableOnly: q.availableOnly };
  const { data, loading, error, reload } = useFetch('/beds/map', params);
  const [roomId, setRoomId] = useState(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Live Bed Availability" subtitle="Hostel → Floor → Room → Bed, updated from allocations in real time" breadcrumbs={[{ label: 'Hostels', to: '/hostels' }, { label: 'Bed map' }]} />
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <FilterSelect value={q.hostelId} onChange={(v) => setQ({ hostelId: v })} placeholder="All hostels" options={hostelOptions(hostels)} />
        <FilterSelect value={q.floor} onChange={(v) => setQ({ floor: v })} placeholder="All floors" options={[0, 1, 2, 3, 4, 5].map((f) => ({ value: f, label: f === 0 ? 'Ground' : `Floor ${f}` }))} />
        <FilterSelect value={q.roomType} onChange={(v) => setQ({ roomType: v })} placeholder="All room types" options={['single', 'double', 'triple', 'quad', 'dormitory'].map((t) => ({ value: t, label: label(t) }))} />
        <FilterSelect value={q.capacity} onChange={(v) => setQ({ capacity: v })} placeholder="Any capacity" options={[1, 2, 3, 4, 6].map((c) => ({ value: c, label: `${c} bed${c > 1 ? 's' : ''}` }))} />
        <FilterSelect value={q.gender} onChange={(v) => setQ({ gender: v })} placeholder="Any gender" options={[{ value: 'male', label: 'Boys' }, { value: 'female', label: 'Girls' }, { value: 'co-ed', label: 'Co-ed' }]} />
        <Checkbox label="Only rooms with free beds" checked={q.availableOnly === 'true'} onChange={(e) => setQ({ availableOnly: e.target.checked ? 'true' : '' })} />
      </div>

      {data && (
        <div className="flex flex-wrap gap-2" aria-label="Summary">
          {Object.entries(BED).map(([k, v]) => (
            <span key={k} className={clsx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm', v.cls)}>
              <span className={clsx('h-2 w-2 rounded-full', v.dot)} aria-hidden />{v.text}<b className="tabular-nums">{data.summary[k]}</b>
            </span>
          ))}
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">Total <b className="ml-1">{data.summary.total}</b></span>
        </div>
      )}

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data?.hostels.length === 0 ? <EmptyState icon={BedDouble} title="No rooms match these filters" /> : data?.hostels.map((h) => (
        <section key={h.id} className="card overflow-hidden">
          <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">{h.code}</span>
            <h2 className="font-semibold text-slate-800">{h.name}</h2>
          </header>
          <div className="space-y-5 p-4">
            {h.floors.map((f) => (
              <div key={f.id}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{f.label}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {f.rooms.map((r) => {
                    const free = r.beds.filter((b) => b.status === 'available').length;
                    return (
                      <button type="button" key={r.id} onClick={() => setRoomId(r.id)}
                        className={clsx('rounded-xl border p-3 text-left transition hover:shadow-md', r.status !== 'active' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white')}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">Room {r.number}</span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            {r.isAc && <Snowflake className="h-3.5 w-3.5 text-sky-500" aria-label="AC" />}
                            {r.status !== 'active' && <span className="flex items-center gap-0.5 font-medium text-amber-700"><Wrench className="h-3.5 w-3.5" />{label(r.status)}</span>}
                            {label(r.type)} · {free} free
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {r.beds.map((b) => (
                            <li key={b.id} className={clsx('flex items-center gap-2 rounded-md border px-2 py-1 text-xs', BED[b.status].cls)} title={b.code}>
                              <span className={clsx('h-2 w-2 shrink-0 rounded-full', BED[b.status].dot)} aria-hidden />
                              <span className="font-medium">Bed {b.number}</span>
                              <span className="ml-auto truncate">{b.student ? <span className="inline-flex items-center gap-1"><Avatar name={b.student.name} className="h-4 w-4 text-[8px]" />{b.student.name.split(' ')[0]} · {b.student.department}</span> : BED[b.status].text}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <RoomDrawer roomId={roomId} onClose={() => setRoomId(null)} onChanged={reload} />
    </div>
  );
}
