import clsx from 'clsx';
import { Inbox, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Button from './Button';

export function Skeleton({ className }) {
  return <div className={clsx('skeleton rounded-md', className)} aria-hidden />;
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-4 py-10 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Icon className="h-6 w-6 text-slate-400" aria-hidden /></div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={clsx('flex flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/50 px-4 py-8 text-center', className)}>
      <AlertCircle className="mb-2 h-7 w-7 text-red-500" aria-hidden />
      <p className="text-sm font-medium text-red-800">{error?.status === 403 ? 'You do not have access to this information' : 'Could not load data'}</p>
      <p className="mt-1 text-sm text-red-700/80">{error?.message}</p>
      {onRetry && error?.status !== 403 && <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-600', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return <div className="flex h-64 items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}
