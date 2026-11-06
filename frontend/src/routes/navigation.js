import {
  LayoutDashboard, Siren, ShieldCheck, Wrench, Users, ClipboardCheck, BedDouble, ArrowRightLeft, DoorOpen, GraduationCap, Building2,
  CalendarCheck, AlertTriangle, CalendarDays, MessageSquareWarning, Hammer, UserCheck, IndianRupee, Trophy, Megaphone, FileBarChart,
  ScrollText, UserCog, Settings, House, User, ClipboardList, Bell, Hotel,
} from 'lucide-react';

// Each item is shown when the user holds ANY of `perms` (and, for `roles`, has one of those roles).
export const STAFF_NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Command Center', icon: LayoutDashboard, perms: ['dashboard.command'], end: true },
      { to: '/action-center', label: 'Action Center', icon: Siren, perms: ['dashboard.command'] },
      { to: '/', label: 'My Work', icon: Wrench, roles: ['staff'], end: true },
      { to: '/security', label: 'Security Desk', icon: ShieldCheck, perms: ['security.dashboard'] },
    ],
  },
  {
    group: 'Residents',
    items: [
      { to: '/students', label: 'Students', icon: Users, perms: ['students.view'] },
      { to: '/applications', label: 'Admissions', icon: ClipboardCheck, perms: ['applications.review'] },
      { to: '/allocations', label: 'Allocations', icon: ArrowRightLeft, perms: ['allocations.manage'] },
      { to: '/exits', label: 'Hostel Exits', icon: DoorOpen, perms: ['exits.manage'] },
      { to: '/departments', label: 'Departments', icon: GraduationCap, perms: ['departments.manage', 'students.manage'] },
    ],
  },
  {
    group: 'Hostel',
    items: [
      { to: '/hostels', label: 'Hostels & Rooms', icon: Building2, perms: ['hostels.view'] },
      { to: '/bed-map', label: 'Live Bed Map', icon: BedDouble, perms: ['hostels.view'] },
      { to: '/guest-rooms', label: 'Guest Rooms', icon: Hotel, perms: ['hostels.view'] },
    ],
  },
  {
    group: 'Daily Operations',
    items: [
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck, perms: ['attendance.mark'] },
      { to: '/attendance/exceptions', label: 'Exception Center', icon: AlertTriangle, perms: ['attendance.view'] },
      { to: '/leaves', label: 'Leave', icon: CalendarDays, perms: ['leaves.review', 'leaves.view', 'leaves.mark_return'] },
      { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning, perms: ['complaints.view_all', 'complaints.work'] },
      { to: '/maintenance', label: 'Maintenance', icon: Hammer, perms: ['maintenance.view'] },
      { to: '/visitors', label: 'Visitors', icon: UserCheck, perms: ['visitors.view'] },
    ],
  },
  {
    group: 'Finance',
    items: [{ to: '/fees', label: 'Fees & Payments', icon: IndianRupee, perms: ['fees.view_all'] }],
  },
  {
    group: 'Community',
    items: [
      { to: '/activities', label: 'Activities', icon: Trophy, perms: ['activities.view'] },
      { to: '/announcements', label: 'Announcements', icon: Megaphone, perms: ['announcements.view'] },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/reports', label: 'Reports', icon: FileBarChart, perms: ['reports.view'] },
      { to: '/audit', label: 'Audit Logs', icon: ScrollText, perms: ['audit.view'] },
      { to: '/users', label: 'Users & Roles', icon: UserCog, perms: ['users.manage'] },
      { to: '/settings', label: 'Policies', icon: Settings, perms: ['settings.manage'] },
    ],
  },
];

export const STUDENT_NAV = [
  {
    group: 'My Hostel',
    items: [
      { to: '/', label: 'Dashboard', icon: House, end: true },
      { to: '/my/attendance', label: 'My Attendance', icon: CalendarCheck },
      { to: '/my/fees', label: 'My Fees', icon: IndianRupee },
      { to: '/complaints', label: 'My Complaints', icon: MessageSquareWarning },
      { to: '/my/leaves', label: 'My Leave', icon: CalendarDays },
      { to: '/my/visitors', label: 'My Visitors', icon: UserCheck },
      { to: '/my/application', label: 'Hostel Application', icon: ClipboardList },
    ],
  },
  {
    group: 'Community',
    items: [
      { to: '/activities', label: 'Activities', icon: Trophy },
      { to: '/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/profile', label: 'My Profile', icon: User },
    ],
  },
];

export const PARENT_NAV = [
  {
    group: 'My Ward',
    items: [
      { to: '/', label: 'My Children', icon: House, end: true },
      { to: '/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/profile', label: 'My Profile', icon: User },
    ],
  },
];

export function navFor(user) {
  if (!user) return [];
  if (user.role === 'student') return STUDENT_NAV;
  if (user.role === 'parent') return PARENT_NAV;
  const has = (perms) => !perms || perms.some((p) => user.permissions.includes(p));
  return STAFF_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => has(i.perms) && (!i.roles || i.roles.includes(user.role))) }))
    .filter((g) => g.items.length);
}
