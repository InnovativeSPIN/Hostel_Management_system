import { forwardRef, useId } from 'react';
import clsx from 'clsx';

function Wrapper({ id, label, error, hint, required, className, children }) {
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="label">{label}{required && <span className="text-red-500"> *</span>}</label>}
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-600">{error}</p>
        : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(({ label, error, hint, required, className, inputClassName, ...props }, ref) => {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <input id={id} ref={ref} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        className={clsx('input', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', inputClassName)} {...props} />
    </Wrapper>
  );
});

export const Select = forwardRef(({ label, error, hint, required, className, options = [], placeholder, children, ...props }, ref) => {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <select id={id} ref={ref} aria-invalid={!!error} className={clsx('input pr-8', error && 'border-red-400')} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
        {children}
      </select>
    </Wrapper>
  );
});

export const Textarea = forwardRef(({ label, error, hint, required, className, rows = 3, ...props }, ref) => {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea id={id} ref={ref} rows={rows} aria-invalid={!!error} className={clsx('input', error && 'border-red-400')} {...props} />
    </Wrapper>
  );
});

export const Checkbox = forwardRef(({ label, hint, className, ...props }, ref) => (
  <label className={clsx('flex cursor-pointer items-start gap-2 text-sm text-slate-700', className)}>
    <input type="checkbox" ref={ref} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...props} />
    <span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
  </label>
));
