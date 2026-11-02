import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import api from '../services/api';
import { useDebounce } from '../hooks/useFetch';

/** Type-ahead student search. `filters` narrows results (e.g. { hostelStatus: 'resident' }). */
export default function StudentPicker({ value, onChange, filters, label = 'Student', error, required }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const term = useDebounce(text, 250);
  const ref = useRef(null);
  const filterKey = JSON.stringify(filters || {});

  useEffect(() => {
    if (!open) return;
    api.get('/students/lookup', { params: { search: term || undefined, limit: 8, ...JSON.parse(filterKey) } })
      .then((r) => setResults(r.data.data)).catch(() => setResults([]));
  }, [term, open, filterKey]);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
          <span><b>{value.name}</b> <span className="text-slate-500">· {value.register_number}{value.bed_code ? ` · ${value.bed_code}` : ''}</span></span>
          <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Clear student"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <input className={`input ${error ? 'border-red-400' : ''}`} placeholder="Search name or register number" value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} role="combobox" aria-expanded={open} aria-autocomplete="list" />
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && !value && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching students</li>}
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { onChange(s); setOpen(false); setText(''); }}>
                <b>{s.name}</b> <span className="text-slate-500">· {s.register_number} · {s.department} Y{s.year_of_study}{s.bed_code ? ` · ${s.bed_code}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
