import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from './States';

/**
 * columns: [{ key, header, render?(row), sortKey?, className?, hideOnMobile? }]
 * sort: { sort, order } and onSort(sortKey) for server-side sorting.
 */
export default function DataTable({ columns, rows, loading, error, onRetry, empty, onRowClick, sort, onSort, rowKey = 'id', rowClassName, dense }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} className="m-4" />;
  const showSkeleton = loading && !rows?.length;
  return (
    <div className="relative overflow-x-auto">
      {loading && rows?.length > 0 && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand-500" aria-hidden />}
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/80">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={clsx('table-head', c.hideOnMobile && 'hidden md:table-cell', c.headClassName)}>
                {c.sortKey && onSort ? (
                  <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => onSort(c.sortKey)}>
                    {c.header}
                    {sort?.sort === c.sortKey ? (sort.order === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {showSkeleton && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`s${i}`}>{columns.map((c) => <td key={c.key} className={clsx('table-cell', c.hideOnMobile && 'hidden md:table-cell')}><Skeleton className="h-4 w-full max-w-[160px]" /></td>)}</tr>
          ))}
          {!showSkeleton && rows?.map((row, i) => (
            <tr key={row[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(onRowClick && 'cursor-pointer hover:bg-slate-50', rowClassName?.(row))}>
              {columns.map((c) => (
                <td key={c.key} className={clsx('table-cell', dense && 'py-2', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !rows?.length && (empty || <EmptyState title="No records found" message="Try changing the filters or search." />)}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total === 0) return null;
  const { page, limit, total, pages } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>Showing <b>{from}</b>–<b>{to}</b> of <b>{total}</b></span>
      <div className="flex items-center gap-1">
        <button type="button" className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2">Page {page} of {pages}</span>
        <button type="button" className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// Helper so pages can toggle server-side sort with one call.
export const toggleSort = (query, key) => ({ sort: key, order: query.sort === key && query.order === 'asc' ? 'desc' : 'asc' });
