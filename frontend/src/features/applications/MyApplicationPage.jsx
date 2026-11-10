import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Send, Upload } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Select, Textarea, Checkbox } from '../../components/ui/Field';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useHostels } from '../../hooks/useLookups';
import api from '../../services/api';
import { fmtDate, label } from '../../utils/format';
import { ApplicationTimeline } from './ApplicationDetailPage';

const DOCS = [['id_proof', 'ID proof (Aadhaar / college ID)', true], ['admission_letter', 'Admission letter', true], ['address_proof', 'Address proof', false], ['photo', 'Passport photo', false], ['medical_certificate', 'Medical certificate', false]];
const MAX_MB = 2;

function ApplyForm({ onDone }) {
  const hostels = useHostels();
  const [form, setForm] = useState({ preferredHostelId: '', preferredRoomType: '', needsAc: false, reason: '' });
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);

  const pickFile = (type, file) => {
    if (!file) return setFiles((f) => { const n = { ...f }; delete n[type]; return n; });
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) { toast.error('Only PDF, JPG or PNG files'); return undefined; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`File must be under ${MAX_MB} MB`); return undefined; }
    return setFiles((f) => ({ ...f, [type]: file }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.reason.trim().length < 10) errs.reason = 'Please describe why you need accommodation (min 10 characters)';
    DOCS.filter(([, , req]) => req).forEach(([k, l]) => { if (!files[k]) errs[k] = `${l} is required`; });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== false) fd.append(k, String(v)); });
    Object.entries(files).forEach(([k, f]) => fd.append(k, f));
    setPending(true);
    try {
      const { data } = await api.post('/applications', fd);
      toast.success(`Application ${data.data.applicationCode} submitted`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Card title="Apply for hostel accommodation" subtitle="Your application goes to the warden for document verification and review.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Preferred hostel" value={form.preferredHostelId} onChange={(e) => setForm({ ...form, preferredHostelId: e.target.value })} placeholder="No preference"
            options={hostels.filter((h) => h.status === 'active').map((h) => ({ value: h.id, label: `${h.name} (${label(h.gender)})` }))} />
          <Select label="Room type" value={form.preferredRoomType} onChange={(e) => setForm({ ...form, preferredRoomType: e.target.value })} placeholder="No preference" options={['single', 'double', 'triple', 'quad'].map((t) => ({ value: t, label: label(t) }))} />
          <Checkbox className="sm:mt-6" label="Need an AC room" checked={form.needsAc} onChange={(e) => setForm({ ...form, needsAc: e.target.checked })} />
        </div>
        <Textarea label="Why do you need hostel accommodation?" required value={form.reason} error={errors.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCS.map(([k, l, req]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm ${errors[k] ? 'border-red-300 bg-red-50' : 'border-slate-300 hover:bg-slate-50'}`}>
              <Upload className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1"><span className="block font-medium text-slate-700">{l}{req && <span className="text-red-500"> *</span>}</span>
                <span className="block truncate text-xs text-slate-500">{files[k] ? files[k].name : `PDF, JPG or PNG · max ${MAX_MB} MB`}</span>
                {errors[k] && <span className="text-xs text-red-600">{errors[k]}</span>}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => pickFile(k, e.target.files[0])} />
            </label>
          ))}
        </div>
        <Button type="submit" icon={Send} loading={pending}>Submit application</Button>
      </form>
    </Card>
  );
}

export default function MyApplicationPage() {
  const list = useFetch('/applications', { limit: 10 });
  const latest = list.data?.[0];
  const detail = useFetch(latest ? `/applications/${latest.id}` : null);
  const canApply = !latest || ['rejected', 'cancelled'].includes(latest.status);
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <PageHeader title="Hostel Application" subtitle="Apply and track every step of your admission" />
      {canApply && <ApplyForm onDone={list.reload} />}
      {latest && detail.data && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title={`${latest.application_code} · ${latest.academic_year}`} className="lg:col-span-2" actions={<StatusBadge status={latest.status} />}>
            <p className="text-sm text-slate-600">Submitted on {fmtDate(latest.created_at)} · Preferred: {latest.preferred_hostel || 'any hostel'}{latest.preferred_room_type ? `, ${label(latest.preferred_room_type)} room` : ''}</p>
            {detail.data.remarks && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><b>Warden remarks:</b> {detail.data.remarks}</p>}
            <div className="mt-4"><Link to={`/applications/${latest.id}`} className="text-sm font-medium text-brand-600">View documents & details →</Link></div>
          </Card>
          <Card title="Progress"><ApplicationTimeline app={detail.data} /></Card>
        </div>
      )}
      {list.data?.length > 1 && <Card title="Earlier applications"><ul className="space-y-2 text-sm">{list.data.slice(1).map((a) => <li key={a.id} className="flex justify-between"><span>{a.application_code} · {a.academic_year}</span><StatusBadge status={a.status} /></li>)}</ul></Card>}
    </div>
  );
}
