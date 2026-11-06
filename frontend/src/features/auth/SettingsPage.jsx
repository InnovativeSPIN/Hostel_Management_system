import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Play } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import api from '../../services/api';

const GROUPS = [
  ['Feature Flags & Admission Workflow', (k) => k.startsWith('feature_')],
  ['Complaint SLA', (k) => k.startsWith('sla_')],
  ['Attendance', (k) => k.startsWith('attendance_') || k.startsWith('repeated_')],
  ['Leave & fees', (k) => k.startsWith('leave_') || k.startsWith('fee_')],
  ['Visitors', (k) => k.startsWith('visitor_')],
];

export default function SettingsPage() {
  const { data, loading, error, reload } = useFetch('/settings');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (data) setValues(Object.fromEntries(data.map((s) => [s.key, s.value]))); }, [data]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  const changed = data.filter((s) => values[s.key] !== s.value);
  const save = async () => {
    setSaving(true);
    try { await api.put('/settings', { values: Object.fromEntries(changed.map((s) => [s.key, values[s.key]])) }); toast.success('Policies updated'); reload(); } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const runJobs = async () => {
    setRunning(true);
    try { const { data: r } = await api.post('/settings/run-jobs'); toast.success(`Escalated ${r.data.complaints.toWarden + r.data.complaints.toAdmin} complaint(s); ${r.data.leaves.overdue} overdue return(s); ${r.data.fees.sent} fee alert(s) sent`); } catch (err) { toast.error(err.message); } finally { setRunning(false); }
  };
  const input = (s) => {
    if (s.type === 'bool') return <select className="input w-32" value={values[s.key]} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}><option value="false">Off</option><option value="true">On</option></select>;
    return <input className="input w-32" type={s.type === 'time' ? 'time' : 'number'} min={0} value={values[s.key] ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />;
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Operational Policies" subtitle="These rules drive SLA escalation, exception detection and alerts. Every change is audited."
        actions={<><Button size="sm" variant="secondary" icon={Play} loading={running} onClick={runJobs}>Run automation now</Button><Button size="sm" icon={Save} loading={saving} disabled={!changed.length} onClick={save}>Save {changed.length ? `(${changed.length})` : ''}</Button></>} />
      <div className="grid gap-5 lg:grid-cols-2">
        {GROUPS.map(([title, match]) => (
          <Card key={title} title={title}>
            <ul className="divide-y divide-slate-100">
              {data.filter((s) => match(s.key)).map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4 py-3">
                  <div><p className="text-sm font-medium text-slate-800">{s.description}</p><p className="text-xs text-slate-400">{s.key} · default {s.default}</p></div>
                  {input(s)}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
