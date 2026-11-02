import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Search, CheckCircle2, Circle } from 'lucide-react';
import { useDebounce } from '../../hooks/useFetch';
import { fmtDateTime } from '../../utils/format';

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={clsx('flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={clsx('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
          {t.label}
          {t.count !== undefined && <span className={clsx('rounded-full px-1.5 text-xs', value === t.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Debounced search box: calls onSearch after the user stops typing. */
export function SearchInput({ value = '', onSearch, placeholder = 'Search…', className }) {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text);
  useEffect(() => { if (debounced !== value) onSearch(debounced); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="input pl-9" />
    </div>
  );
}

/** Compact select for filter bars. */
export function FilterSelect({ value, onChange, options, placeholder, className, label }) {
  return (
    <select aria-label={label || placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={clsx('input w-auto min-w-[8rem] py-1.5', className)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function FilterBar({ children }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">{children}</div>;
}

/** Vertical lifecycle timeline. steps: [{ title, time, done, note, tone }] */
export function Timeline({ steps }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3">
          {i < steps.length - 1 && <span className={clsx('absolute left-[9px] top-6 h-[calc(100%-4px)] w-0.5', s.done ? 'bg-emerald-200' : 'bg-slate-200')} aria-hidden />}
          {s.done ? <CheckCircle2 className={clsx('relative h-5 w-5 shrink-0', s.tone === 'red' ? 'text-red-500' : 'text-emerald-500')} aria-hidden /> : <Circle className="relative h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
          <div className="min-w-0 pb-1">
            <p className={clsx('text-sm font-medium', s.done ? 'text-slate-800' : 'text-slate-400')}>{s.title}</p>
            {s.time && <p className="text-xs text-slate-500">{fmtDateTime(s.time)}{s.by ? ` · ${s.by}` : ''}</p>}
            {s.note && <p className="mt-0.5 text-sm text-slate-600">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Avatar({ name, className }) {
  const initials = (name || '?').split(' ').filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  return <span className={clsx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700', className)} aria-hidden>{initials}</span>;
}
