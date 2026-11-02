import clsx from 'clsx';
import { Link } from 'react-router-dom';

export function Card({ title, subtitle, actions, children, className, bodyClassName, icon: Icon }) {
  return (
    <section className={clsx('card min-w-0', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

const TONES = {
  default: 'text-slate-900',
  red: 'text-red-600',
  orange: 'text-orange-600',
  yellow: 'text-amber-600',
  green: 'text-emerald-600',
  blue: 'text-blue-600',
};
const ICON_BG = {
  default: 'bg-slate-100 text-slate-600', red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-600',
  yellow: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-600',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'default', to, className }) {
  const body = (
    <div className={clsx('card flex h-full items-start justify-between gap-3 p-4 transition', to && 'hover:border-brand-200 hover:shadow-md', className)}>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={clsx('mt-1 text-2xl font-semibold tabular-nums', TONES[tone])}>{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
      </div>
      {Icon && <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', ICON_BG[tone])}><Icon className="h-5 w-5" aria-hidden /></div>}
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export function Meter({ value, tone, className }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = tone || (v >= 85 ? 'bg-emerald-500' : v >= 70 ? 'bg-amber-500' : 'bg-red-500');
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function DefinitionList({ items, cols = 2 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3', cols === 3 ? 'sm:grid-cols-3' : cols === 1 ? '' : 'sm:grid-cols-2')}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
