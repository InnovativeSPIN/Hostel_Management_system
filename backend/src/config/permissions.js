// Single source of truth for roles and permissions. db/seed.js writes these into
// roles / permissions / role_permissions; the API authorizes against the database copy.
const PERMISSIONS = {
  'users.manage': ['users', 'Create, update and deactivate user accounts'],
  'settings.manage': ['settings', 'Configure operational policies'],
  'audit.view': ['audit', 'View audit logs'],
  'departments.manage': ['departments', 'Manage academic departments'],
  'dashboard.command': ['dashboard', 'Access the hostel command center'],
  'hostels.view': ['hostels', 'View hostels, rooms and beds'],
  'hostels.manage': ['hostels', 'Create and modify hostels, floors, rooms and beds'],
  'students.view': ['students', 'View student records'],
  'students.manage': ['students', 'Create and modify student records'],
  'applications.apply': ['applications', 'Apply for hostel admission'],
  'applications.review': ['applications', 'Review and decide hostel applications'],
  'allocations.manage': ['allocations', 'Allocate, transfer and vacate beds'],
  'exits.request': ['exits', 'Request hostel exit'],
  'exits.manage': ['exits', 'Inspect and clear hostel exits'],
  'attendance.mark': ['attendance', 'Mark daily attendance'],
  'attendance.view': ['attendance', 'View attendance and exceptions'],
  'attendance.resolve': ['attendance', 'Investigate and resolve attendance exceptions'],
  'leaves.apply': ['leaves', 'Apply for leave'],
  'leaves.review': ['leaves', 'Approve or reject leave requests'],
  'leaves.view': ['leaves', 'View leave requests'],
  'leaves.mark_return': ['leaves', 'Record student return from leave'],
  'complaints.create': ['complaints', 'Raise complaints'],
  'complaints.view_all': ['complaints', 'View all complaints in scope'],
  'complaints.assign': ['complaints', 'Assign complaints to staff'],
  'complaints.work': ['complaints', 'Work on assigned complaints'],
  'maintenance.view': ['maintenance', 'View maintenance requests'],
  'maintenance.manage': ['maintenance', 'Create and update maintenance requests'],
  'fees.view_all': ['fees', 'View fee ledgers for all students in scope'],
  'fees.manage': ['fees', 'Manage fee structures and assignments'],
  'payments.record': ['fees', 'Record fee payments'],
  'visitors.request': ['visitors', 'Pre-register expected visitors'],
  'visitors.view': ['visitors', 'View visitor register'],
  'visitors.manage': ['visitors', 'Check visitors in and out'],
  'security.dashboard': ['security', 'Access the security / presence dashboard'],
  'activities.view': ['activities', 'View activities'],
  'activities.join': ['activities', 'Register for activities'],
  'activities.manage': ['activities', 'Create and manage activities'],
  'announcements.view': ['announcements', 'View announcements'],
  'announcements.manage': ['announcements', 'Publish announcements'],
  'reports.view': ['reports', 'View and export reports'],
  'parent.portal': ['parents', "View linked children's hostel records (read-only)"],
  'parents.manage': ['parents', 'Create parent accounts and link them to students'],
};

const ALL = Object.keys(PERMISSIONS);

const ROLES = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full control over the platform',
    permissions: ALL.filter((p) => !['applications.apply', 'leaves.apply', 'complaints.create', 'exits.request', 'visitors.request', 'activities.join', 'parent.portal'].includes(p)),
  },
  warden: {
    label: 'Hostel Warden',
    description: 'Runs day-to-day operations for assigned hostels',
    permissions: [
      'dashboard.command', 'hostels.view', 'hostels.manage', 'students.view', 'students.manage', 'parents.manage',
      'applications.review', 'allocations.manage', 'exits.manage',
      'attendance.mark', 'attendance.view', 'attendance.resolve',
      'leaves.review', 'leaves.view', 'leaves.mark_return',
      'complaints.view_all', 'complaints.assign', 'complaints.work',
      'maintenance.view', 'maintenance.manage', 'fees.view_all', 'payments.record',
      'visitors.view', 'visitors.manage', 'security.dashboard',
      'activities.view', 'activities.manage', 'announcements.view', 'announcements.manage', 'reports.view',
    ],
  },
  staff: {
    label: 'Hostel Staff',
    description: 'Attendance, maintenance and assigned complaints',
    permissions: [
      'hostels.view', 'students.view', 'attendance.mark', 'attendance.view',
      'complaints.work', 'maintenance.view', 'maintenance.manage',
      'visitors.view', 'visitors.manage', 'leaves.mark_return',
      'activities.view', 'announcements.view',
    ],
  },
  security: {
    label: 'Security Staff',
    description: 'Gate operations: visitors and student presence',
    permissions: [
      'visitors.view', 'visitors.manage', 'security.dashboard', 'leaves.view', 'leaves.mark_return', 'announcements.view',
    ],
  },
  student: {
    label: 'Student',
    description: 'Hostel resident / applicant',
    permissions: [
      'applications.apply', 'leaves.apply', 'complaints.create', 'exits.request', 'visitors.request',
      'activities.view', 'activities.join', 'announcements.view',
    ],
  },
  parent: {
    label: 'Parent / Guardian',
    description: "Read-only view of their children's hostel stay, attendance, fees, leave and activities",
    permissions: ['parent.portal', 'announcements.view'],
  },
};

module.exports = { PERMISSIONS, ROLES };
