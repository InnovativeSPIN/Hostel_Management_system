import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Menu, X, LogOut, KeyRound, ChevronDown, Building, Search, PanelLeftOpen, PanelLeftClose
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navFor } from '../routes/navigation';
import NotificationBell from '../features/notifications/NotificationBell';
import { Avatar } from '../components/ui/Misc';
import { PageLoader } from '../components/ui/States';

const ROLE_BADGES = {
  super_admin: { label: 'Admin', bg: 'bg-purple-500/20 text-purple-200 border-purple-500/30' },
  hostel_warden: { label: 'Warden', bg: 'bg-blue-500/20 text-blue-200 border-blue-500/30' },
  hostel_staff: { label: 'Staff', bg: 'bg-amber-500/20 text-amber-200 border-amber-500/30' },
  security: { label: 'Security', bg: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' },
  student: { label: 'Student', bg: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30' },
  parent: { label: 'Parent', bg: 'bg-teal-500/20 text-teal-200 border-teal-500/30' },
};

function Sidebar({ user, onNavigate, isMobile, collapsed, onToggleCollapse }) {
  const groups = navFor(user);
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [closedGroups, setClosedGroups] = useState({});

  // Auto-expand group that contains active link
  useEffect(() => {
    groups.forEach((g) => {
      const hasActive = g.items.some((i) =>
        i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)
      );
      if (hasActive) {
        setClosedGroups((prev) => ({ ...prev, [g.group]: false }));
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupName) => {
    setClosedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  const roleBadge = ROLE_BADGES[user?.role] || { label: user?.roleLabel || 'User', bg: 'bg-white/10 text-white border-white/20' };

  return (
    <nav className="flex h-full flex-col bg-gradient-to-b from-[#2D2590] via-[#241E7A] to-[#1B165E] text-white border-r border-[#1E1866] select-none" aria-label="Main Navigation">
      {/* Brand Header */}
      <div className={clsx('flex items-center border-b border-white/10 px-3 py-3.5', collapsed && !isMobile ? 'justify-center' : 'justify-between gap-3')}>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 group" title="Hostel ERP - Operations Platform">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white to-indigo-100 text-[#2D2590] shadow-md shadow-black/25 ring-1 ring-white/25 transition-transform group-hover:scale-105">
            <Building className="h-5 w-5 text-[#2D2590]" aria-hidden />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 border border-[#1B165E]" />
            </span>
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white group-hover:text-indigo-200 transition-colors">Hostel ERP</span>
                <span className="rounded bg-white/15 px-1 py-0.2 text-[9px] font-semibold text-white uppercase tracking-wider border border-white/20">Ops</span>
              </div>
              <span className="block text-[11px] font-medium text-indigo-200/70 truncate">Operations Platform</span>
            </div>
          )}
        </Link>
        {isMobile && onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-lg p-1.5 text-indigo-200/80 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : onToggleCollapse && !collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center rounded-lg p-1.5 text-indigo-200/80 hover:bg-white/10 hover:text-white transition-colors border border-transparent hover:border-white/15"
            aria-label="Collapse sidebar to icons (Ctrl+B)"
            title="Collapse sidebar to icons (Ctrl+B)"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/* Quick Search inside Sidebar (only when expanded or mobile) */}
      {(!collapsed || isMobile) && (
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-200/60" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter menu..."
              className="w-full rounded-lg border border-white/15 bg-black/25 py-1.5 pl-8 pr-7 text-xs text-white placeholder-indigo-200/50 transition-colors focus:border-indigo-300 focus:bg-black/35 focus:outline-none focus:ring-1 focus:ring-indigo-300/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-indigo-200/60 hover:bg-white/10 hover:text-white"
                aria-label="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Groups List */}
      {collapsed && !isMobile ? (
        /* Collapsed Icon Rail: Prominent, Centered, High-Contrast Icons with Tooltips */
        <div className="flex-1 space-y-3 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((g, gIdx) => (
            <div key={g.group} className="space-y-1.5">
              {gIdx > 0 && <div className="mx-2 my-1 border-t border-white/10" />}
              {g.items.map((item) => (
                <NavLink
                  key={`${item.to}${item.label}`}
                  to={item.to}
                  end={item.end || item.to === '/attendance'}
                  onClick={onNavigate}
                  title={item.label}
                  className={({ isActive }) =>
                    clsx(
                      'group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150 mx-auto',
                      isActive
                        ? 'bg-white text-[#2D2590] shadow-md shadow-black/25 ring-2 ring-white/30 font-bold scale-105'
                        : 'text-indigo-100 hover:bg-white/15 hover:text-white'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-md bg-white shadow-sm shadow-white/50"
                          aria-hidden
                        />
                      )}
                      <item.icon
                        className={clsx(
                          'h-5 w-5 shrink-0 transition-transform group-hover:scale-110',
                          isActive ? 'text-[#2D2590]' : 'text-white/90 group-hover:text-white'
                        )}
                        aria-hidden
                      />
                      {/* Floating tooltip */}
                      <span className="pointer-events-none fixed left-[80px] z-50 hidden rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-xl ring-1 ring-white/10 group-hover:block whitespace-nowrap">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* Expanded Full Navigation */
        <div className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-indigo-200/60">
              No matching items found for "{search}"
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isGroupClosed = closedGroups[g.group] && !search;
              return (
                <div key={g.group} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.group)}
                    className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-200/70 hover:text-white transition-colors group"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{g.group}</span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] font-medium text-indigo-100 group-hover:bg-white/15">
                        {g.items.length}
                      </span>
                    </span>
                    {!search && (
                      <ChevronDown
                        className={clsx('h-3.5 w-3.5 text-indigo-200/60 transition-transform duration-200', isGroupClosed && '-rotate-90')}
                        aria-hidden
                      />
                    )}
                  </button>

                  {!isGroupClosed && (
                    <ul className="space-y-0.5">
                      {g.items.map((item) => (
                        <li key={`${item.to}${item.label}`}>
                          <NavLink
                            to={item.to}
                            end={item.end || item.to === '/attendance'}
                            onClick={onNavigate}
                            className={({ isActive }) =>
                              clsx(
                                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                                isActive
                                  ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20 backdrop-blur-sm font-semibold'
                                  : 'text-indigo-100 hover:bg-white/10 hover:text-white'
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                {isActive && (
                                  <span
                                    className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-md bg-white shadow-sm shadow-white/50"
                                    aria-hidden
                                  />
                                )}
                                <item.icon
                                  className={clsx(
                                    'h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110',
                                    isActive ? 'text-white' : 'text-indigo-100 group-hover:text-white'
                                  )}
                                  aria-hidden
                                />
                                <span className="truncate text-[13px]">{item.label}</span>
                              </>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Sidebar Footer: User snippet */}
      <div className="border-t border-white/10 p-3 bg-[#15114A]/60">
        {collapsed && !isMobile ? (
          <div className="flex items-center justify-center">
            <div className="relative group cursor-pointer" title={`${user?.name} (${roleBadge.label})`}>
              <Avatar name={user?.name} className="h-9 w-9 ring-1 ring-white/25 bg-white text-[#2D2590] font-bold" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-[#1B165E]" />
              <span className="pointer-events-none fixed left-[80px] bottom-3 z-50 ml-1 hidden rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-xl ring-1 ring-white/10 group-hover:block whitespace-nowrap">
                {user?.name} · {roleBadge.label}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar name={user?.name} className="h-9 w-9 ring-1 ring-white/25 bg-white text-[#2D2590] font-bold" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-[#1B165E]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white leading-snug">{user?.name}</p>
              <span className={clsx('inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-medium border leading-tight', roleBadge.bg)}>
                {roleBadge.label}
              </span>
            </div>
          </div>
        )}
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-slate-100"
        aria-expanded={open}
        aria-haspopup="menu"
      >
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
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <KeyRound className="h-4 w-4" />Profile & password
          </Link>
          <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('hostel_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hostel_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar (like ChatGPT / VS Code)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const location = useLocation();
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Desktop Sidebar: Smoothly transitions between Expanded (w-64) and Collapsed Icon Rail (w-[72px]) */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden transition-all duration-300 ease-in-out lg:block shadow-xl shadow-black/15 select-none',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        <Sidebar
          user={user}
          collapsed={collapsed}
          onNavigate={() => {}}
          onToggleCollapse={handleToggleCollapse}
          isMobile={false}
        />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative h-full w-72 max-w-[85vw] shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar
              user={user}
              onNavigate={() => setMobileOpen(false)}
              collapsed={false}
              isMobile={true}
            />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={clsx(
          'transition-all duration-300 ease-in-out min-h-screen flex flex-col',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 shadow-xs">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop ChatGPT-style Sidebar Toggle Button */}
            <button
              type="button"
              className={clsx(
                'hidden lg:inline-flex items-center justify-center rounded-lg p-2 transition-all',
                collapsed
                  ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 ring-1 ring-indigo-200 shadow-xs'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              )}
              onClick={handleToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            <span className="hidden text-sm text-slate-500 sm:block pl-2 border-l border-slate-200/80">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
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
