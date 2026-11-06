import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Camera } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import { Tabs, Avatar } from '../../components/ui/Misc';
import api from '../../services/api';
import { useDepartments, deptOptions } from '../../hooks/useLookups';
import { studentSchema, clean } from '../../validations/schemas';

const CBSE_CLASSES = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'].map((c) => ({ value: c, label: c }));

const toForm = (d) => {
  const cbse = d?.cbseDetails;
  return d ? {
    studentType: d.student_type || 'NSCET',
    registerNumber: d.register_number, rollNumber: d.roll_number || '', name: d.name, email: d.email, phone: d.phone, gender: d.gender,
    dateOfBirth: d.date_of_birth ? d.date_of_birth.slice(0, 10) : (cbse?.date_of_birth ? cbse.date_of_birth.slice(0, 10) : ''),
    departmentId: d.department_id || '', yearOfStudy: d.year_of_study || 1, semester: d.semester || 1, section: d.section || cbse?.section || '',
    batch: d.batch || '', admissionDate: d.admission_date ? d.admission_date.slice(0, 10) : '', admissionQuota: d.admission_quota || 'government', facultyAdvisor: d.faculty_advisor || '',
    cgpa: d.cgpa ?? '', scholarship: d.scholarship || '', firstGraduate: !!d.first_graduate, distanceFromHomeKm: d.distance_from_home_km ?? '',
    parentName: d.parent_name || cbse?.parent_name || '', parentRelation: d.parent_relation || cbse?.parent_relation || '', parentPhone: d.parent_phone || cbse?.parent_phone || '', parentEmail: d.parent_email || cbse?.parent_email || '',
    parentOccupation: d.parent_occupation || cbse?.parent_occupation || '', emergencyContactName: d.emergency_contact_name || cbse?.emergency_contact_name || '', emergencyContactPhone: d.emergency_contact_phone || cbse?.emergency_contact_phone || '',
    addressLine: d.address_line || '', city: d.city || '', district: d.district || '', state: d.state || '', pincode: d.pincode || '',
    bloodGroup: d.blood_group || cbse?.blood_group || '', medicalNotes: d.medical_notes || '',
    
    // CBSE specific
    cbseClassLevel: d.cbse_class_level || cbse?.class_level || '',
    cbseAdmissionNumber: d.cbse_admission_number || cbse?.admission_number || '',
    localGuardianName: cbse?.local_guardian_name || '',
    localGuardianRelation: cbse?.local_guardian_relation || '',
    localGuardianPhone: cbse?.local_guardian_phone || '',
    localGuardianAddress: cbse?.local_guardian_address || '',
    medicalConditions: cbse?.medical_conditions || '',
    allergies: cbse?.allergies || '',
  } : {
    studentType: 'NSCET',
    gender: 'male',
    yearOfStudy: 1,
    semester: 1,
    admissionQuota: 'government',
    state: 'Tamil Nadu',
    firstGraduate: false,
    batch: `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`,
  };
};

const TAB_FIELDS = {
  academic: ['registerNumber', 'name', 'email', 'phone', 'departmentId', 'yearOfStudy', 'semester', 'batch'],
  school: ['registerNumber', 'name', 'email', 'phone', 'cbseClassLevel'],
  guardian: ['parentPhone', 'parentEmail', 'emergencyContactPhone', 'localGuardianPhone'],
  address: ['pincode'],
  medical: ['pincode'],
};

export default function StudentForm({ open, onClose, student, onSaved }) {
  const depts = useDepartments();
  const [tab, setTab] = useState('academic');
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(studentSchema),
    defaultValues: toForm(student),
  });

  const studentName = watch('name');
  const studentType = watch('studentType') || 'NSCET';

  useEffect(() => {
    if (open) {
      reset(toForm(student));
      setTab(student?.student_type === 'NS-CBSE' ? 'school' : 'academic');
      setPhotoFile(null);
      setPreviewUrl(student?.photo_url || null);
    }
  }, [open, student, reset]);

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Only JPG and PNG images are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const onSubmit = async (values) => {
    try {
      const isCbse = values.studentType === 'NS-CBSE';
      const cbseDetails = isCbse ? {
        classLevel: values.cbseClassLevel,
        section: values.section || null,
        admissionNumber: values.cbseAdmissionNumber || null,
        dateOfBirth: values.dateOfBirth || null,
        bloodGroup: values.bloodGroup || null,
        parentName: values.parentName || null,
        parentRelation: values.parentRelation || null,
        parentPhone: values.parentPhone || null,
        parentEmail: values.parentEmail || null,
        parentOccupation: values.parentOccupation || null,
        localGuardianName: values.localGuardianName || null,
        localGuardianRelation: values.localGuardianRelation || null,
        localGuardianPhone: values.localGuardianPhone || null,
        localGuardianAddress: values.localGuardianAddress || null,
        emergencyContactName: values.emergencyContactName || null,
        emergencyContactPhone: values.emergencyContactPhone || null,
        medicalConditions: values.medicalConditions || null,
        allergies: values.allergies || null,
      } : null;

      const body = clean({
        ...values,
        cbseDetails,
        distanceFromHomeKm: values.distanceFromHomeKm === '' ? undefined : values.distanceFromHomeKm,
      });

      const res = student ? await api.put(`/students/${student.id}`, body) : await api.post('/students', body);
      const savedStudent = res.data.data;
      const targetId = student ? student.id : savedStudent.id;

      if (photoFile && targetId) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        await api.post(`/students/${targetId}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      const temp = savedStudent.temporaryPassword;
      toast.success(student ? 'Student updated' : `Student created${temp ? `. Temporary password: ${temp}` : ''}`, { duration: temp ? 10000 : 4000 });
      onSaved?.(savedStudent);
      onClose();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onInvalid = (errs) => {
    const first = Object.keys(errs)[0];
    const owner = Object.entries(TAB_FIELDS).find(([, f]) => f.includes(first))?.[0];
    if (owner) setTab(owner);
    toast.error('Please fix the highlighted fields');
  };

  const e = (k) => errors[k]?.message;

  const tabs = studentType === 'NS-CBSE'
    ? [{ value: 'school', label: 'School Details' }, { value: 'guardian', label: 'Parent & Guardian' }, { value: 'medical', label: 'Medical & Address' }]
    : [{ value: 'academic', label: 'Academic' }, { value: 'guardian', label: 'Guardian & emergency' }, { value: 'address', label: 'Address & medical' }];

  return (
    <Modal open={open} onClose={onClose} size="xl" title={student ? `Edit ${student.name}` : 'Add student'}
      description="Administrative record. Students can only edit their contact details themselves."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="student-form" loading={isSubmitting}>{student ? 'Save changes' : 'Create student'}</Button></>}>
      
      {/* Student Type Selector */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Institution Category</span>
          <p className="text-xs font-medium text-slate-800">
            {studentType === 'NSCET' ? 'NSCET (Engineering College)' : 'Nadar Saraswathi CBSE School (Classes 6–12)'}
          </p>
        </div>
        <div className="flex gap-1.5 p-1 bg-white rounded-lg border border-slate-200 shadow-xs">
          <button
            type="button"
            onClick={() => {
              setValue('studentType', 'NSCET');
              if (tab === 'school') setTab('academic');
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${studentType === 'NSCET' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            NSCET College
          </button>
          <button
            type="button"
            onClick={() => {
              setValue('studentType', 'NS-CBSE');
              if (tab === 'academic') setTab('school');
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${studentType === 'NS-CBSE' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            NS-CBSE School
          </button>
        </div>
      </div>

      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={tabs} />

      <form id="student-form" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
        {/* Photo upload section (shown across both modes) */}
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <Avatar name={studentName || 'Student'} src={previewUrl} className="h-16 w-16 text-lg border-2 border-white shadow-sm" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Student photograph</p>
            <p className="text-xs text-slate-500">JPG or PNG, max 2MB. Used on attendance, bed allocation and reports.</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="xs" variant="secondary" icon={Camera} onClick={() => fileInputRef.current?.click()}>
                {previewUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              {previewUrl && (
                <Button type="button" size="xs" variant="ghost" onClick={() => { setPhotoFile(null); setPreviewUrl(null); }}>
                  Remove
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={onPhotoChange} />
            </div>
          </div>
        </div>

        {/* ===================== NSCET Academic Tab ===================== */}
        {studentType === 'NSCET' && (
          <div className={tab === 'academic' ? 'space-y-4' : 'hidden'}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Register number" required error={e('registerNumber')} {...register('registerNumber')} />
              <Input label="Roll number" error={e('rollNumber')} {...register('rollNumber')} />
              <Input label="Full name" required error={e('name')} {...register('name')} />
              <Input label="College email" type="email" required error={e('email')} {...register('email')} />
              <Input label="Phone" required error={e('phone')} {...register('phone')} />
              <Select label="Gender" required options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} {...register('gender')} />
              <Input label="Date of birth" type="date" {...register('dateOfBirth')} />
              <Select label="Department" required placeholder="Select…" error={e('departmentId')} options={deptOptions(depts)} {...register('departmentId')} />
              <Input label="Batch" placeholder="2024-2028" required error={e('batch')} {...register('batch')} />
              <Select label="Year" required options={[1, 2, 3, 4, 5].map((y) => ({ value: y, label: `Year ${y}` }))} {...register('yearOfStudy')} />
              <Select label="Semester" required error={e('semester')} options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `Semester ${i + 1}` }))} {...register('semester')} />
              <Input label="Section" maxLength={1} {...register('section')} />
              <Select label="Admission quota" options={[
                { value: 'government', label: 'Government' },
                { value: 'management', label: 'Management' },
                { value: 'nri', label: 'NRI' },
                { value: 'lateral', label: 'Lateral' },
                { value: '7.5% Scheme', label: '7.5% Scheme' },
                { value: 'Sports Quota', label: 'Sports Quota' },
              ]} {...register('admissionQuota')} />
              <Input label="Admission date" type="date" {...register('admissionDate')} />
              <Input label="Faculty advisor" {...register('facultyAdvisor')} />
              <Input label="Scholarship" {...register('scholarship')} />
              <Input label="Distance from home (km)" type="number" {...register('distanceFromHomeKm')} />
              <Checkbox label="First graduate" className="sm:col-span-3" {...register('firstGraduate')} />
            </div>
          </div>
        )}

        {/* ===================== NS-CBSE School Tab ===================== */}
        {studentType === 'NS-CBSE' && (
          <div className={tab === 'school' ? 'space-y-4' : 'hidden'}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Hostel Register ID" required placeholder="e.g. CBSE-2026-001" error={e('registerNumber')} {...register('registerNumber')} />
              <Input label="School Admission No." placeholder="e.g. ADM/2026/890" error={e('cbseAdmissionNumber')} {...register('cbseAdmissionNumber')} />
              <Input label="Student Full Name" required error={e('name')} {...register('name')} />
              <Select label="Class" required error={e('cbseClassLevel')} options={CBSE_CLASSES} {...register('cbseClassLevel')} />
              <Input label="Section" placeholder="e.g. A" maxLength={5} {...register('section')} />
              <Select label="Gender" required options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} {...register('gender')} />
              <Input label="Date of birth" type="date" {...register('dateOfBirth')} />
              <Input label="Student / Parent Phone" required error={e('phone')} {...register('phone')} />
              <Input label="Student / Parent Email" type="email" required error={e('email')} {...register('email')} />
              <Select label="Admission quota" options={[
                { value: 'management', label: 'General / Management' },
                { value: 'government', label: 'RTE / Government' },
                { value: 'Sports Quota', label: 'Sports Quota' },
                { value: '7.5% Scheme', label: 'Scholarship Scheme' },
              ]} {...register('admissionQuota')} />
              <Input label="Admission date" type="date" {...register('admissionDate')} />
              <Input label="Distance from home (km)" type="number" {...register('distanceFromHomeKm')} />
            </div>
          </div>
        )}

        {/* ===================== Guardian Tab (Adaptive) ===================== */}
        <div className={tab === 'guardian' ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <div className="sm:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Parent / Primary Guardian</h4>
          </div>
          <Input label="Parent / guardian name" {...register('parentName')} />
          <Input label="Relation" placeholder="Father / Mother / Guardian" {...register('parentRelation')} />
          <Input label="Parent phone" error={e('parentPhone')} {...register('parentPhone')} />
          <Input label="Parent email" error={e('parentEmail')} {...register('parentEmail')} />
          <Input label="Parent occupation" {...register('parentOccupation')} />
          <span />

          {/* Local Guardian section for NS-CBSE */}
          {studentType === 'NS-CBSE' && (
            <>
              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-700">Local Guardian Details (Mandatory for School Boarders)</h4>
              </div>
              <Input label="Local guardian name" {...register('localGuardianName')} />
              <Input label="Relation" placeholder="Uncle / Aunt / Relative" {...register('localGuardianRelation')} />
              <Input label="Local guardian phone" error={e('localGuardianPhone')} {...register('localGuardianPhone')} />
              <Input label="Local guardian address" placeholder="Local address with town/city" {...register('localGuardianAddress')} />
            </>
          )}

          <div className="sm:col-span-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Emergency Contact</h4>
          </div>
          <Input label="Emergency contact name" {...register('emergencyContactName')} />
          <Input label="Emergency contact phone" error={e('emergencyContactPhone')} {...register('emergencyContactPhone')} />
        </div>

        {/* ===================== Address & Medical Tab ===================== */}
        <div className={(tab === 'address' || tab === 'medical') ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <Input label="Address" className="sm:col-span-2" {...register('addressLine')} />
          <Input label="City" {...register('city')} />
          <Input label="District" {...register('district')} />
          <Input label="State" {...register('state')} />
          <Input label="Pincode" error={e('pincode')} {...register('pincode')} />
          <Select label="Blood group" placeholder="—" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} {...register('bloodGroup')} />
          
          {studentType === 'NS-CBSE' ? (
            <>
              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-700">Health & Medical Profile</h4>
              </div>
              <Textarea label="Known medical conditions" rows={2} placeholder="Asthma, diabetes, seizure history, etc." {...register('medicalConditions')} />
              <Textarea label="Known allergies" rows={2} placeholder="Food allergies (peanuts, milk), drug allergies (penicillin), dust, etc." {...register('allergies')} />
            </>
          ) : (
            <Textarea label="Medical notes" rows={2} className="sm:col-span-2" {...register('medicalNotes')} />
          )}
        </div>
      </form>
    </Modal>
  );
}
