import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Misc';
import api from '../../services/api';
import { useDepartments, deptOptions } from '../../hooks/useLookups';
import { studentSchema, clean } from '../../validations/schemas';

const toForm = (d) => (d ? {
  registerNumber: d.register_number, rollNumber: d.roll_number || '', name: d.name, email: d.email, phone: d.phone, gender: d.gender,
  dateOfBirth: d.date_of_birth || '', departmentId: d.department_id, yearOfStudy: d.year_of_study, semester: d.semester, section: d.section || '',
  batch: d.batch, studentType: d.student_type || 'nscet', admissionDate: d.admission_date || '', admissionQuota: d.admission_quota || 'government',
  schoolClass: d.school_class || '', schoolSection: d.school_section || '',
  facultyAdvisor: d.faculty_advisor || '', scholarship: d.scholarship || '', firstGraduate: !!d.first_graduate, distanceFromHomeKm: d.distance_from_home_km ?? '',
  parentName: d.parent_name || '', parentRelation: d.parent_relation || '', parentPhone: d.parent_phone || '', parentEmail: d.parent_email || '',
  parentOccupation: d.parent_occupation || '', emergencyContactName: d.emergency_contact_name || '', emergencyContactPhone: d.emergency_contact_phone || '',
  addressLine: d.address_line || '', city: d.city || '', district: d.district || '', state: d.state || '', pincode: d.pincode || '',
  bloodGroup: d.blood_group || '', medicalNotes: d.medical_notes || '',
} : { gender: 'male', yearOfStudy: 1, semester: 1, studentType: 'nscet', admissionQuota: 'government', state: 'Tamil Nadu', firstGraduate: false });

const TAB_FIELDS = {
  academic: ['registerNumber', 'name', 'email', 'phone', 'departmentId', 'yearOfStudy', 'semester', 'batch', 'studentType'],
  guardian: ['parentPhone', 'parentEmail', 'emergencyContactPhone'],
  address: ['pincode'],
};

export default function StudentForm({ open, onClose, student, onSaved }) {
  const depts = useDepartments();
  const [tab, setTab] = useState('academic');
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(studentSchema), defaultValues: toForm(student) });
  const studentType = watch('studentType');
  useEffect(() => { if (open) { reset(toForm(student)); setTab('academic'); } }, [open, student, reset]);

  const onSubmit = async (values) => {
    try {
      const body = clean({ ...values, distanceFromHomeKm: values.distanceFromHomeKm === '' ? undefined : values.distanceFromHomeKm });
      const res = student ? await api.put(`/students/${student.id}`, body) : await api.post('/students', body);
      const temp = res.data.data.temporaryPassword;
      toast.success(student ? 'Student updated' : `Student created${temp ? `. Temporary password: ${temp}` : ''}`, { duration: temp ? 10000 : 4000 });
      onSaved?.(res.data.data);
      onClose();
    } catch (err) { toast.error(err.message); }
  };
  const onInvalid = (errs) => {
    const first = Object.keys(errs)[0];
    const owner = Object.entries(TAB_FIELDS).find(([, f]) => f.includes(first))?.[0];
    if (owner) setTab(owner);
    toast.error('Please fix the highlighted fields');
  };
  const e = (k) => errors[k]?.message;

  return (
    <Modal open={open} onClose={onClose} size="xl" title={student ? `Edit ${student.name}` : 'Add student'}
      description="Administrative record. Students can only edit their contact details themselves."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="student-form" loading={isSubmitting}>{student ? 'Save changes' : 'Create student'}</Button></>}>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'academic', label: 'Academic' }, { value: 'guardian', label: 'Guardian & emergency' }, { value: 'address', label: 'Address & medical' }]} />
      <form id="student-form" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
        <div className={tab === 'academic' ? 'grid gap-4 sm:grid-cols-3' : 'hidden'}>
          <Select label="Student type" required options={[{ value: 'nscet', label: 'NSCET (College)' }, { value: 'ns_cbse', label: 'NS-CBSE (School)' }]} {...register('studentType')} />
          <Input label="Register number" required error={e('registerNumber')} {...register('registerNumber')} />
          <Input label="Roll number" error={e('rollNumber')} {...register('rollNumber')} />
          {studentType === 'ns_cbse' && (
            <>
              <Input label="School class" placeholder="e.g. Class 10" {...register('schoolClass')} />
              <Input label="School section" placeholder="e.g. A" {...register('schoolSection')} />
            </>
          )}
          <Input label="Full name" required error={e('name')} {...register('name')} />
          <Input label="College / school email" type="email" required error={e('email')} {...register('email')} />
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
            { value: '7_point_5_scheme', label: '7.5% Scheme' },
            { value: 'sports_quota', label: 'Sports Quota' },
          ]} {...register('admissionQuota')} />
          <Input label="Admission date" type="date" {...register('admissionDate')} />
          <Input label="Faculty advisor" {...register('facultyAdvisor')} />
          <Input label="Scholarship" {...register('scholarship')} />
          <Input label="Distance from home (km)" type="number" {...register('distanceFromHomeKm')} />
          <Checkbox label="First graduate" className="sm:col-span-3" {...register('firstGraduate')} />
        </div>
        <div className={tab === 'guardian' ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <Input label="Parent / guardian name" {...register('parentName')} />
          <Input label="Relation" placeholder="Father / Mother / Guardian" {...register('parentRelation')} />
          <Input label="Parent phone" error={e('parentPhone')} {...register('parentPhone')} />
          <Input label="Parent email" error={e('parentEmail')} {...register('parentEmail')} />
          <Input label="Parent occupation" {...register('parentOccupation')} />
          <span />
          <Input label="Emergency contact name" {...register('emergencyContactName')} />
          <Input label="Emergency contact phone" error={e('emergencyContactPhone')} {...register('emergencyContactPhone')} />
        </div>
        <div className={tab === 'address' ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <Input label="Address" className="sm:col-span-2" {...register('addressLine')} />
          <Input label="City" {...register('city')} />
          <Input label="District" {...register('district')} />
          <Input label="State" {...register('state')} />
          <Input label="Pincode" error={e('pincode')} {...register('pincode')} />
          <Select label="Blood group" placeholder="—" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} {...register('bloodGroup')} />
          <Textarea label="Medical notes" rows={2} {...register('medicalNotes')} />
        </div>
      </form>
    </Modal>
  );
}
