import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Menu, X, LogOut, KeyRound, ChevronDown, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navFor } from '../routes/navigation';
import NotificationBell from '../features/notifications/NotificationBell';
import { Avatar } from '../components/ui/Misc';
import { PageLoader } from '../components/ui/States';

function Sidebar({ user, onNavigate }) {
  const groups = navFor(user);
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"><Building className="h-5 w-5" aria-hidden /></span>
        <span className="leading-tight">
          <span className="block text-sm font-bold text-white">Hostel ERP</span>
          <span className="block text-[11px] text-indigo-200">Operations Platform</span>
        </span>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300/70">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => (
                <li key={`${item.to}${item.label}`}>
                  <NavLink to={item.to} end={item.end || item.to === '/attendance'} onClick={onNavigate}
                    className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-white/15 text-white' : 'text-indigo-100/80 hover:bg-white/10 hover:text-white')}>
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100" aria-expanded={open} aria-haspopup="menu">
        <Avatar name={user.name} />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-slate-800">{user.name}</span>
          <span className="block text-xs text-slate-500">{user.roleLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><KeyRound className="h-4 w-4" />Profile & password</Link>
          <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-gradient-to-b from-brand-900 to-indigo-950 lg:block"><Sidebar user={user} /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative h-full w-72 max-w-[85vw] bg-gradient-to-b from-brand-900 to-indigo-950 shadow-xl">
            <button type="button" className="absolute right-3 top-4 rounded-lg p-1 text-indigo-100 hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <span className="hidden text-sm text-slate-500 sm:block">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <UserMenu user={user} logout={logout} />
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
          <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
