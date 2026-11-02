// Client-side validation (mirrors the API; the server always re-validates).
import { z } from 'zod';

const phone = z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Enter a valid phone number');
const optionalPhone = z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Enter a valid phone number').or(z.literal('')).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date');

export const passwordRule = z.string().min(8, 'At least 8 characters').max(72)
  .regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number');

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const resetSchema = z.object({
  password: passwordRule,
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: passwordRule,
  confirm: z.string(),
}).refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export const leaveSchema = z.object({
  leaveType: z.enum(['home', 'medical', 'personal', 'academic', 'emergency']),
  fromDate: date,
  toDate: date,
  expectedReturnAt: z.string().min(1, 'Select expected return date and time'),
  reason: z.string().trim().min(5, 'Please give a reason (min 5 characters)').max(500),
  destination: z.string().trim().min(2, 'Destination is required').max(200),
  guardianContact: phone,
  emergencyContact: phone,
}).superRefine((v, ctx) => {
  if (v.toDate && v.fromDate && v.toDate < v.fromDate) ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'To date cannot be before from date' });
  const ret = v.expectedReturnAt?.slice(0, 10);
  if (ret && v.fromDate && ret < v.fromDate) ctx.addIssue({ code: 'custom', path: ['expectedReturnAt'], message: 'Return must be after the leave starts' });
});

export const complaintSchema = z.object({
  category: z.enum(['electrical', 'plumbing', 'cleaning', 'internet', 'furniture', 'food', 'security', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150),
  description: z.string().trim().min(10, 'Describe the problem (min 10 characters)').max(2000),
});

export const visitorSchema = z.object({
  phone,
  name: z.string().trim().min(2, 'Name is required').max(120),
  idProofType: z.enum(['aadhaar', 'driving_license', 'voter_id', 'passport', 'pan', 'college_id', 'other']),
  idProofNumber: z.string().trim().min(4, 'ID number is required').max(40),
  studentId: z.coerce.number().int().positive('Select a student').optional(),
  relationship: z.string().trim().min(2, 'Relationship is required').max(40),
  purpose: z.string().trim().min(3, 'Purpose is required').max(255),
  expectedAt: z.string().optional(),
  checkInNow: z.boolean().default(false),
  override: z.boolean().default(false),
  remarks: z.string().max(255).optional(),
});

export const paymentSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount' }).positive('Amount must be greater than zero'),
  paymentMode: z.enum(['cash', 'upi', 'card', 'netbanking', 'dd', 'cheque']),
  transactionId: z.string().trim().min(4, 'Transaction ID is required').max(60).regex(/^[A-Za-z0-9\-/_]+$/, 'Letters, digits, - / _ only'),
  paidAt: z.string().optional(),
  remarks: z.string().max(255).optional(),
});

export const studentSchema = z.object({
  registerNumber: z.string().trim().regex(/^[A-Za-z0-9]{6,20}$/, '6–20 letters/digits'),
  rollNumber: z.string().trim().max(20).optional().or(z.literal('')),
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().email('Enter a valid email'),
  phone,
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth: z.string().optional().or(z.literal('')),
  departmentId: z.coerce.number().int().positive('Select a department'),
  yearOfStudy: z.coerce.number().int().min(1).max(5),
  semester: z.coerce.number().int().min(1).max(10),
  section: z.string().trim().max(1).optional().or(z.literal('')),
  batch: z.string().regex(/^\d{4}-\d{4}$/, 'Format: 2023-2027'),
  admissionDate: z.string().optional().or(z.literal('')),
  admissionQuota: z.enum(['government', 'management', 'nri', 'lateral']),
  facultyAdvisor: z.string().max(120).optional().or(z.literal('')),
  cgpa: z.union([z.coerce.number().min(0).max(10), z.literal('')]).optional(),
  scholarship: z.string().max(120).optional().or(z.literal('')),
  firstGraduate: z.boolean().default(false),
  distanceFromHomeKm: z.union([z.coerce.number().int().min(0).max(5000), z.literal('')]).optional(),
  parentName: z.string().max(120).optional().or(z.literal('')),
  parentRelation: z.string().max(30).optional().or(z.literal('')),
  parentPhone: optionalPhone,
  parentEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  parentOccupation: z.string().max(80).optional().or(z.literal('')),
  emergencyContactName: z.string().max(120).optional().or(z.literal('')),
  emergencyContactPhone: optionalPhone,
  addressLine: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  district: z.string().max(80).optional().or(z.literal('')),
  state: z.string().max(80).optional().or(z.literal('')),
  pincode: z.string().regex(/^\d{6}$/, '6 digits').optional().or(z.literal('')),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().or(z.literal('')),
  medicalNotes: z.string().max(255).optional().or(z.literal('')),
}).refine((v) => Math.ceil(v.semester / 2) === Number(v.yearOfStudy), { message: 'Semester does not match year of study', path: ['semester'] });

export const userSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  phone: optionalPhone,
  role: z.enum(['super_admin', 'warden', 'staff', 'security']),
  designation: z.string().max(80).optional().or(z.literal('')),
  staffSkill: z.string().optional().or(z.literal('')),
  hostelIds: z.array(z.coerce.number()).default([]),
  password: passwordRule.optional().or(z.literal('')),
});

// Removes empty strings so optional API fields are omitted instead of sent as "".
export const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined));
