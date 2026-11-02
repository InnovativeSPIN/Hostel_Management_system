import { lazy } from 'react';
import { useAuth } from '../context/AuthContext';

const CommandCenter = lazy(() => import('../features/dashboard/CommandCenterPage'));
const StudentDashboard = lazy(() => import('../features/dashboard/StudentDashboard'));
const SecurityDashboard = lazy(() => import('../features/visitors/SecurityDashboard'));
const StaffDashboard = lazy(() => import('../features/dashboard/StaffDashboard'));
const ParentDashboard = lazy(() => import('../features/parent/ParentDashboard'));

// The landing page depends on the role: the command center surfaces problems first.
export default function HomePage() {
  const { user, can } = useAuth();
  if (user.role === 'student') return <StudentDashboard />;
  if (user.role === 'parent') return <ParentDashboard />;
  if (can('dashboard.command')) return <CommandCenter />;
  if (user.role === 'security') return <SecurityDashboard />;
  return <StaffDashboard />;
}
