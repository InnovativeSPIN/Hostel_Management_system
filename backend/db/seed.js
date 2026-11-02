/* eslint-disable no-console */
// ============================================================================
//  DEVELOPMENT / DEMO SEED DATA — NOT REAL PEOPLE OR RECORDS.
//  Creates a demo engineering college hostel with 50 students. All dates are
//  generated relative to "today" so dashboards always have live exceptions.
//  Usage: npm run db:seed   (or npm run db:reset to rebuild schema + seed)
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const env = require('../src/config/env');
const { PERMISSIONS, ROLES } = require('../src/config/permissions');
const { DEFAULTS } = require('../src/services/settings');
const { toDateStr, toDateTimeStr, addDays, currentAcademicYear } = require('../src/utils/helpers');

// ---------- deterministic randomness ----------
let seed = 20261006;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const digits = (n) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');

const TODAY = toDateStr();
const NOW = new Date();
const AY = currentAcademicYear();
const PREV_AY = `${Number(AY.slice(0, 4)) - 1}-${AY.slice(2, 4)}`;
const dt = (daysAgo, hh = 10, mm = 0) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hh, mm, 0, 0); return toDateTimeStr(d); };
const hoursAgo = (h) => toDateTimeStr(new Date(NOW.getTime() - h * 3600_000));
const hoursAhead = (h) => toDateTimeStr(new Date(NOW.getTime() + h * 3600_000));
const DEMO_DOMAIN = 'demo.college.edu';

let conn;
const q = (sql, params = []) => conn.query(sql, params).then(([r]) => r);
async function ins(table, row) {
  const keys = Object.keys(row);
  const r = await q(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => row[k]));
  return r.insertId;
}

// ---------- master data ----------
const DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science and Engineering', short: 'CSE', degree: 'B.E.', uc: '104', hod: 'Dr. R. Lakshmi Narayanan', block: 'Visvesvaraya Block', intake: 180, est: 1998, nba: 1 },
  { code: 'IT', name: 'Information Technology', short: 'IT', degree: 'B.Tech.', uc: '205', hod: 'Dr. S. Meenakshi', block: 'Visvesvaraya Block', intake: 120, est: 2001, nba: 1 },
  { code: 'ECE', name: 'Electronics and Communication Engineering', short: 'ECE', degree: 'B.E.', uc: '106', hod: 'Dr. K. Senthil Kumar', block: 'C.V. Raman Block', intake: 180, est: 1996, nba: 1 },
  { code: 'EEE', name: 'Electrical and Electronics Engineering', short: 'EEE', degree: 'B.E.', uc: '105', hod: 'Dr. P. Anandhi', block: 'Tesla Block', intake: 60, est: 1996, nba: 1 },
  { code: 'MECH', name: 'Mechanical Engineering', short: 'MECH', degree: 'B.E.', uc: '114', hod: 'Dr. M. Venkatesan', block: 'Kalam Workshop Block', intake: 120, est: 1995, nba: 1 },
  { code: 'CIVIL', name: 'Civil Engineering', short: 'CIVIL', degree: 'B.E.', uc: '103', hod: 'Dr. A. Jayakumar', block: 'Kalam Workshop Block', intake: 60, est: 1995, nba: 0 },
  { code: 'AIDS', name: 'Artificial Intelligence and Data Science', short: 'AI&DS', degree: 'B.Tech.', uc: '243', hod: 'Dr. N. Kavitha', block: 'Innovation Centre', intake: 120, est: 2020, nba: 0 },
  { code: 'MECSE', name: 'M.E. Computer Science and Engineering', short: 'M.E. CSE', degree: 'M.E.', uc: '405', hod: 'Dr. R. Lakshmi Narayanan', block: 'Visvesvaraya Block', intake: 18, est: 2008, nba: 0 },
];

// [name, gender, deptCode, batchStartYear]
const STUDENTS = [
  ['Arun Kumar S', 'male', 'CSE', 2023], ['Karthik Raja M', 'male', 'CSE', 2024], ['Praveen Kumar R', 'male', 'ECE', 2023], ['Vignesh Waran K', 'male', 'MECH', 2025],
  ['Sanjay Krishnan P', 'male', 'IT', 2024], ['Dinesh Babu T', 'male', 'EEE', 2023], ['Harish Raghavan V', 'male', 'CSE', 2025], ['Mohammed Irfan A', 'male', 'ECE', 2024],
  ['Gokul Nath S', 'male', 'MECH', 2024], ['Naveen Prasath B', 'male', 'CIVIL', 2023], ['Rahul Dev N', 'male', 'AIDS', 2025], ['Surya Prakash G', 'male', 'AIDS', 2024],
  ['Ajith Kumar L', 'male', 'MECH', 2023], ['Bharath Raj E', 'male', 'EEE', 2025], ['Deepak Chandran J', 'male', 'CSE', 2023], ['Ezhil Arasan M', 'male', 'CIVIL', 2024],
  ['Fazil Ahamed K', 'male', 'IT', 2025], ['Gowtham Siva R', 'male', 'ECE', 2025], ['Hariharan S', 'male', 'MECSE', 2025], ['Imran Khan Y', 'male', 'MECSE', 2026],
  ['Jeevan Joseph D', 'male', 'MECSE', 2026], ['Kishore Kumar P', 'male', 'CSE', 2024], ['Lokesh Pandian C', 'male', 'MECH', 2025], ['Manikandan V', 'male', 'EEE', 2024],
  ['Nithish Kumar A', 'male', 'IT', 2023], ['Pranav Iyer S', 'male', 'AIDS', 2023], ['Ragul Ganesh T', 'male', 'ECE', 2023], ['Santhosh Murugan K', 'male', 'CIVIL', 2025],
  // the four male students below are not residents: exited / awaiting allocation / applicants
  ['Tamilselvan R', 'male', 'CIVIL', 2022], ['Udhayakumar P', 'male', 'MECH', 2026], ['Vishnu Vardhan S', 'male', 'CSE', 2026], ['Yuvaraj M', 'male', 'ECE', 2026],
  ['Priya Dharshini S', 'female', 'CSE', 2023], ['Kavya Sri R', 'female', 'IT', 2024], ['Divya Bharathi M', 'female', 'ECE', 2023], ['Swetha Lakshmi K', 'female', 'AIDS', 2024],
  ['Nandhini Devi P', 'female', 'EEE', 2023], ['Harini Ramesh', 'female', 'CSE', 2025], ['Aishwarya Venkat', 'female', 'IT', 2023], ['Keerthana Selvam', 'female', 'ECE', 2024],
  ['Monisha Ravi', 'female', 'AIDS', 2025], ['Sowmiya Anand', 'female', 'CIVIL', 2024], ['Janani Krishnan', 'female', 'MECSE', 2025], ['Fathima Begum A', 'female', 'CSE', 2024],
  ['Lavanya Murali', 'female', 'EEE', 2025], ['Meenakshi S', 'female', 'IT', 2025], ['Pooja Shree V', 'female', 'ECE', 2025], ['Roshini Mary J', 'female', 'AIDS', 2023],
  // the two female students below are not residents: approved (awaiting bed) / day scholar
  ['Shalini Prabhu', 'female', 'CSE', 2026], ['Varsha Narayanan', 'female', 'MECH', 2026],
];

const PARENT_MALE = ['Subramanian', 'Ramasamy', 'Krishnan', 'Murugesan', 'Rajendran', 'Palanisamy', 'Shanmugam', 'Arumugam', 'Selvaraj', 'Venkatesan', 'Abdul Rahman', 'Joseph', 'Natarajan', 'Kannan'];
const PLACES = [['Madurai', 'Madurai', 498], ['Tirunelveli', 'Tirunelveli', 610], ['Salem', 'Salem', 340], ['Erode', 'Erode', 400], ['Thanjavur', 'Thanjavur', 320], ['Dindigul', 'Dindigul', 420],
  ['Vellore', 'Vellore', 140], ['Tiruchirappalli', 'Tiruchirappalli', 330], ['Coimbatore', 'Coimbatore', 500], ['Nagercoil', 'Kanyakumari', 700], ['Kumbakonam', 'Thanjavur', 290],
  ['Karur', 'Karur', 390], ['Namakkal', 'Namakkal', 360], ['Villupuram', 'Villupuram', 160], ['Puducherry', 'Puducherry', 150], ['Thoothukudi', 'Thoothukudi', 600]];
const BLOOD = ['O+', 'O+', 'B+', 'B+', 'A+', 'A+', 'AB+', 'O-', 'B-', 'A-'];
const ADVISORS = ['Mrs. G. Revathi', 'Mr. S. Balaji', 'Dr. T. Sangeetha', 'Mr. K. Prabhu', 'Mrs. V. Deepa', 'Dr. M. Karthikeyan'];
const SCHOLARSHIPS = [null, null, null, 'First Graduate Tuition Fee Concession', 'Post-Matric Scholarship (BC/MBC)', '7.5% Govt. School Reservation', 'Merit Scholarship', null];

async function seedAccess() {
  for (const [name, r] of Object.entries(ROLES)) await ins('roles', { name, label: r.label, description: r.description });
  for (const [code, [module, description]] of Object.entries(PERMISSIONS)) await ins('permissions', { code, module, description });
  for (const [name, r] of Object.entries(ROLES)) {
    await q(`INSERT INTO role_permissions (role_id, permission_id)
             SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (?) WHERE r.name = ?`, [r.permissions, name]);
  }
  for (const [key, v] of Object.entries(DEFAULTS)) await ins('system_settings', { setting_key: key, setting_value: v.value, description: v.description });
}

async function seedUsers() {
  const hash = {
    admin: await bcrypt.hash('Admin@123', 10), warden: await bcrypt.hash('Warden@123', 10), staff: await bcrypt.hash('Staff@123', 10),
    security: await bcrypt.hash('Security@123', 10), student: await bcrypt.hash('Student@123', 10),
  };
  const roleId = async (n) => (await q('SELECT id FROM roles WHERE name = ?', [n]))[0].id;
  const R = { super_admin: await roleId('super_admin'), warden: await roleId('warden'), staff: await roleId('staff'), security: await roleId('security'), student: await roleId('student') };
  const mk = (role, name, email, phone, pwd, designation, skill = null) => ins('users', {
    role_id: R[role], name, email, phone, password_hash: pwd, designation, staff_skill: skill,
  });
  const u = {
    admin: await mk('super_admin', 'Dr. V. Ramachandran', `admin@${DEMO_DOMAIN}`, '9840011001', hash.admin, 'Chief Warden & Hostel Administrator'),
    wardenBoys: await mk('warden', 'Mr. Arun Prakash', `warden.boys@${DEMO_DOMAIN}`, '9840011002', hash.warden, 'Warden – Boys Hostels'),
    wardenGirls: await mk('warden', 'Mrs. Kalaiselvi R', `warden.girls@${DEMO_DOMAIN}`, '9840011003', hash.warden, 'Warden – Girls Hostel'),
    elec: await mk('staff', 'Murugan K', `electrician@${DEMO_DOMAIN}`, '9840011004', hash.staff, 'Electrician', 'electrical'),
    plumb: await mk('staff', 'Selvam P', `plumber@${DEMO_DOMAIN}`, '9840011005', hash.staff, 'Plumber', 'plumbing'),
    care: await mk('staff', 'Lakshmi Devi', `caretaker@${DEMO_DOMAIN}`, '9840011006', hash.staff, 'Caretaker (Housekeeping)', 'cleaning'),
    net: await mk('staff', 'Rajesh Kumar', `network@${DEMO_DOMAIN}`, '9840011007', hash.staff, 'Network Technician', 'internet'),
    secBoys: await mk('security', 'Ganesan M', `security.boys@${DEMO_DOMAIN}`, '9840011008', hash.security, 'Security Supervisor – Boys Gate'),
    secGirls: await mk('security', 'Saraswathi K', `security.girls@${DEMO_DOMAIN}`, '9840011009', hash.security, 'Security Supervisor – Girls Gate'),
  };
  return { u, R, hash };
}

async function seedDepartments() {
  const ids = {};
  for (const d of DEPARTMENTS) {
    ids[d.code] = await ins('departments', {
      code: d.code, name: d.name, short_name: d.short, degree: d.degree, university_code: d.uc, hod_name: d.hod,
      hod_email: `hod.${d.code.toLowerCase()}@${DEMO_DOMAIN}`, hod_phone: `04427${digits(6)}`, block: d.block, annual_intake: d.intake,
      established_year: d.est, nba_accredited: d.nba,
    });
  }
  return ids;
}

async function seedHostels(u) {
  const H = {
    A: await ins('hostels', { code: 'A', name: 'Bharathiyar Boys Hostel A', gender: 'male', hostel_type: 'UG', address: 'North Campus, Demo Institute of Engineering & Technology', warden_id: u.wardenBoys, contact_phone: '04427150101', contact_email: `hostel.a@${DEMO_DOMAIN}` }),
    B: await ins('hostels', { code: 'B', name: 'Kamarajar Boys Hostel B', gender: 'male', hostel_type: 'Mixed', address: 'North Campus, Demo Institute of Engineering & Technology', warden_id: u.wardenBoys, contact_phone: '04427150102', contact_email: `hostel.b@${DEMO_DOMAIN}` }),
    G: await ins('hostels', { code: 'G', name: 'Kalpana Chawla Girls Hostel', gender: 'female', hostel_type: 'UG', address: 'South Campus, Demo Institute of Engineering & Technology', warden_id: u.wardenGirls, contact_phone: '04427150103', contact_email: `hostel.g@${DEMO_DOMAIN}` }),
  };
  const assign = [[u.wardenBoys, ['A', 'B']], [u.wardenGirls, ['G']], [u.elec, ['A', 'B', 'G']], [u.plumb, ['A', 'B', 'G']], [u.care, ['A', 'B', 'G']], [u.net, ['A', 'B', 'G']], [u.secBoys, ['A', 'B']], [u.secGirls, ['G']]];
  for (const [uid, codes] of assign) for (const c of codes) await ins('user_hostels', { user_id: uid, hostel_id: H[c] });

  // hostel -> floors -> [capacity per room]
  const layout = {
    A: { 1: [3, 3, 4], 2: [3, 3, 4], 3: [2, 3, 3] },
    B: { 1: [2, 2, 3], 2: [1, 1, 2] },
    G: { 1: [3, 3, 3], 2: [3, 4, 2], 3: [2, 2] },
  };
  const typeOf = (c) => ({ 1: 'single', 2: 'double', 3: 'triple', 4: 'quad' }[c]);
  const beds = { A: [], B: [], G: [] };
  const rooms = {};
  for (const [code, floors] of Object.entries(layout)) {
    for (const [floorNo, caps] of Object.entries(floors)) {
      const floorId = await ins('floors', { hostel_id: H[code], floor_number: Number(floorNo), label: ['Ground', 'First Floor', 'Second Floor', 'Third Floor'][floorNo] || `Floor ${floorNo}` });
      for (let i = 0; i < caps.length; i += 1) {
        const roomNo = `${floorNo}0${i + 1}`;
        const cap = caps[i];
        const roomId = await ins('rooms', {
          hostel_id: H[code], floor_id: floorId, room_number: roomNo, room_type: typeOf(cap), capacity: cap,
          is_ac: code === 'B' && cap <= 2 ? 1 : 0, attached_bath: code !== 'A' ? 1 : 0,
        });
        rooms[`${code}-${roomNo}`] = roomId;
        for (let n = 1; n <= cap; n += 1) {
          const bedId = await ins('beds', { room_id: roomId, bed_number: n, bed_code: `${code}-${floorNo}-${roomNo}-B${n}` });
          beds[code].push({ id: bedId, roomId, code: `${code}-${floorNo}-${roomNo}-B${n}`, roomNo, cap });
        }
      }
    }
    await q('UPDATE hostels SET total_floors = (SELECT COUNT(*) FROM floors WHERE hostel_id = ?) WHERE id = ?', [H[code], H[code]]);
  }
  return { H, beds, rooms };
}

function academic(batchStart, degree) {
  const ayStart = Number(AY.slice(0, 4));
  const pg = degree.startsWith('M');
  const years = pg ? 2 : 4;
  const year = Math.min(ayStart - batchStart + 1, years);
  const sem = year * 2 - 1; // odd semester runs July–November
  return { year, sem, batch: `${batchStart}-${batchStart + years}` };
}

async function seedStudents(userCtx, deptIds) {
  const deptByCode = Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d]));
  const seq = {};
  const list = [];
  for (const [name, gender, dcode, batchStart] of STUDENTS) {
    const d = deptByCode[dcode];
    const { year, sem, batch } = academic(batchStart, d.degree);
    seq[`${dcode}${batchStart}`] = (seq[`${dcode}${batchStart}`] || 0) + 1;
    const reg = `7111${String(batchStart).slice(2)}${d.uc}${String(seq[`${dcode}${batchStart}`]).padStart(3, '0')}`;
    const first = name.split(' ')[0].toLowerCase();
    const email = `${first}.${reg.slice(-6)}@${DEMO_DOMAIN}`;
    const phone = `9${digits(9)}`;
    const userId = await ins('users', { role_id: userCtx.R.student, name, email, phone, password_hash: userCtx.hash.student });
    const place = pick(PLACES);
    const dob = `${batchStart - (d.degree.startsWith('M') ? 22 : 18)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 27)).padStart(2, '0')}`;
    const quota = year > 1 && batchStart === Number(AY.slice(0, 4)) - 2 && chance(0.1) ? 'lateral' : chance(0.75) ? 'government' : 'management';
    const id = await ins('students', {
      user_id: userId, register_number: reg, roll_number: `${String(batchStart).slice(2)}${d.code}${String(seq[`${dcode}${batchStart}`]).padStart(3, '0')}`,
      name, email, phone, gender, date_of_birth: dob, department_id: deptIds[dcode], year_of_study: year, semester: sem,
      section: d.intake >= 120 ? pick(['A', 'B']) : 'A', batch, admission_date: `${batchStart}-08-${String(10 + Math.floor(rand() * 15)).padStart(2, '0')}`, admission_quota: quota,
    });
    const father = pick(PARENT_MALE);
    await ins('student_profiles', {
      student_id: id, parent_name: `${father}`, parent_relation: 'Father', parent_phone: `9${digits(9)}`, parent_email: chance(0.5) ? `${father.toLowerCase().replace(/\s/g, '')}${digits(2)}@example.com` : null,
      parent_occupation: pick(['Farmer', 'Teacher', 'Business', 'Government Employee', 'Driver', 'Private Employee', 'Shop Owner', 'Electrician']),
      emergency_contact_name: `${pick(['Uncle', 'Mother', 'Brother', 'Aunt'])} – ${pick(PARENT_MALE)}`, emergency_contact_phone: `9${digits(9)}`,
      address_line: `${1 + Math.floor(rand() * 120)}, ${pick(['Gandhi Street', 'Nehru Nagar', 'Anna Salai', 'Kamarajar Road', 'Bharathi Street', 'Temple Road', 'Market Street'])}`,
      city: place[0], district: place[1], state: place[0] === 'Puducherry' ? 'Puducherry' : 'Tamil Nadu', pincode: `6${digits(5)}`,
      blood_group: pick(BLOOD), faculty_advisor: pick(ADVISORS), cgpa: year === 1 && !d.degree.startsWith('M') ? null : (6.2 + rand() * 3.5).toFixed(2),
      scholarship: pick(SCHOLARSHIPS), first_graduate: chance(0.3) ? 1 : 0, distance_from_home_km: place[2],
      medical_notes: chance(0.08) ? pick(['Asthma – carries inhaler', 'Allergic to peanuts', 'Wears spectacles (-3.5)']) : null,
    });
    list.push({ id, userId, name, gender, dcode, year, batchStart, reg, pg: d.degree.startsWith('M') });
  }
  return list;
}

// One parent login per student (named from the profile); Arun's parent is also linked to a
// second student to demonstrate a parent with two children in the hostel.
async function seedParents(students, adminId) {
  const roleId = (await q("SELECT id FROM roles WHERE name = 'parent'"))[0].id;
  const hash = await bcrypt.hash('Parent@123', 10);
  const accounts = {};
  for (const s of students) {
    const p = (await q('SELECT parent_name, parent_relation, parent_phone FROM student_profiles WHERE student_id = ?', [s.id]))[0];
    const userId = await ins('users', {
      role_id: roleId, name: `${p.parent_name} (parent of ${s.name.split(' ')[0]})`, email: `parent.${s.reg}@${DEMO_DOMAIN}`,
      phone: p.parent_phone, password_hash: hash,
    });
    await ins('parent_students', { parent_user_id: userId, student_id: s.id, relation: p.parent_relation || 'Father', created_by: adminId });
    accounts[s.id] = userId;
  }
  const arun = students.find((s) => s.name === 'Arun Kumar S');
  const sibling = students.find((s) => s.name === 'Harini Ramesh');
  await ins('parent_students', { parent_user_id: accounts[arun.id], student_id: sibling.id, relation: 'Father', is_primary: 0, created_by: adminId });
  await q('UPDATE users SET name = ? WHERE id = ?', [`${(await q('SELECT parent_name FROM student_profiles WHERE student_id = ?', [arun.id]))[0].parent_name} (parent of Arun & Harini)`, accounts[arun.id]]);
  return Object.keys(accounts).length;
}

async function writeDemoPdf(label) {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  const stored = `seed-${label}-${digits(6)}.pdf`;
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 12 Tf 20 60 Td (DEMO DOCUMENT - ${label}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  fs.writeFileSync(path.join(env.uploadDir, stored), pdf);
  return { stored, size: Buffer.byteLength(pdf) };
}

async function application(student, status, hostelId, by, createdDaysAgo, flow) {
  const id = await ins('hostel_applications', {
    application_code: `TMP${student.id}`, student_id: student.id, academic_year: AY, preferred_hostel_id: hostelId,
    preferred_room_type: student.pg ? 'double' : pick(['triple', 'quad', 'triple', null]), reason: pick([
      'Native place is far from campus; daily commute is not possible.', 'Family lives in another district; need accommodation near college for lab hours.',
      'Hostel stay helps with project work and placement training sessions.', 'No direct bus connectivity from hometown to campus.']),
    status, reviewed_by: ['submitted', 'documents_verified'].includes(status) ? null : by, reviewed_at: ['submitted', 'documents_verified'].includes(status) ? null : dt(createdDaysAgo - 2),
    remarks: ['approved', 'fee_assigned', 'allocated', 'confirmed'].includes(status) ? 'Eligible – distance and documents verified' : null,
    created_at: dt(createdDaysAgo),
  });
  await q('UPDATE hostel_applications SET application_code = ? WHERE id = ?', [`APP${1000 + id}`, id]);
  let prev = null;
  for (const [i, s] of flow.entries()) {
    await q('INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks, created_at) VALUES (?,?,?,?,?,?)',
      [id, prev, s, i === 0 ? student.userId : by, i === 0 ? 'Application submitted' : null, dt(Math.max(createdDaysAgo - i, 0), 11 + i)]);
    prev = s;
  }
  for (const t of ['id_proof', 'admission_letter']) {
    const f = await writeDemoPdf(`${t}-${student.reg}`);
    await ins('application_documents', {
      application_id: id, doc_type: t, original_name: `${t}_${student.reg}.pdf`, stored_name: f.stored, mime_type: 'application/pdf', size_bytes: f.size,
      verified: status === 'submitted' ? 0 : 1, verified_by: status === 'submitted' ? null : by, verified_at: status === 'submitted' ? null : dt(createdDaysAgo - 1),
    });
  }
  return id;
}

const FULL_FLOW = ['submitted', 'documents_verified', 'eligible', 'approved', 'fee_assigned', 'allocated', 'confirmed'];

async function seedAdmissionsAndAllocations(students, ctx) {
  const { u, H, beds } = ctx;
  const byName = Object.fromEntries(students.map((s) => [s.name, s]));
  const nonResidents = {
    exited: byName['Tamilselvan R'], feeAssigned: byName['Udhayakumar P'], submitted: byName['Vishnu Vardhan S'], eligible: byName['Yuvaraj M'],
    approved: byName['Shalini Prabhu'], dayScholar: byName['Varsha Narayanan'],
  };
  const skip = new Set(Object.values(nonResidents).map((s) => s.id));
  const residents = students.filter((s) => !skip.has(s.id));

  // Room 301 in hostel A is under maintenance; one bed in G is blocked (broken cot).
  const maintenanceRoom = ctx.rooms['A-301'];
  await q("UPDATE rooms SET status = 'maintenance', status_reason = 'Seepage in ceiling – waterproofing in progress' WHERE id = ?", [maintenanceRoom]);
  await q("UPDATE beds SET status = 'maintenance' WHERE room_id = ?", [maintenanceRoom]);
  const blockedBed = beds.G.find((b) => b.code === 'G-2-202-B4');
  await q("UPDATE beds SET status = 'blocked' WHERE id = ?", [blockedBed.id]);

  const free = {
    A: beds.A.filter((b) => b.roomId !== maintenanceRoom),
    B: [...beds.B],
    G: beds.G.filter((b) => b.id !== blockedBed.id),
  };
  // Spread students across rooms (round-robin over rooms) rather than packing them.
  const takeBed = (code, preferSmall = false) => {
    const pool = free[code];
    const byRoom = {};
    pool.forEach((b) => { (byRoom[b.roomId] ||= []).push(b); });
    const roomsOrder = Object.values(byRoom).sort((a, b) => (preferSmall ? a[0].cap - b[0].cap : b.length - a.length));
    const bed = roomsOrder[0][0];
    free[code] = pool.filter((b) => b.id !== bed.id);
    return bed;
  };

  const allocations = {};
  for (const s of residents) {
    const code = s.gender === 'female' ? 'G' : s.pg ? 'B' : (s.year >= 3 && chance(0.35) ? 'B' : 'A');
    const hostelCode = free[code].length ? code : (code === 'B' ? 'A' : 'B');
    const bed = takeBed(hostelCode, s.pg);
    const createdDaysAgo = s.year === 1 && !s.pg ? 60 : 100;
    const appId = await application(s, 'confirmed', H[hostelCode], s.gender === 'female' ? u.wardenGirls : u.wardenBoys, createdDaysAgo, FULL_FLOW);
    const allocatedAt = s.year === 1 ? dt(Math.min(48, createdDaysAgo - 8), 15) : dt(97, 15);
    const allocId = await ins('room_allocations', {
      student_id: s.id, bed_id: bed.id, room_id: bed.roomId, hostel_id: H[hostelCode], application_id: appId, academic_year: AY,
      allocated_by: s.gender === 'female' ? u.wardenGirls : u.wardenBoys, allocated_at: allocatedAt,
    });
    await q("UPDATE beds SET status = 'occupied' WHERE id = ?", [bed.id]);
    await q('UPDATE rooms SET current_occupancy = current_occupancy + 1 WHERE id = ?', [bed.roomId]);
    await q("UPDATE students SET hostel_status = 'resident' WHERE id = ?", [s.id]);
    allocations[s.id] = { id: allocId, hostel: hostelCode, hostelId: H[hostelCode], bed, allocatedAt: allocatedAt.slice(0, 10) };
  }

  // A room transfer for history: first resident in hostel A moves to a free bed on another floor.
  const mover = residents.find((s) => allocations[s.id].hostel === 'A' && allocations[s.id].bed.code.startsWith('A-1'));
  const target = free.A.find((b) => !b.code.startsWith('A-1'));
  if (mover && target) {
    const old = allocations[mover.id];
    await q("UPDATE room_allocations SET status = 'transferred', ended_at = ?, end_reason = 'Transfer: Requested ground-floor-free room near study hall' WHERE id = ?", [dt(20, 12), old.id]);
    await q("UPDATE beds SET status = 'available' WHERE id = ?", [old.bed.id]);
    await q('UPDATE rooms SET current_occupancy = current_occupancy - 1 WHERE id = ?', [old.bed.roomId]);
    const newId = await ins('room_allocations', {
      student_id: mover.id, bed_id: target.id, room_id: target.roomId, hostel_id: H.A, application_id: null, academic_year: AY, allocated_by: u.wardenBoys, allocated_at: dt(20, 12),
    });
    await q("UPDATE beds SET status = 'occupied' WHERE id = ?", [target.id]);
    await q('UPDATE rooms SET current_occupancy = current_occupancy + 1 WHERE id = ?', [target.roomId]);
    await ins('room_transfer_history', { student_id: mover.id, from_allocation_id: old.id, to_allocation_id: newId, from_bed_id: old.bed.id, to_bed_id: target.id, reason: 'Roommate conflict resolved by moving to a quieter room', transferred_by: u.wardenBoys, created_at: dt(20, 12) });
    free.A = free.A.filter((b) => b.id !== target.id).concat([old.bed]);
    allocations[mover.id] = { ...old, id: newId, bed: target };
  }

  // Exited student (graduated batch): previous-year allocation, vacated with a cleared exit record.
  const ex = nonResidents.exited;
  const exBed = beds.B.find((b) => b.cap === 2);
  const exApp = await application(ex, 'confirmed', H.B, u.wardenBoys, 420, FULL_FLOW);
  await q('UPDATE hostel_applications SET academic_year = ? WHERE id = ?', [PREV_AY, exApp]);
  const exAlloc = await ins('room_allocations', {
    student_id: ex.id, bed_id: exBed.id, room_id: exBed.roomId, hostel_id: H.B, application_id: exApp, academic_year: PREV_AY, allocated_by: u.wardenBoys,
    allocated_at: dt(400, 15), status: 'vacated', ended_at: dt(130, 11), end_reason: 'Hostel exit: course_completed',
  });
  await ins('hostel_exit_records', {
    student_id: ex.id, allocation_id: exAlloc, requested_exit_date: addDays(TODAY, -132), exit_date: addDays(TODAY, -130), reason: 'course_completed',
    reason_details: 'Completed final semester examinations', room_condition: 'good', inspection_notes: 'Room handed over clean; keys returned',
    pending_fees: 0, damage_charges: 0, clearance_status: 'cleared', requested_by: ex.userId, inspected_by: u.wardenBoys, approved_by: u.wardenBoys, approved_at: dt(130, 11),
  });
  await q("UPDATE students SET hostel_status = 'exited', year_of_study = 4, semester = 8 WHERE id = ?", [ex.id]);

  // Pending admissions at different workflow stages.
  await application(nonResidents.feeAssigned, 'fee_assigned', H.A, u.wardenBoys, 9, FULL_FLOW.slice(0, 5));
  await application(nonResidents.approved, 'approved', H.G, u.wardenGirls, 6, FULL_FLOW.slice(0, 4));
  await application(nonResidents.eligible, 'eligible', H.A, u.wardenBoys, 4, FULL_FLOW.slice(0, 3));
  await application(nonResidents.submitted, 'submitted', H.A, null, 1, FULL_FLOW.slice(0, 1));
  await q("UPDATE students SET hostel_status = 'approved' WHERE id IN (?)", [[nonResidents.feeAssigned.id, nonResidents.approved.id]]);
  await q("UPDATE students SET hostel_status = 'applied' WHERE id IN (?)", [[nonResidents.eligible.id, nonResidents.submitted.id]]);

  // A final-year student has requested exit (awaiting inspection).
  const leaver = residents.find((s) => s.year === 4 && allocations[s.id].hostel === 'A') || residents.find((s) => s.year === 4);
  await ins('hostel_exit_records', {
    student_id: leaver.id, allocation_id: allocations[leaver.id].id, requested_exit_date: addDays(TODAY, 12), reason: 'transfer_to_day_scholar',
    reason_details: 'Family relocated to the city; will commute from home', pending_fees: 0, clearance_status: 'requested', requested_by: leaver.userId, created_at: dt(1, 18),
  });

  return { residents, allocations, nonResidents, maintenanceRoom };
}

async function seedFees(students, ctx, alloc) {
  const { u } = ctx;
  const term1Due = addDays(TODAY, -50);
  const term2Due = addDays(TODAY, 4);
  const fs1 = await ins('fee_structures', { name: `Hostel Fee ${AY} · Term I`, academic_year: AY, hostel_fee: 10000, mess_fee: 7500, maintenance_fee: 1000, security_deposit: 5000, other_fee: 0, due_date: term1Due, created_by: u.admin });
  const fs2 = await ins('fee_structures', { name: `Hostel Fee ${AY} · Term II`, academic_year: AY, hostel_fee: 10000, mess_fee: 7500, maintenance_fee: 1000, security_deposit: 0, other_fee: 0, due_date: term2Due, created_by: u.admin });
  const fsPrev = await ins('fee_structures', { name: `Hostel Fee ${PREV_AY} · Annual`, academic_year: PREV_AY, hostel_fee: 19000, mess_fee: 14000, maintenance_fee: 2000, security_deposit: 0, other_fee: 0, due_date: addDays(TODAY, -400), status: 'archived', created_by: u.admin });

  let receipt = 0;
  const pay = async (sfId, studentId, amount, when, mode = pick(['upi', 'upi', 'netbanking', 'card', 'dd', 'cash'])) => {
    receipt += 1;
    await ins('payments', {
      receipt_number: `RCP${when.slice(0, 10).replace(/-/g, '')}${String(receipt).padStart(4, '0')}`, student_fee_id: sfId, student_id: studentId, amount,
      payment_mode: mode, transaction_id: `${mode.toUpperCase()}${digits(12)}`, paid_at: when, recorded_by: u.admin, remarks: null,
    });
    await q('UPDATE student_fees SET amount_paid = amount_paid + ? WHERE id = ?', [amount, sfId]);
  };
  const assign = (studentId, fsId, total, due, year = AY, discount = 0) => ins('student_fees', {
    student_id: studentId, fee_structure_id: fsId, academic_year: year, total_amount: total, discount, due_date: due, assigned_by: u.admin, created_at: dt(105),
  });

  const residentIds = new Set(alloc.residents.map((s) => s.id));
  let i = 0;
  for (const s of students) {
    if (!residentIds.has(s.id)) continue;
    i += 1;
    const sch = (await q('SELECT scholarship FROM student_profiles WHERE student_id = ?', [s.id]))[0].scholarship;
    const discount = sch && sch.startsWith('First Graduate') ? 2000 : 0;
    const t1 = await assign(s.id, fs1, 23500, term1Due, AY, discount);
    const net1 = 23500 - discount;
    // Term I: ~75% fully paid, ~12% partial (overdue), rest unpaid (overdue)
    if (i % 8 === 3) await pay(t1, s.id, 12000, dt(55));
    else if (i % 8 !== 6) await pay(t1, s.id, net1, dt(52 + (i % 10)));
    const t2 = await assign(s.id, fs2, 18500, term2Due);
    if (i % 3 === 0) await pay(t2, s.id, 18500, dt(i % 9));
    else if (i % 5 === 0) await pay(t2, s.id, 9000, dt(3));
    // Previous year for senior students; two of them still owe last year's fee (repeat defaulters).
    if (s.year >= 2 && !s.pg) {
      const p = await assign(s.id, fsPrev, 35000, addDays(TODAY, -400), PREV_AY);
      if (i % 8 === 6) await pay(p, s.id, 20000, dt(380));
      else await pay(p, s.id, 35000, dt(395 + (i % 5)));
    }
  }
  // Fee assigned to the approved applicant (admission workflow stage "fee_assigned").
  await assign(alloc.nonResidents.feeAssigned.id, fs1, 23500, addDays(TODAY, 10));
  // The exited student settled everything last year.
  const exPrev = await assign(alloc.nonResidents.exited.id, fsPrev, 35000, addDays(TODAY, -400), PREV_AY);
  await pay(exPrev, alloc.nonResidents.exited.id, 35000, dt(390));
}

async function seedLeaves(alloc, u) {
  const R = alloc.residents;
  const wardenOf = (s) => (s.gender === 'female' ? u.wardenGirls : u.wardenBoys);
  const leaves = [];
  const make = async (s, o) => {
    const id = await ins('leave_requests', {
      leave_code: `TMP${s.id}${digits(5)}`, student_id: s.id, leave_type: o.type, from_date: o.from, to_date: o.to, expected_return_at: o.ret,
      reason: o.reason, destination: o.dest, guardian_contact: `9${digits(9)}`, emergency_contact: `9${digits(9)}`, status: o.status,
      reviewed_by: o.status === 'pending' ? null : wardenOf(s), reviewed_at: o.status === 'pending' ? null : `${addDays(o.from, -2)} 17:30:00`,
      review_remarks: o.remarks || null, departed_at: o.departed || null, returned_at: o.returned || null, return_marked_by: o.returned ? wardenOf(s) : null,
      created_at: `${addDays(o.from, -3)} 19:15:00`,
    });
    await q('UPDATE leave_requests SET leave_code = ? WHERE id = ?', [`LV${1000 + id}`, id]);
    await ins('leave_history', { leave_id: id, action: 'submitted', from_status: null, to_status: 'pending', acted_by: s.userId, created_at: `${addDays(o.from, -3)} 19:15:00` });
    if (o.status !== 'pending') {
      const decided = ['rejected', 'cancelled'].includes(o.status) ? o.status : 'approved';
      await ins('leave_history', { leave_id: id, action: decided, from_status: 'pending', to_status: decided, acted_by: o.status === 'cancelled' ? s.userId : wardenOf(s), remarks: o.remarks || null, created_at: `${addDays(o.from, -2)} 17:30:00` });
    }
    if (o.returned) await ins('leave_history', { leave_id: id, action: 'returned', from_status: 'approved', to_status: 'returned', acted_by: wardenOf(s), created_at: o.returned });
    leaves.push({ id, studentId: s.id, ...o });
  };
  const dests = ['Madurai (home)', 'Coimbatore (home)', 'Tirunelveli (home)', 'Salem (home)', 'Chennai – IIT Madras workshop', 'Trichy (home)', 'Bengaluru – hackathon'];

  // Currently on approved leave (departed, not yet due back)
  for (const s of [R[2], R[17], R[33]]) {
    await make(s, { type: 'home', from: addDays(TODAY, -1), to: addDays(TODAY, 2), ret: `${addDays(TODAY, 2)} 19:00:00`, reason: 'Family function at native place', dest: pick(dests), status: 'approved', departed: dt(1, 16) });
  }
  // Overdue returns (approved, expected back yesterday, not returned)
  await make(R[6], { type: 'home', from: addDays(TODAY, -4), to: addDays(TODAY, -1), ret: `${addDays(TODAY, -1)} 18:00:00`, reason: 'Grandmother unwell', dest: 'Tirunelveli (home)', status: 'approved', departed: dt(4, 15) });
  await make(R[38], { type: 'medical', from: addDays(TODAY, -3), to: addDays(TODAY, -1), ret: `${addDays(TODAY, -1)} 20:00:00`, reason: 'Dental surgery follow-up', dest: 'Salem (home)', status: 'approved', departed: dt(3, 14) });
  // Pending approvals
  await make(R[10], { type: 'academic', from: addDays(TODAY, 2), to: addDays(TODAY, 4), ret: `${addDays(TODAY, 4)} 21:00:00`, reason: 'Smart India Hackathon regional round', dest: 'Bengaluru – hackathon', status: 'pending' });
  await make(R[25], { type: 'home', from: addDays(TODAY, 3), to: addDays(TODAY, 5), ret: `${addDays(TODAY, 5)} 19:00:00`, reason: 'Ayudha Pooja holidays at home', dest: 'Madurai (home)', status: 'pending' });
  await make(R[36], { type: 'personal', from: addDays(TODAY, 1), to: addDays(TODAY, 1), ret: `${addDays(TODAY, 1)} 20:00:00`, reason: 'Passport verification appointment', dest: 'Chennai – Passport Seva Kendra', status: 'pending' });
  // History: returned, rejected, cancelled
  for (const [k, s] of [R[1], R[4], R[12], R[20], R[30], R[40]].entries()) {
    const from = addDays(TODAY, -(12 + k * 3));
    await make(s, { type: pick(['home', 'home', 'medical', 'academic']), from, to: addDays(from, 2), ret: `${addDays(from, 2)} 19:00:00`, reason: 'Weekend visit home', dest: pick(dests), status: 'returned', departed: `${from} 16:00:00`, returned: `${addDays(from, 2)} 18:${10 + k}:00` });
  }
  await make(R[8], { type: 'personal', from: addDays(TODAY, -8), to: addDays(TODAY, -6), ret: `${addDays(TODAY, -6)} 19:00:00`, reason: 'Friend\'s birthday celebration', dest: 'Puducherry', status: 'rejected', remarks: 'Internal assessment tests scheduled on these dates' });
  await make(R[15], { type: 'home', from: addDays(TODAY, 6), to: addDays(TODAY, 8), ret: `${addDays(TODAY, 8)} 19:00:00`, reason: 'Home visit', dest: 'Erode (home)', status: 'cancelled', remarks: 'Plans changed' });
  return leaves;
}

async function seedAttendance(alloc, leaves, u) {
  const markers = { A: u.wardenBoys, B: u.elec, G: u.wardenGirls };
  const repeatAbsent = new Set([alloc.residents[13].id, alloc.residents[35].id]);
  const lowAttendance = alloc.residents[22].id;
  const leaveOn = (sid, date) => leaves.find((l) => l.studentId === sid && ['approved', 'returned'].includes(l.status) && date >= l.from && date <= l.to);
  const rows = [];
  for (const s of alloc.residents) {
    const a = alloc.allocations[s.id];
    const start = a.allocatedAt > addDays(TODAY, -30) ? a.allocatedAt : addDays(TODAY, -30);
    for (let d = start; d <= TODAY; d = addDays(d, 1)) {
      // Hostel B's roll call has not been taken today -> "attendance not marked" exceptions.
      if (d === TODAY && a.hostel === 'B') continue;
      const leave = leaveOn(s.id, d);
      const overdue = leaves.find((l) => l.studentId === s.id && l.status === 'approved' && l.to < TODAY && d > l.to);
      let status;
      if (leave) status = 'on_leave';
      else if (overdue) status = 'absent';
      else if (repeatAbsent.has(s.id) && d >= addDays(TODAY, -6) && [0, 2, 5].includes(Math.round((new Date(TODAY) - new Date(d)) / 86_400_000))) status = 'absent';
      else if (s.id === lowAttendance && chance(0.35)) status = 'absent';
      else {
        const r = rand();
        status = r < 0.9 ? 'present' : r < 0.94 ? 'late' : r < 0.975 ? 'absent' : 'out_pass';
      }
      const time = status === 'present' ? `${19 + Math.floor(rand() * 2)}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00` : status === 'late' ? `21:${String(35 + Math.floor(rand() * 20)).padStart(2, '0')}:00` : null;
      rows.push([s.id, a.hostelId, d, status, time, status === 'out_pass' ? 'Out-pass: industrial visit' : null, markers[a.hostel]]);
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    await q('INSERT INTO attendance (student_id, hostel_id, attendance_date, status, check_in_time, remarks, marked_by) VALUES ?', [rows.slice(i, i + 500)]);
  }
  return rows.length;
}

async function seedComplaints(alloc, u) {
  const R = alloc.residents.filter((s) => alloc.allocations[s.id]);
  const staffFor = { electrical: u.elec, plumbing: u.plumb, cleaning: u.care, internet: u.net, furniture: u.care, food: u.care, security: u.care, other: u.care };
  const sla = { critical: 4, high: 12, medium: 24, low: 72 };
  const C = [
    // [studentIdx, category, priority, title, description, status, createdHoursAgo, resolvedAfterHours, rating]
    [0, 'electrical', 'high', 'Ceiling fan not working', 'Fan stopped working since last night; room is very hot and we cannot sleep.', 'in_progress', 20, null],
    [3, 'plumbing', 'critical', 'Water leaking from bathroom pipe', 'Continuous leak from the pipe joint below the wash basin; floor is flooded.', 'assigned', 6, null],
    [5, 'internet', 'medium', 'Wi-Fi disconnects frequently', 'Wi-Fi drops every 10 minutes on the second floor, affecting online NPTEL exams.', 'in_progress', 30, null],
    [7, 'furniture', 'low', 'Cupboard lock broken', 'Cupboard lock does not close properly; need replacement.', 'assigned', 40, null],
    [9, 'cleaning', 'medium', 'Corridor not cleaned', 'Garbage bin overflowing near room 203 for two days.', 'pending', 3, null],
    [11, 'electrical', 'medium', 'Tube light flickering', 'Tube light flickers continuously in the study area.', 'pending', 1, null],
    [14, 'plumbing', 'high', 'No hot water in geyser', 'Geyser not heating water for the past day.', 'resolved', 26, 10, null],
    [16, 'internet', 'low', 'LAN port not working', 'LAN port near bed 2 is dead.', 'resolved', 50, 30, null],
    [18, 'electrical', 'high', 'Switch board sparking', 'Switch board near the door sparks when the switch is turned on.', 'closed', 120, 3, 5],
    [21, 'furniture', 'medium', 'Study table leg broken', 'One leg of the study table is broken.', 'closed', 200, 20, 4],
    [24, 'food', 'medium', 'Mess food quality in dinner', 'Chapathi served cold during dinner for the past three days.', 'closed', 150, 22, 3],
    [27, 'cleaning', 'low', 'Pest control needed', 'Cockroaches seen in the room cupboard area.', 'closed', 300, 60, 4],
    [30, 'plumbing', 'medium', 'Flush tank leaking', 'Flush tank keeps running and wastes water.', 'closed', 90, 12, 5],
    [32, 'other', 'low', 'Request extra dustbin', 'Requesting an additional dustbin for the room.', 'rejected', 70, null],
    [34, 'electrical', 'critical', 'Burning smell from socket', 'Burning smell from the plug socket while charging laptop.', 'in_progress', 9, null],
    [37, 'internet', 'high', 'Wi-Fi down on entire floor', 'No internet on the whole first floor since morning.', 'assigned', 14, null],
  ];
  const ids = [];
  for (const [idx, category, priority, title, description, status, createdH, resolvedAfter, rating] of C) {
    const s = R[idx % R.length];
    const a = alloc.allocations[s.id];
    const created = hoursAgo(createdH);
    const due = toDateTimeStr(new Date(NOW.getTime() - createdH * 3600_000 + sla[priority] * 3600_000));
    const assignee = status === 'pending' ? null : staffFor[category];
    const resolvedAt = resolvedAfter != null ? toDateTimeStr(new Date(NOW.getTime() - (createdH - resolvedAfter) * 3600_000)) : null;
    const id = await ins('complaints', {
      complaint_code: `TMP${digits(8)}`, student_id: s.id, hostel_id: a.hostelId, room_id: a.bed.roomId, category, priority, title, description, status,
      assigned_to: assignee, sla_hours: sla[priority], sla_due_at: due, resolved_at: resolvedAt,
      closed_at: ['closed', 'rejected'].includes(status) ? toDateTimeStr(new Date(NOW.getTime() - (createdH - (resolvedAfter || 5) - 6) * 3600_000)) : null,
      resolution_note: resolvedAt ? pick(['Replaced faulty part and tested', 'Repaired and verified with student', 'Issue fixed; monitoring for 24 hours']) : null,
      student_rating: rating || null, student_feedback: rating ? pick(['Quick response, thank you', 'Fixed properly', 'Took a while but resolved']) : null,
      created_at: created,
    });
    await q('UPDATE complaints SET complaint_code = ? WHERE id = ?', [`CMP${1000 + id}`, id]);
    const upd = (userId, from, to, type, note, at) => ins('complaint_updates', { complaint_id: id, user_id: userId, from_status: from, to_status: to, update_type: type, note, created_at: at });
    await upd(s.userId, null, 'pending', 'status', 'Complaint submitted', created);
    if (assignee) {
      const at = toDateTimeStr(new Date(new Date(created.replace(' ', 'T')).getTime() + 10 * 60_000));
      await ins('complaint_assignments', { complaint_id: id, assigned_to: assignee, assigned_by: null, assigned_at: at });
      await upd(null, 'pending', 'assigned', 'assignment', 'Auto-assigned (skill match / lowest workload)', at);
    }
    if (['in_progress', 'resolved', 'closed'].includes(status)) await upd(assignee, 'assigned', 'in_progress', 'status', 'Inspected the issue; work started', toDateTimeStr(new Date(new Date(created.replace(' ', 'T')).getTime() + 60 * 60_000)));
    if (resolvedAt) await upd(assignee, 'in_progress', 'resolved', 'status', 'Issue fixed', resolvedAt);
    if (status === 'closed') await upd(s.userId, 'resolved', 'closed', 'feedback', `Confirmed resolved (rated ${rating}/5)`, toDateTimeStr(new Date(new Date(resolvedAt.replace(' ', 'T')).getTime() + 5 * 3600_000)));
    if (status === 'rejected') await upd(alloc.allocations[s.id].hostel === 'G' ? u.wardenGirls : u.wardenBoys, 'pending', 'rejected', 'status', 'Standard allocation is one dustbin per room as per hostel rules', hoursAgo(createdH - 4));
    ids.push({ id, status, category, hostelId: a.hostelId, roomId: a.bed.roomId });
  }
  return ids;
}

async function seedMaintenance(ctx, alloc, complaints) {
  const { u, H, rooms } = ctx;
  const mk = async (o) => {
    const id = await ins('maintenance_requests', { request_code: `TMP${digits(8)}`, ...o });
    await q('UPDATE maintenance_requests SET request_code = ? WHERE id = ?', [`MNT${1000 + id}`, id]);
    return id;
  };
  await mk({ hostel_id: H.A, room_id: alloc.maintenanceRoom, category: 'structural', priority: 'high', title: 'Room 301 ceiling waterproofing', description: 'Seepage through ceiling after monsoon rain; room vacated for waterproofing.', blocks_room: 1, status: 'in_progress', assigned_to: u.care, requested_by: u.wardenBoys, started_at: dt(4, 9), created_at: dt(5, 10) });
  const fan = complaints.find((c) => c.category === 'electrical' && c.status === 'in_progress');
  await mk({ hostel_id: fan.hostelId, room_id: fan.roomId, complaint_id: fan.id, category: 'electrical', priority: 'high', title: 'Replace ceiling fan capacitor', description: 'Linked to complaint – fan capacitor failed.', status: 'open', assigned_to: u.elec, requested_by: u.wardenBoys, created_at: hoursAgo(18) });
  await mk({ hostel_id: H.G, room_id: rooms['G-202'], category: 'furniture', priority: 'medium', title: 'Replace broken cot (bed B4)', description: 'Cot frame cracked; bed blocked until replacement arrives.', status: 'open', assigned_to: u.care, requested_by: u.wardenGirls, created_at: dt(6, 11) });
  await mk({ hostel_id: H.B, room_id: rooms['B-102'], category: 'plumbing', priority: 'medium', title: 'Bathroom tap replacement', description: 'Replaced worn-out taps in attached bathroom.', status: 'completed', assigned_to: u.plumb, requested_by: u.wardenBoys, started_at: dt(10, 10), completed_at: dt(9, 16), cost: 1850, notes: 'Two taps replaced (Jaquar)', created_at: dt(11, 9) });
  await mk({ hostel_id: H.A, room_id: null, category: 'pest_control', priority: 'low', title: 'Quarterly pest control – Hostel A', description: 'Scheduled quarterly pest control for all floors.', status: 'completed', assigned_to: u.care, requested_by: u.admin, started_at: dt(15, 9), completed_at: dt(15, 17), cost: 6500, notes: 'Completed by vendor', created_at: dt(18, 9) });
  await mk({ hostel_id: H.G, room_id: null, category: 'internet', priority: 'medium', title: 'Install additional Wi-Fi access point – 2nd floor', description: 'Weak signal reported in rooms 201–203.', status: 'open', assigned_to: u.net, requested_by: u.wardenGirls, created_at: dt(2, 12) });
}

async function seedVisitors(alloc, u) {
  const R = alloc.residents;
  const people = [
    ['Subramanian R', '9443012345', 'aadhaar', '4521 8890 1123', 'Father'], ['Lakshmi S', '9443012346', 'aadhaar', '7712 3345 8890', 'Mother'],
    ['Rajesh K', '9443012347', 'driving_license', 'TN58 20190012345', 'Brother'], ['Abdul Rahman M', '9443012348', 'voter_id', 'TNV1234567', 'Father'],
    ['Meena P', '9443012349', 'aadhaar', '3321 7789 4456', 'Mother'], ['Joseph D', '9443012350', 'passport', 'R1234567', 'Father'],
    ['Kavitha V', '9443012351', 'aadhaar', '9987 1123 5567', 'Aunt'], ['Prakash N', '9443012352', 'driving_license', 'TN33 20170054321', 'Uncle'],
    ['Saranya G', '9443012353', 'college_id', 'DIET-ALU-2019-221', 'Sister'], ['Venkatesh T', '9443012354', 'aadhaar', '6654 2219 0098', 'Guardian'],
  ];
  const vids = [];
  for (const [name, phone, t, n] of people) vids.push(await ins('visitors', { name, phone, id_proof_type: t, id_proof_number: n }));
  const gate = (s) => (alloc.allocations[s.id].hostel === 'G' ? u.secGirls : u.secBoys);
  let n = 0;
  const entry = async (vi, s, o) => {
    n += 1;
    const id = await ins('visitor_entries', {
      pass_code: `TMP${n}${digits(6)}`, visitor_id: vids[vi], student_id: s.id, hostel_id: alloc.allocations[s.id].hostelId, relationship: people[vi][4],
      purpose: o.purpose || pick(['Parent visit', 'Delivering home food and essentials', 'Fee payment discussion with warden', 'Medical check-up accompaniment']),
      expected_at: o.expected || null, entry_time: o.entry || null, exit_time: o.exit || null, status: o.status,
      approved_by: o.status === 'expected' && o.byStudent ? null : gate(s), checked_in_by: o.entry ? gate(s) : null, checked_out_by: o.exit ? gate(s) : null,
      created_at: o.created || o.entry || o.expected || hoursAgo(5),
    });
    await q('UPDATE visitor_entries SET pass_code = ? WHERE id = ?', [`VP${1000 + id}`, id]);
  };
  // Currently inside (one has been inside > 3 hours)
  await entry(0, R[0], { status: 'checked_in', entry: hoursAgo(3.5) });
  await entry(1, R[30], { status: 'checked_in', entry: hoursAgo(0.75) });
  await entry(2, R[11], { status: 'checked_in', entry: hoursAgo(0.3) });
  // Checked out today
  await entry(3, R[5], { status: 'checked_out', entry: hoursAgo(5), exit: hoursAgo(4) });
  await entry(4, R[34], { status: 'checked_out', entry: hoursAgo(4), exit: hoursAgo(3.2) });
  // Expected today (pre-registered)
  await entry(5, R[20], { status: 'expected', expected: hoursAhead(2), byStudent: true, created: hoursAgo(20) });
  await entry(6, R[39], { status: 'expected', expected: hoursAhead(3), byStudent: true, created: hoursAgo(26) });
  await entry(7, R[9], { status: 'expected', expected: hoursAhead(1), created: hoursAgo(3) });
  // History
  for (let d = 2; d <= 12; d += 2) {
    const s = R[(d * 3) % R.length];
    await entry(d % 10, s, { status: 'checked_out', entry: dt(d, 11, 15), exit: dt(d, 13, 40) });
  }
  await entry(8, R[24], { status: 'cancelled', expected: dt(1, 15), created: dt(2, 10) });
}

async function seedActivitiesAndAnnouncements(ctx, alloc) {
  const { u, H } = ctx;
  const acts = [
    { hostel_id: null, title: 'Inter-Hostel Cricket Tournament', description: 'T10 format; teams of 11 from each hostel. Register by Friday.', category: 'sports', venue: 'Main Ground', start_at: dt(-5, 7), end_at: dt(-5, 12), max_participants: 66, created_by: u.admin },
    { hostel_id: H.G, title: 'Navaratri Golu & Cultural Evening', description: 'Kolu display, Bharatanatyam and music performances by residents.', category: 'cultural', venue: 'Girls Hostel Courtyard', start_at: dt(-2, 18), end_at: dt(-2, 21), max_participants: null, created_by: u.wardenGirls },
    { hostel_id: H.A, title: 'Hostel Committee Meeting – Mess Feedback', description: 'Monthly mess committee meeting. Floor representatives must attend.', category: 'meeting', venue: 'Hostel A Reading Room', start_at: dt(-1, 19), end_at: dt(-1, 20), max_participants: 20, created_by: u.wardenBoys },
    { hostel_id: null, title: 'Tech Talk: Cracking Product-Company Interviews', description: 'Alumni session by a senior engineer; Q&A on DSA and system design.', category: 'technical', venue: 'Seminar Hall 2', start_at: dt(9, 18), end_at: dt(9, 20), max_participants: 120, status: 'completed', created_by: u.admin },
  ];
  for (const a of acts) {
    const id = await ins('activities', a);
    const pool = alloc.residents.filter((s) => !a.hostel_id || alloc.allocations[s.id].hostelId === a.hostel_id);
    for (const s of pool.filter(() => chance(0.35))) await ins('activity_participants', { activity_id: id, student_id: s.id, attended: a.status === 'completed' ? (chance(0.8) ? 1 : 0) : 0 });
  }
  const anns = [
    { hostel_id: null, title: 'DEMO DATA NOTICE', body: 'This installation contains development/demo seed data for the Demo Institute of Engineering & Technology. Names, phone numbers and records are fictitious.', priority: 'important', audience: 'all', published_by: u.admin, published_at: dt(30, 9) },
    { hostel_id: null, title: 'Hostel Fee Term II due this week', body: `Term II hostel and mess fee is due on ${addDays(TODAY, 4)}. Pay via the college fee portal or at the accounts office and share the transaction ID with the hostel office.`, priority: 'important', audience: 'students', published_by: u.admin, published_at: dt(5, 10) },
    { hostel_id: H.A, title: 'Water supply interruption – Saturday', body: 'Overhead tank cleaning on Saturday 10 AM – 2 PM. Please store water in advance.', priority: 'normal', audience: 'all', published_by: u.wardenBoys, published_at: dt(2, 18), expires_at: dt(-4, 23) },
    { hostel_id: H.G, title: 'Gate timing reminder', body: 'Hostel gate closes at 9:30 PM. Late entries require warden approval and will be recorded.', priority: 'urgent', audience: 'students', published_by: u.wardenGirls, published_at: dt(1, 20) },
    { hostel_id: null, title: 'Semester model exams schedule', body: 'Model examinations begin next month. Study halls in all hostels will remain open until midnight.', priority: 'normal', audience: 'students', published_by: u.admin, published_at: dt(7, 11) },
  ];
  for (const a of anns) await ins('announcements', a);
}

async function main() {
  const started = Date.now();
  const tables = (await db.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [env.db.database]))[0];
  if (!tables || tables.n === 0) throw new Error('Schema not found. Run "npm run db:setup" first.');
  const existing = await db.one('SELECT COUNT(*) AS n FROM users');
  if (existing.n > 0 && !process.argv.includes('--force')) {
    console.log('Database already contains data. Use "npm run db:reset" to rebuild with fresh demo data.');
    await db.pool.end();
    return;
  }
  conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    console.log('Seeding DEMO data (development only)...');
    await seedAccess();
    const userCtx = await seedUsers();
    const deptIds = await seedDepartments();
    const hostelCtx = await seedHostels(userCtx.u);
    const ctx = { ...userCtx, ...hostelCtx };
    const students = await seedStudents(userCtx, deptIds);
    await seedParents(students, userCtx.u.admin);
    const alloc = await seedAdmissionsAndAllocations(students, ctx);
    await seedFees(students, ctx, alloc);
    const leaves = await seedLeaves(alloc, ctx.u);
    const attendanceRows = await seedAttendance(alloc, leaves, ctx.u);
    const complaints = await seedComplaints(alloc, ctx.u);
    await seedMaintenance(ctx, alloc, complaints);
    await seedVisitors(alloc, ctx.u);
    await seedActivitiesAndAnnouncements(ctx, alloc);
    await ins('audit_logs', { user_id: null, user_name: 'system', user_role: 'system', action: 'SEED_DATA', module: 'system', summary: 'Development/demo seed data loaded' });
    await conn.commit();
    console.log(`  students: ${students.length} (${alloc.residents.length} residents), attendance rows: ${attendanceRows}, complaints: ${complaints.length}`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Run the real automation once so SLA escalations, overdue alerts and exceptions exist.
  const jobs = require('../src/jobs/scheduler');
  const { scanExceptions } = require('../src/modules/attendance/attendance.service');
  for (let d = 6; d >= 1; d -= 1) await scanExceptions(addDays(TODAY, -d));
  const result = await jobs.runAll();
  console.log('  automation:', JSON.stringify(result));
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
  console.log('Demo logins (development only):');
  console.log(`  Super Admin : admin@${DEMO_DOMAIN} / Admin@123`);
  console.log(`  Warden      : warden.boys@${DEMO_DOMAIN} / Warden@123   (also warden.girls@)`);
  console.log(`  Staff       : electrician@${DEMO_DOMAIN} / Staff@123    (plumber@, caretaker@, network@)`);
  console.log(`  Security    : security.boys@${DEMO_DOMAIN} / Security@123 (security.girls@)`);
  const sample = await db.one("SELECT email FROM students WHERE hostel_status = 'resident' ORDER BY id LIMIT 1");
  console.log(`  Student     : ${sample.email} / Student@123  (all 50 students use Student@123)`);
  console.log(`  Parent      : parent.711123104001@${DEMO_DOMAIN} / Parent@123  (parent of Arun & Harini; every student has parent.<register no>@)`);
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  if (process.env.DEBUG) console.error(err);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
