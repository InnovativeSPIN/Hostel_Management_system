import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout';
import { Input } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import api from '../../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ pending: false, done: false, error: null, devLink: null });

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setState((s) => ({ ...s, error: 'Enter a valid email' })); return; }
    setState({ pending: true, done: false, error: null, devLink: null });
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setState({ pending: false, done: true, error: null, devLink: data.data.devResetLink || null });
    } catch (err) {
      setState({ pending: false, done: false, error: err.message, devLink: null });
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll send a reset link to your registered email.">
      {state.done ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <MailCheck className="h-5 w-5 shrink-0" />If the email is registered, a reset link has been sent. The link is valid for 30 minutes.
          </div>
          {state.devLink && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Development mode (no mail server): <a className="break-all font-medium underline" href={state.devLink}>open reset link</a>
            </div>
          )}
          <Link to="/login" className="text-sm font-medium text-brand-600">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={state.error} autoComplete="email" />
          <Button type="submit" className="w-full" loading={state.pending}>Send reset link</Button>
          <p className="text-center text-sm"><Link to="/login" className="font-medium text-brand-600">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
