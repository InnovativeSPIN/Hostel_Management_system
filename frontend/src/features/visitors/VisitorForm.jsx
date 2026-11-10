import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { History } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import StudentPicker from '../../components/StudentPicker';
import api from '../../services/api';
import { useDebounce } from '../../hooks/useFetch';
import { visitorSchema } from '../../validations/schemas';
import { fmtDate } from '../../utils/format';

const ID_TYPES = [['aadhaar', 'Aadhaar'], ['driving_license', 'Driving licence'], ['voter_id', 'Voter ID'], ['passport', 'Passport'], ['pan', 'PAN'], ['college_id', 'College ID'], ['other', 'Other']];

/** Gate staff register (optionally check in immediately); students pre-register expected visitors. */
export default function VisitorForm({ mode = 'gate', onClose, onDone }) {
  const gate = mode === 'gate';
  const [student, setStudent] = useState(null);
  const [known, setKnown] = useState(null);
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(visitorSchema), defaultValues: { idProofType: 'aadhaar', checkInNow: gate, override: false },
  });
  const phone = useDebounce(watch('phone') || '', 400);
  const checkInNow = watch('checkInNow');
  const override = watch('override');

  useEffect(() => {
    if (phone.replace(/\D/g, '').length < 10) { setKnown(null); return; }
    api.get('/visitors/lookup', { params: { phone } }).then((r) => {
      const v = r.data.data;
      setKnown(v);
      if (v) { setValue('name', v.name); setValue('idProofType', v.id_proof_type); setValue('idProofNumber', v.id_proof_number); }
    }).catch(() => {});
  }, [phone, setValue]);

  const submit = async (v) => {
    if (gate && !student) { toast.error('Select the student being visited'); return; }
    if (v.override && !v.remarks) { setError('remarks', { message: 'Remarks are required for an override' }); return; }
    try {
      const body = { ...v, studentId: student?.id, expectedAt: v.expectedAt ? v.expectedAt.replace('T', ' ') : undefined, remarks: v.remarks || undefined, checkInNow: gate && v.checkInNow, override: gate && v.override };
      const { data } = await api.post('/visitors', body);
      toast.success(`${data.data.passCode} · ${data.data.status === 'checked_in' ? 'checked in' : 'registered as expected'}`);
      onDone();
    } catch (err) {
      toast.error(err.message);
      if (err.code === 'OUTSIDE_VISITING_HOURS') setValue('override', false);
    }
  };
  const e = (k) => errors[k]?.message;
  return (
    <Modal open onClose={onClose} size="lg" title={gate ? 'Register visitor' : 'Pre-register a visitor'} description={gate ? 'Verify the ID proof before entry. Returning visitors are filled in from their phone number.' : 'Gate security will verify ID on arrival.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="visitor-form" loading={isSubmitting}>{gate && checkInNow ? 'Check in' : 'Register'}</Button></>}>
      <form id="visitor-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        {gate && <div className="sm:col-span-2"><StudentPicker value={student} onChange={setStudent} filters={{ hostelStatus: 'resident' }} label="Visiting student" required /></div>}
        <Input label="Visitor phone" required error={e('phone')} {...register('phone')} />
        <Input label="Visitor name" required error={e('name')} {...register('name')} />
        {known && <p className="flex items-center gap-1.5 text-xs text-slate-600 sm:col-span-2"><History className="h-3.5 w-3.5" />Returning visitor · last visits: {known.lastVisits.map((l) => `${l.student_name} (${fmtDate(l.created_at)})`).join(', ') || '—'}</p>}
        <Select label="ID proof" options={ID_TYPES.map(([value, label]) => ({ value, label }))} {...register('idProofType')} />
        <Input label="ID number" required error={e('idProofNumber')} {...register('idProofNumber')} />
        <Input label="Relationship" required placeholder="Father / Mother / Guardian" error={e('relationship')} {...register('relationship')} />
        <Input label="Purpose" required error={e('purpose')} {...register('purpose')} />
        {(!gate || !checkInNow) && <Input label="Expected arrival" type="datetime-local" {...register('expectedAt')} />}
        {gate && <Checkbox className="sm:col-span-2" label="Check in now" {...register('checkInNow')} />}
        {gate && checkInNow && <Checkbox className="sm:col-span-2" label="Override visiting hours" hint="Only if entry outside visiting hours is authorised. Requires remarks; recorded in the audit log." {...register('override')} />}
        {(override || !gate) && <Textarea label={override ? 'Override remarks' : 'Notes for security'} className="sm:col-span-2" rows={2} error={e('remarks')} {...register('remarks')} />}
      </form>
    </Modal>
  );
}
