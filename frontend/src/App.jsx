import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth, Guard } from './routes/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import { PageLoader } from './components/ui/States';

const p = (loader) => lazy(loader);
const Login = p(() => import('./features/auth/LoginPage'));
const ForgotPassword = p(() => import('./features/auth/ForgotPasswordPage'));
const ResetPassword = p(() => import('./features/auth/ResetPasswordPage'));
const Home = p(() => import('./pages/HomePage'));
const ActionCenter = p(() => import('./features/dashboard/ActionCenterPage'));
const SecurityDesk = p(() => import('./features/visitors/SecurityDashboard'));
const Students = p(() => import('./features/students/StudentsPage'));
const StudentDetail = p(() => import('./features/students/StudentDetailPage'));
const Departments = p(() => import('./features/students/DepartmentsPage'));
const Applications = p(() => import('./features/applications/ApplicationsPage'));
const ApplicationDetail = p(() => import('./features/applications/ApplicationDetailPage'));
const MyApplication = p(() => import('./features/applications/MyApplicationPage'));
const Allocations = p(() => import('./features/allocations/AllocationsPage'));
const Exits = p(() => import('./features/allocations/ExitsPage'));
const Hostels = p(() => import('./features/hostels/HostelsPage'));
const HostelDetail = p(() => import('./features/hostels/HostelDetailPage'));
const BedMap = p(() => import('./features/rooms/BedMapPage'));
const GuestRooms = p(() => import('./features/guest/GuestRoomsPage'));
const Attendance = p(() => import('./features/attendance/AttendancePage'));
const Exceptions = p(() => import('./features/attendance/ExceptionCenterPage'));
const MyAttendance = p(() => import('./features/attendance/MyAttendancePage'));
const Leaves = p(() => import('./features/leaves/LeavesPage'));
const MyLeaves = p(() => import('./features/leaves/MyLeavesPage'));
const Complaints = p(() => import('./features/complaints/ComplaintsPage'));
const ComplaintDetail = p(() => import('./features/complaints/ComplaintDetailPage'));
const Maintenance = p(() => import('./features/complaints/MaintenancePage'));
const Fees = p(() => import('./features/fees/FeesPage'));
const MyFees = p(() => import('./features/fees/MyFeesPage'));
const Visitors = p(() => import('./features/visitors/VisitorsPage'));
const MyVisitors = p(() => import('./features/visitors/MyVisitorsPage'));
const Activities = p(() => import('./features/activities/ActivitiesPage'));
const Announcements = p(() => import('./features/activities/AnnouncementsPage'));
const Notifications = p(() => import('./features/notifications/NotificationsPage'));
const Reports = p(() => import('./features/reports/ReportsPage'));
const Audit = p(() => import('./features/reports/AuditPage'));
const Users = p(() => import('./features/auth/UsersPage'));
const Settings = p(() => import('./features/auth/SettingsPage'));
const Profile = p(() => import('./features/auth/ProfilePage'));
const NotFound = p(() => import('./pages/NotFoundPage'));
const ParentChild = p(() => import('./features/parent/ParentChildPage'));

const g = (el, perms, roles) => <Guard perms={perms} roles={roles}>{el}</Guard>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 4000, style: { fontSize: '14px' } }} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Home />} />
              <Route path="action-center" element={g(<ActionCenter />, ['dashboard.command'])} />
              <Route path="security" element={g(<SecurityDesk />, ['security.dashboard'])} />
              <Route path="students" element={g(<Students />, ['students.view'])} />
              <Route path="students/:id" element={g(<StudentDetail />, ['students.view'])} />
              <Route path="departments" element={g(<Departments />, ['departments.manage', 'students.manage'])} />
              <Route path="applications" element={g(<Applications />, ['applications.review'])} />
              <Route path="applications/:id" element={g(<ApplicationDetail />, ['applications.review', 'applications.apply'])} />
              <Route path="allocations" element={g(<Allocations />, ['allocations.manage'])} />
              <Route path="exits" element={g(<Exits />, ['exits.manage'])} />
              <Route path="hostels" element={g(<Hostels />, ['hostels.view'])} />
              <Route path="hostels/:id" element={g(<HostelDetail />, ['hostels.view'])} />
              <Route path="bed-map" element={g(<BedMap />, ['hostels.view'])} />
              <Route path="guest-rooms" element={g(<GuestRooms />, ['hostels.view'])} />
              <Route path="attendance" element={g(<Attendance />, ['attendance.mark'])} />
              <Route path="attendance/exceptions" element={g(<Exceptions />, ['attendance.view'])} />
              <Route path="leaves" element={g(<Leaves />, ['leaves.review', 'leaves.view', 'leaves.mark_return'])} />
              <Route path="complaints" element={<Complaints />} />
              <Route path="complaints/:id" element={<ComplaintDetail />} />
              <Route path="maintenance" element={g(<Maintenance />, ['maintenance.view'])} />
              <Route path="fees" element={g(<Fees />, ['fees.view_all'])} />
              <Route path="visitors" element={g(<Visitors />, ['visitors.view'])} />
              <Route path="activities" element={g(<Activities />, ['activities.view'])} />
              <Route path="announcements" element={g(<Announcements />, ['announcements.view'])} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="reports" element={g(<Reports />, ['reports.view'])} />
              <Route path="audit" element={g(<Audit />, ['audit.view'])} />
              <Route path="users" element={g(<Users />, ['users.manage'])} />
              <Route path="settings" element={g(<Settings />, ['settings.manage'])} />
              <Route path="profile" element={<Profile />} />
              <Route path="my/hostel" element={<Navigate to="/" replace />} />
              <Route path="my/attendance" element={g(<MyAttendance />, null, ['student'])} />
              <Route path="my/fees" element={g(<MyFees />, null, ['student'])} />
              <Route path="my/leaves" element={g(<MyLeaves />, null, ['student'])} />
              <Route path="my/visitors" element={g(<MyVisitors />, null, ['student'])} />
              <Route path="my/application" element={g(<MyApplication />, null, ['student'])} />
              <Route path="children/:id" element={g(<ParentChild />, ['parent.portal'])} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
