import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, FileText, Download, BedDouble, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, DefinitionList } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Timeline } from '../../components/ui/Misc';
import { ErrorState, PageLoader } from '../../components/ui/States';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import api, { download } from '../../services/api';
import { fmtDate, label } from '../../utils/format';

const FLOW = ['submitted', 'documents_verified', 'eligible', 'approved', 'fee_assigned', 'allocated', 'confirmed'];
const TITLES = { submitted: 'Application submitted', documents_verified: 'Documents verified', eligible: 'Eligibility confirmed', approved: 'Approved by warden', fee_assigned: 'Fee assigned', allocated: 'Room allocated', confirmed: 'Admission confirmed', rejected: 'Rejected', cancelled: 'Cancelled' };

export function ApplicationTimeline({ app }) {
  const at = (s) => app.history.find((h) => h.to_status === s);
  const terminal = ['rejected', 'cancelled'].includes(app.status) ? at(app.status) : null;
  const steps = FLOW.map((s) => ({ title: TITLES[s], done: !!at(s), time: at(s)?.created_at, by: at(s)?.changed_by, note: at(s)?.remarks }));
  if (terminal) {
    const cut = steps.findIndex((s) => !s.done);
    steps.splice(cut === -1 ? steps.length : cut, steps.length, { title: TITLES[app.status], done: true, tone: 'red', time: terminal.created_at, by: terminal.changed_by, note: terminal.remarks });
  }
  return <Timeline steps={steps} />;
}

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: app, loading, error, reload } = useFetch(`/applications/${id}`);
  const [dialog, setDialog] = useState(null);
  const [pending, setPending] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !app) return <PageLoader />;
  const reviewer = can('applications.review');
  const allowed = app.allowedTransitions;

  const act = async (fn, msg) => {
    setPending(true);
    try { await fn(); toast.success(msg); setDialog(null); reload(); } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };
  const DIALOGS = {
    verify: { title: 'Verify all documents', message: 'Confirm that the uploaded documents are genuine and legible.', confirmLabel: 'Mark verified', reasonLabel: 'Remarks (optional)', reasonRequired: false,
      run: (r) => act(() => api.patch(`/applications/${id}/verify-documents`, { remarks: r || undefined }), 'Documents verified') },
    eligible: { title: 'Confirm eligibility', confirmLabel: 'Mark eligible', reasonLabel: 'Eligibility notes', tone: 'success',
      run: (r) => act(() => api.patch(`/applications/${id}/eligibility`, { eligible: true, notes: r }), 'Marked eligible') },
    ineligible: { title: 'Mark not eligible', confirmLabel: 'Reject as ineligible', reasonLabel: 'Reason (shared with student)', tone: 'danger',
      run: (r) => act(() => api.patch(`/applications/${id}/eligibility`, { eligible: false, notes: r }), 'Application rejected') },
    approve: { title: 'Approve admission', confirmLabel: 'Approve', reasonLabel: 'Remarks', tone: 'success',
      run: (r) => act(() => api.patch(`/applications/${id}/decision`, { decision: 'approve', remarks: r }), 'Admission approved; student notified') },
    reject: { title: 'Reject application', confirmLabel: 'Reject', reasonLabel: 'Reason (shared with student)', tone: 'danger',
      run: (r) => act(() => api.patch(`/applications/${id}/decision`, { decision: 'reject', remarks: r }), 'Application rejected') },
    confirm: { title: 'Confirm admission', message: 'The student has been allocated a bed. Confirm the admission?', confirmLabel: 'Confirm admission', reasonLabel: 'Remarks (optional)', reasonRequired: false, tone: 'success',
      run: (r) => act(() => api.patch(`/applications/${id}/confirm`, { remarks: r || undefined }), 'Admission confirmed') },
    cancel: { title: 'Cancel application', confirmLabel: 'Cancel application', reasonLabel: 'Reason', tone: 'danger',
      run: (r) => act(() => api.patch(`/applications/${id}/cancel`, { reason: r }), 'Application cancelled') },
  };
  const d = dialog && DIALOGS[dialog];
  const failing = app.eligibility.filter((c) => !c.passed);

  return (
    <div className="space-y-5">
      <PageHeader title={`Application ${app.application_code}`} subtitle={`${app.student.name} · ${app.student.register_number} · ${app.academic_year}`}
        breadcrumbs={reviewer ? [{ label: 'Admissions', to: '/applications' }, { label: app.application_code }] : [{ label: 'My application', to: '/my/application' }, { label: app.application_code }]}
        actions={<StatusBadge status={app.status} className="text-sm" />} />

      {reviewer && (
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <span className="mr-2 text-sm font-medium text-slate-600">Next step:</span>
          {app.status === 'submitted' && <Button size="sm" icon={ShieldCheck} onClick={() => setDialog('verify')}>Verify documents</Button>}
          {allowed.includes('eligible') && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setDialog('eligible')}>Mark eligible</Button>}
          {app.status === 'documents_verified' && <Button size="sm" variant="secondary" icon={XCircle} onClick={() => setDialog('ineligible')}>Not eligible</Button>}
          {allowed.includes('approved') && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setDialog('approve')}>Approve</Button>}
          {app.status === 'eligible' && <Button size="sm" variant="danger" icon={XCircle} onClick={() => setDialog('reject')}>Reject</Button>}
          {['approved', 'fee_assigned'].includes(app.status) && can('allocations.manage') && <Button size="sm" icon={BedDouble} to={`/allocations?studentId=${app.student_id}`}>Allocate bed</Button>}
          {app.status === 'approved' && can('fees.manage') && <Button size="sm" variant="secondary" to="/fees?tab=structures">Assign fee</Button>}
          {app.status === 'allocated' && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setDialog('confirm')}>Confirm admission</Button>}
          {allowed.includes('cancelled') && <Button size="sm" variant="ghost" onClick={() => setDialog('cancel')}>Cancel</Button>}
          {!allowed.length && <span className="text-sm text-slate-500">Workflow complete.</span>}
        </div>
      )}
      {!reviewer && allowed.includes('cancelled') && <div><Button size="sm" variant="secondary" onClick={() => setDialog('cancel')}>Withdraw application</Button></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Applicant">
            <DefinitionList cols={3} items={[
              ['Student', reviewer ? <Link key="s" className="text-brand-600" to={`/students/${app.student.id}`}>{app.student.name}</Link> : app.student.name],
              ['Department', app.student.department], ['Year / batch', `${app.student.year_of_study} · ${app.student.batch}`], ['Gender', label(app.student.gender)],
              ['Phone', app.student.phone], ['Parent', `${app.student.parent_name || '—'} · ${app.student.parent_phone || ''}`], ['Home', [app.student.city, app.student.district].filter(Boolean).join(', ')],
              ['Distance', app.student.distance_from_home_km ? `${app.student.distance_from_home_km} km` : '—'], ['Preferred hostel', app.preferred_hostel || 'Any'],
              ['Room type', app.preferred_room_type ? label(app.preferred_room_type) : 'Any'], ['Needs AC', app.needs_ac ? 'Yes' : 'No'], ['Submitted', fmtDate(app.created_at)],
            ]} />
            {app.reason && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><b>Reason: </b>{app.reason}</p>}
            {app.remarks && <p className="mt-2 text-sm text-slate-600"><b>Warden remarks: </b>{app.remarks}</p>}
          </Card>
          <Card title="Automated eligibility checks" subtitle="Advisory only — the decision stays with the warden">
            <ul className="space-y-2">
              {app.eligibility.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  {c.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-label="Passed" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-label="Failed" />}
                  <span>{c.label}{c.detail && <span className="block text-xs text-slate-500">{c.detail}</span>}</span>
                </li>
              ))}
            </ul>
            {failing.length === 0 && <p className="mt-3 text-xs font-medium text-emerald-700">All checks passed.</p>}
          </Card>
          <Card title={`Documents (${app.documents.length})`} icon={FileText}>
            {app.documents.length === 0 ? <p className="text-sm text-slate-500">No documents uploaded.</p> : (
              <ul className="divide-y divide-slate-100">
                {app.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{label(doc.doc_type)}</span><span className="text-xs text-slate-500">{doc.original_name} · {Math.round(doc.size_bytes / 1024)} KB</span></span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={doc.verified ? 'approved' : 'pending'}>{doc.verified ? 'Verified' : 'Unverified'}</StatusBadge>
                      <Button size="xs" variant="ghost" icon={Download} onClick={() => download(`/applications/documents/${doc.id}/download`, null, doc.original_name).catch((e) => toast.error(e.message))}>Open</Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Status history"><ApplicationTimeline app={app} /></Card>
      </div>
      {d && <ConfirmDialog open onClose={() => setDialog(null)} loading={pending} onConfirm={d.run} title={d.title} message={d.message} confirmLabel={d.confirmLabel} tone={d.tone || 'primary'} reasonLabel={d.reasonLabel} reasonRequired={d.reasonRequired !== false} />}
    </div>
  );
}
