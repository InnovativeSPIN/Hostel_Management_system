import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, LogIn } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout';
import { Input } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { loginSchema } from '../../validations/schemas';

// Development convenience only: these accounts exist when the demo seed is loaded.
const DEMO = import.meta.env.DEV ? [
  ['Super Admin', 'admin@demo.college.edu', 'Admin@123'],
  ['Warden', 'warden.boys@demo.college.edu', 'Warden@123'],
  ['Staff', 'electrician@demo.college.edu', 'Staff@123'],
  ['Security', 'security.boys@demo.college.edu', 'Security@123'],
  ['Student', 'arun.104001@demo.college.edu', 'Student@123'],
  ['Parent', 'parent.711123104001@demo.college.edu', 'Parent@123'],
] : [];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const onSubmit = async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Use your college email to access the hostel portal.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={isSubmitting} icon={LogIn}>Sign in</Button>
      </form>
      {DEMO.length > 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts (development seed data)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO.map(([role, email, pwd]) => (
              <button key={role} type="button" className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
                onClick={() => { setValue('email', email); setValue('password', pwd); }}>{role}</button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
