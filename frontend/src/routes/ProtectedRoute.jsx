import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageLoader, EmptyState } from '../components/ui/States';
import Button from '../components/ui/Button';

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Renders children only when the user has ANY of `perms` (or one of `roles`). */
export function Guard({ perms, roles, children }) {
  const { can, is } = useAuth();
  const allowed = (!perms || can(...perms)) && (!roles || is(...roles));
  if (!allowed) {
    return (
      <EmptyState icon={ShieldAlert} title="Access restricted" message="Your role does not have permission to open this page."
        action={<Button to="/" variant="secondary">Go to dashboard</Button>} />
    );
  }
  return children;
}
