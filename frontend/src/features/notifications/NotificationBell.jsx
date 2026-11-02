import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import api from '../../services/api';
import { timeAgo } from '../../utils/format';

const POLL_MS = 60_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();

  const loadCount = useCallback(() => api.get('/notifications/count').then((r) => setUnread(r.data.data.unread)).catch(() => {}), []);
  const loadItems = useCallback(() => api.get('/notifications', { params: { limit: 8 } }).then((r) => { setItems(r.data.data.items); setUnread(r.data.data.unread); }).catch(() => {}), []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, POLL_MS);
    const onFocus = () => loadCount();
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications:refresh', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('notifications:refresh', onFocus); };
  }, [loadCount]);

  useEffect(() => {
    if (!open) return undefined;
    loadItems();
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open, loadItems]);

  const openItem = async (n) => {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    setOpen(false);
    loadCount();
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    setItems((list) => list.map((i) => ({ ...i, is_read: 1 })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && <button type="button" onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.is_read && 'bg-brand-50/40')}>
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-brand-500')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-slate-600">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50">View all</Link>
        </div>
      )}
    </div>
  );
}
