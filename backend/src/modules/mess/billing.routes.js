const router = require('express').Router();
const { z } = require('zod');
const PDFDocument = require('pdfkit');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, badRequest, conflict, forbidden } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { currentAcademicYear, toDateStr, tempCode, assignCode } = require('../../utils/helpers');

router.use(authenticate);

function isStaffOrWarden(user) {
  return ['super_admin', 'warden', 'staff'].includes(user.role);
}

/**
 * GET /api/mess/billing/rules
 * Fetch active rules for a month
 */
router.get('/rules', async (req, res) => {
  const my = req.query.monthYear || toDateStr().slice(0, 7);
  const rule = await db.one(
    'SELECT * FROM mess_bill_rules WHERE month_year = ? AND status = "active" LIMIT 1',
    [my]
  );
  if (rule) return ok(res, rule);

  // Return fallback defaults
  ok(res, {
    academic_year: currentAcademicYear(),
    month_year: my,
    student_per_day_rate: 150.00,
    staff_per_day_rate: 120.00,
    session_weight: 0.50,
    charge_present: 1,
    charge_absent: 1,
    charge_leave: 0,
    charge_medical_leave: 0,
    charge_on_duty: 0,
    min_leave_days_for_rebate: 1,
    other_charges: 0.00,
    status: 'active',
  });
});

/**
 * PUT /api/mess/billing/rules
 * Update or insert rules for a month
 */
router.put('/rules', authorize('fees.manage'), async (req, res) => {
  const b = z.object({
    academicYear: z.string().regex(/^\d{4}-\d{2}$/).default(currentAcademicYear()),
    monthYear: z.string().regex(/^\d{4}-\d{2}$/),
    studentPerDayRate: z.coerce.number().min(0).max(10000),
    staffPerDayRate: z.coerce.number().min(0).max(10000),
    sessionWeight: z.coerce.number().min(0.1).max(1.0).default(0.5),
    chargePresent: z.boolean().default(true),
    chargeAbsent: z.boolean().default(true),
    chargeLeave: z.boolean().default(false),
    minLeaveDaysForRebate: z.coerce.number().int().min(0).default(1),
    otherCharges: z.coerce.number().min(0).default(0),
  }).parse(req.body);

  await db.query(
    `INSERT INTO mess_bill_rules 
     (academic_year, month_year, student_per_day_rate, staff_per_day_rate, session_weight, charge_present, charge_absent, charge_leave, min_leave_days_for_rebate, other_charges, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       student_per_day_rate = VALUES(student_per_day_rate),
       staff_per_day_rate = VALUES(staff_per_day_rate),
       session_weight = VALUES(session_weight),
       charge_present = VALUES(charge_present),
       charge_absent = VALUES(charge_absent),
       charge_leave = VALUES(charge_leave),
       min_leave_days_for_rebate = VALUES(min_leave_days_for_rebate),
       other_charges = VALUES(other_charges),
       created_by = VALUES(created_by)`,
    [
      b.academicYear, b.monthYear, b.studentPerDayRate, b.staffPerDayRate,
      b.sessionWeight, b.chargePresent ? 1 : 0, b.chargeAbsent ? 1 : 0,
      b.chargeLeave ? 1 : 0, b.minLeaveDaysForRebate, b.otherCharges, req.user.id,
    ]
  );

  await audit(req, {
    action: 'MESS_BILL_RULE_SAVED',
    module: 'mess',
    summary: `Saved billing rules for ${b.monthYear}: Student ₹${b.studentPerDayRate}/day, Staff ₹${b.staffPerDayRate}/day`,
    newValue: b,
  });

  ok(res, { success: true, ...b });
});

/**
 * GET /api/mess/billing/bills
 * List generated bills
 */
router.get('/bills', async (req, res) => {
  const rows = await db.query(
    `SELECT mb.*, u.name AS generated_by_name, h.name AS hostel_name
       FROM mess_bills mb
       LEFT JOIN users u ON u.id = mb.generated_by
       LEFT JOIN hostels h ON h.id = mb.hostel_id
      ORDER BY mb.created_at DESC`
  );
  ok(res, rows);
});

/**
 * GET /api/mess/billing/bills/:id
 * Get bill with line items
 */
router.get('/bills/:id', async (req, res) => {
  const id = Number(req.params.id);
  const bill = await db.one(
    `SELECT mb.*, u.name AS generated_by_name, h.name AS hostel_name
       FROM mess_bills mb
       LEFT JOIN users u ON u.id = mb.generated_by
       LEFT JOIN hostels h ON h.id = mb.hostel_id
      WHERE mb.id = ?`,
    [id]
  );
  if (!bill) throw notFound('Mess bill');

  let items = [];
  if (bill.bill_type === 'student') {
    items = await db.query(
      `SELECT mbi.*, s.name AS member_name, s.register_number, s.student_type,
              r.room_number, d.short_name AS department
         FROM mess_bill_items mbi
         JOIN students s ON s.id = mbi.student_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
         LEFT JOIN rooms r ON r.id = ra.room_id
         JOIN departments d ON d.id = s.department_id
        WHERE mbi.mess_bill_id = ?
        ORDER BY r.room_number, s.name`,
      [id]
    );
  } else {
    items = await db.query(
      `SELECT mbi.*, u.name AS member_name, u.email, u.designation
         FROM mess_bill_items mbi
         JOIN users u ON u.id = mbi.staff_user_id
        WHERE mbi.mess_bill_id = ?
        ORDER BY u.name`,
      [id]
    );
  }

  ok(res, { bill, items });
});

/**
 * POST /api/mess/billing/preview
 * 1-Click Bill Generation (Preview Mode)
 */
router.post('/preview', authorize('fees.manage'), async (req, res) => {
  const b = z.object({
    monthYear: z.string().regex(/^\d{4}-\d{2}$/),
    academicYear: z.string().regex(/^\d{4}-\d{2}$/).default(currentAcademicYear()),
    billType: z.enum(['student', 'staff']).default('student'),
    hostelId: z.coerce.number().int().positive().optional().nullable(),
  }).parse(req.body);

  // 1. Get active rule
  const rule = await db.one(
    'SELECT * FROM mess_bill_rules WHERE month_year = ? AND status = "active" LIMIT 1',
    [b.monthYear]
  ) || {
    student_per_day_rate: 150.00,
    staff_per_day_rate: 120.00,
    session_weight: 0.50,
    charge_present: 1,
    charge_absent: 1,
    charge_leave: 0,
    other_charges: 0.00,
  };

  const rate = b.billType === 'student' ? Number(rule.student_per_day_rate) : Number(rule.staff_per_day_rate);
  const sessionWeight = Number(rule.session_weight || 0.5);

  const billCode = `MB-${b.monthYear}-${b.billType.toUpperCase()}-${tempCode()}`;

  const result = await db.transaction(async (conn) => {
    // Delete any previous draft/preview for this month & type
    const prev = await db.one('SELECT id FROM mess_bills WHERE month_year = ? AND bill_type = ? AND status = "preview"', [b.monthYear, b.billType], conn);
    if (prev) {
      await conn.query('DELETE FROM mess_bill_items WHERE mess_bill_id = ?', [prev.id]);
      await conn.query('DELETE FROM mess_bills WHERE id = ?', [prev.id]);
    }

    const [billRes] = await conn.query(
      `INSERT INTO mess_bills (bill_code, academic_year, month_year, bill_type, hostel_id, per_day_rate, status, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'preview', ?)`,
      [billCode, b.academicYear, b.monthYear, b.billType, b.hostelId || null, rate, req.user.id]
    );
    const billId = billRes.insertId;

    let items = [];
    let grandTotal = 0;
    let grandChargeableDays = 0;
    let grandSessions = 0;

    if (b.billType === 'student') {
      // Fetch all resident students
      let studentSql = `
        SELECT s.id AS student_id, s.name, s.register_number, ra.hostel_id, r.room_number
          FROM students s
          JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
          LEFT JOIN rooms r ON r.id = ra.room_id
         WHERE s.deleted_at IS NULL
      `;
      const sParams = [];
      if (b.hostelId) { studentSql += ' AND ra.hostel_id = ?'; sParams.push(b.hostelId); }
      const residents = await db.query(studentSql, sParams, conn);

      // Fetch all session attendance for this month
      const attendanceRows = await db.query(
        `SELECT student_id, session, status
           FROM attendance_sessions
          WHERE DATE_FORMAT(attendance_date, '%Y-%m') = ?`,
        [b.monthYear],
        conn
      );

      const attMap = new Map();
      attendanceRows.forEach((r) => {
        if (!attMap.has(r.student_id)) attMap.set(r.student_id, []);
        attMap.get(r.student_id).push(r);
      });

      // Default sessions in month (days * 2) if no session recorded yet
      const [year, month] = b.monthYear.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const defaultTotalSessions = daysInMonth * 2;

      for (const res of residents) {
        const studentAtt = attMap.get(res.student_id) || [];
        const hasSessionData = studentAtt.length > 0;

        const totalSess = hasSessionData ? studentAtt.length : defaultTotalSessions;
        const presentSess = hasSessionData ? studentAtt.filter((a) => a.status === 'Present').length : defaultTotalSessions;
        const absentSess = hasSessionData ? studentAtt.filter((a) => a.status === 'Absent').length : 0;
        const leaveSess = hasSessionData ? studentAtt.filter((a) => ['Leave', 'Medical Leave', 'On Duty'].includes(a.status)).length : 0;

        let chargeableSess = (presentSess * (rule.charge_present ? 1 : 0)) +
                             (absentSess * (rule.charge_absent ? 1 : 0)) +
                             (leaveSess * (rule.charge_leave ? 1 : 0));

        const chargeableDays = Number((chargeableSess * sessionWeight).toFixed(2));
        const messAmount = Number((chargeableDays * rate).toFixed(2));
        const rebateAmount = 0.00; // Handled per rule
        const netAmount = messAmount - rebateAmount + Number(rule.other_charges || 0);

        grandTotal += netAmount;
        grandChargeableDays += chargeableDays;
        grandSessions += totalSess;

        items.push([
          billId, res.student_id, null, totalSess, presentSess, absentSess, leaveSess,
          chargeableSess, chargeableDays, rate, messAmount, rebateAmount, netAmount, null
        ]);
      }
    } else {
      // Staff mess billing
      const staffList = await db.query(
        `SELECT u.id AS staff_user_id, u.name, u.email, u.designation
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.name = 'staff' AND u.deleted_at IS NULL`,
        [], conn
      );

      const staffAttRows = await db.query(
        `SELECT user_id, session, status
           FROM mess_staff_attendance
          WHERE DATE_FORMAT(attendance_date, '%Y-%m') = ?`,
        [b.monthYear], conn
      );
      const staffAttMap = new Map();
      staffAttRows.forEach((r) => {
        if (!staffAttMap.has(r.user_id)) staffAttMap.set(r.user_id, []);
        staffAttMap.get(r.user_id).push(r);
      });

      const [year, month] = b.monthYear.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const defaultTotalSessions = Math.min(26 * 2, daysInMonth * 2);

      for (const st of staffList) {
        const userAtt = staffAttMap.get(st.staff_user_id) || [];
        const hasData = userAtt.length > 0;
        const totalSess = hasData ? userAtt.length : defaultTotalSessions;
        const presentSess = hasData ? userAtt.filter((a) => a.status === 'Present').length : defaultTotalSessions;
        const absentSess = hasData ? userAtt.filter((a) => a.status === 'Absent').length : 0;

        const chargeableSess = presentSess;
        const chargeableDays = Number((chargeableSess * sessionWeight).toFixed(2));
        const netAmount = Number((chargeableDays * rate).toFixed(2));

        grandTotal += netAmount;
        grandChargeableDays += chargeableDays;
        grandSessions += totalSess;

        items.push([
          billId, null, st.staff_user_id, totalSess, presentSess, absentSess, 0,
          chargeableSess, chargeableDays, rate, netAmount, 0, netAmount, null
        ]);
      }
    }

    if (items.length) {
      await conn.query(
        `INSERT INTO mess_bill_items 
         (mess_bill_id, student_id, staff_user_id, total_sessions, present_sessions, absent_sessions, leave_sessions, chargeable_sessions, chargeable_days, daily_rate, mess_amount, rebate_amount, net_amount, student_fee_id)
         VALUES ?`,
        [items]
      );
    }

    // Update bill summary
    await conn.query(
      `UPDATE mess_bills 
          SET total_members = ?, total_sessions = ?, total_chargeable_days = ?, total_amount = ?
        WHERE id = ?`,
      [items.length, grandSessions, grandChargeableDays, grandTotal, billId]
    );

    return { billId, billCode, totalMembers: items.length, totalAmount: grandTotal, status: 'preview' };
  });

  created(res, result);
});

/**
 * PATCH /api/mess/billing/:id/confirm
 * Warden confirms previewed bill
 */
router.patch('/:id/confirm', authorize('fees.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const bill = await db.one('SELECT * FROM mess_bills WHERE id = ?', [id]);
  if (!bill) throw notFound('Mess bill');
  if (bill.status !== 'preview') throw conflict(`Bill is already ${bill.status}`, 'INVALID_STATUS');

  await db.query('UPDATE mess_bills SET status = "confirmed" WHERE id = ?', [id]);
  await audit(req, {
    action: 'MESS_BILL_CONFIRMED',
    module: 'mess',
    recordId: id,
    summary: `Confirmed mess bill ${bill.bill_code} (₹${bill.total_amount})`,
  });

  ok(res, { id, status: 'confirmed' });
});

/**
 * POST /api/mess/billing/:id/publish
 * 1-Click Publish: Adds amount to student ledger via a NEW, separate entry; never modifies existing rows!
 */
router.post('/:id/publish', authorize('fees.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const bill = await db.one('SELECT * FROM mess_bills WHERE id = ?', [id]);
  if (!bill) throw notFound('Mess bill');
  if (bill.status === 'published') throw conflict('This mess bill is already published', 'ALREADY_PUBLISHED');

  const items = await db.query('SELECT * FROM mess_bill_items WHERE mess_bill_id = ?', [id]);

  const result = await db.transaction(async (conn) => {
    let ledgerEntriesCount = 0;
    const dueDate = toDateStr(new Date(Date.now() + 15 * 86400000)); // 15 days due date

    if (bill.bill_type === 'student') {
      for (const it of items) {
        if (!it.student_id || it.net_amount <= 0) continue;

        // Insert separate, non-destructive row into student_fees
        const remarks = `Mess Bill: ${bill.month_year} (${bill.bill_code}) - ${it.chargeable_days} days`;
        const [feeRes] = await conn.query(
          `INSERT INTO student_fees 
           (student_id, academic_year, total_amount, discount, amount_paid, due_date, remarks, assigned_by)
           VALUES (?, ?, ?, 0, 0, ?, ?, ?)`,
          [it.student_id, bill.academic_year, it.net_amount, dueDate, remarks, req.user.id]
        );

        await conn.query('UPDATE mess_bill_items SET student_fee_id = ? WHERE id = ?', [feeRes.insertId, it.id]);
        ledgerEntriesCount += 1;

        // Notify student
        const student = await db.one('SELECT user_id, name FROM students WHERE id = ?', [it.student_id], conn);
        if (student?.user_id) {
          await notify(student.user_id, {
            type: 'fee_assigned',
            title: `Mess Bill Published (${bill.month_year})`,
            message: `Your mess bill for ${bill.month_year} is ₹${it.net_amount.toLocaleString('en-IN')}. Due date: ${dueDate}.`,
            link: '/my/fees',
          }, conn);
        }
      }
    }

    await conn.query(
      'UPDATE mess_bills SET status = "published", published_at = NOW(), due_date = ? WHERE id = ?',
      [dueDate, id]
    );

    await audit(req, {
      action: 'MESS_BILL_PUBLISHED',
      module: 'mess',
      recordId: id,
      summary: `Published mess bill ${bill.bill_code}: ₹${bill.total_amount} posted to ${ledgerEntriesCount} student ledgers`,
      newValue: { billCode: bill.bill_code, totalAmount: bill.total_amount, ledgerEntriesCount },
    }, conn);

    return { billId: id, status: 'published', ledgerEntriesCount, totalAmount: bill.total_amount };
  });

  ok(res, result);
});

/**
 * GET /api/mess/billing/:id/pdf
 * Official College PDF Mess Bill Statement
 */
router.get('/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  const bill = await db.one('SELECT * FROM mess_bills WHERE id = ?', [id]);
  if (!bill) throw notFound('Mess bill');

  let items = [];
  if (bill.bill_type === 'student') {
    items = await db.query(
      `SELECT mbi.*, s.name AS member_name, s.register_number, r.room_number, d.short_name AS department
         FROM mess_bill_items mbi
         JOIN students s ON s.id = mbi.student_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
         LEFT JOIN rooms r ON r.id = ra.room_id
         JOIN departments d ON d.id = s.department_id
        WHERE mbi.mess_bill_id = ?
        ORDER BY r.room_number, s.name`,
      [id]
    );
  } else {
    items = await db.query(
      `SELECT mbi.*, u.name AS member_name, u.email, u.designation
         FROM mess_bill_items mbi
         JOIN users u ON u.id = mbi.staff_user_id
        WHERE mbi.mess_bill_id = ?
        ORDER BY u.name`,
      [id]
    );
  }

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const filename = `${bill.bill_code}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);

  // College Header
  doc.fillColor('#0f2042').fontSize(14).font('Helvetica-Bold')
    .text('NADAR SARASWATHI COLLEGE OF ENGINEERING & TECHNOLOGY', { align: 'center' });
  doc.fillColor('#475569').fontSize(10).font('Helvetica')
    .text('Vadapudupatti, Annanji Post, Theni - 625 531, Tamil Nadu', { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor('#0284c7').fontSize(12).font('Helvetica-Bold')
    .text(`HOSTEL MESS BILL STATEMENT — ${bill.bill_type.toUpperCase()}S`, { align: 'center' });
  doc.moveDown(0.5);

  // Bill Meta
  const leftX = 36;
  const rightX = 350;
  const metaY = doc.y;

  doc.fillColor('#1e293b').fontSize(9).font('Helvetica')
    .text(`Bill Code: ${bill.bill_code}`, leftX, metaY)
    .text(`Billing Month: ${bill.month_year}`, leftX, metaY + 14)
    .text(`Academic Year: ${bill.academic_year}`, leftX, metaY + 28);

  doc.text(`Per Day Rate: ₹${bill.per_day_rate}`, rightX, metaY)
    .text(`Total Members: ${bill.total_members}`, rightX, metaY + 14)
    .text(`Status: ${bill.status.toUpperCase()}`, rightX, metaY + 28);

  doc.y = metaY + 48;
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
  doc.moveDown(0.5);

  // Table Columns
  const cols = [
    { label: '#', x: 38, w: 20 },
    { label: bill.bill_type === 'student' ? 'Reg No' : 'Staff Email', x: 60, w: 90 },
    { label: 'Name', x: 155, w: 140 },
    { label: 'Room', x: 300, w: 45 },
    { label: 'Sessions', x: 350, w: 50, align: 'right' },
    { label: 'Days', x: 405, w: 45, align: 'right' },
    { label: 'Rate', x: 455, w: 40, align: 'right' },
    { label: 'Amount (₹)', x: 500, w: 55, align: 'right' },
  ];

  const tableHeader = () => {
    const y = doc.y;
    doc.rect(36, y, 523, 16).fill('#1e3a8a');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    cols.forEach((c) => {
      doc.text(c.label, c.x, y + 4, { width: c.w, align: c.align || 'left' });
    });
    doc.y = y + 18;
  };

  tableHeader();
  doc.font('Helvetica').fontSize(8);

  items.forEach((item, index) => {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      tableHeader();
      doc.font('Helvetica').fontSize(8);
    }

    const y = doc.y;
    if (index % 2 === 1) {
      doc.rect(36, y - 1, 523, 14).fill('#f8fafc');
    }
    doc.fillColor('#1e293b');

    doc.text(String(index + 1), cols[0].x, y + 2, { width: cols[0].w });
    doc.text(bill.bill_type === 'student' ? (item.register_number || '—') : (item.email || '—'), cols[1].x, y + 2, { width: cols[1].w, ellipsis: true });
    doc.text(item.member_name || '—', cols[2].x, y + 2, { width: cols[2].w, ellipsis: true });
    doc.text(item.room_number ? String(item.room_number) : '—', cols[3].x, y + 2, { width: cols[3].w });
    doc.text(String(item.chargeable_sessions), cols[4].x, y + 2, { width: cols[4].w, align: 'right' });
    doc.text(String(item.chargeable_days), cols[5].x, y + 2, { width: cols[5].w, align: 'right' });
    doc.text(`₹${Number(item.daily_rate).toFixed(0)}`, cols[6].x, y + 2, { width: cols[6].w, align: 'right' });
    doc.text(`₹${Number(item.net_amount).toLocaleString('en-IN')}`, cols[7].x, y + 2, { width: cols[7].w, align: 'right' });

    doc.y = y + 14;
  });

  // Grand Total Box
  doc.moveDown(0.5);
  doc.rect(36, doc.y, 523, 20).fill('#e2e8f0');
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold')
    .text('GRAND TOTAL', 48, doc.y + 5)
    .text(`₹${Number(bill.total_amount).toLocaleString('en-IN')}`, 450, doc.y + 5, { width: 105, align: 'right' });

  // Signatures
  doc.moveDown(3);
  const signY = Math.min(doc.y, doc.page.height - 70);
  doc.fillColor('#64748b').fontSize(8).font('Helvetica')
    .text('Prepared by: Mess Manager', 48, signY)
    .text('Verified by: Deputy Warden', 230, signY)
    .text('Approved by: Chief Warden / Principal', 390, signY);

  doc.end();
});

/**
 * GET /api/mess/billing/staff-attendance
 * Staff mess attendance list for date
 */
router.get('/staff-attendance', async (req, res) => {
  const date = req.query.date || toDateStr();
  const session = req.query.session || 'Morning';

  const staffUsers = await db.query(
    `SELECT u.id AS user_id, u.name, u.email, u.designation
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'staff' AND u.deleted_at IS NULL
      ORDER BY u.name`
  );

  const existingMarks = await db.query(
    'SELECT * FROM mess_staff_attendance WHERE attendance_date = ? AND session = ?',
    [date, session]
  );
  const markMap = new Map();
  existingMarks.forEach((m) => markMap.set(m.user_id, m));

  const list = staffUsers.map((st) => {
    const mark = markMap.get(st.user_id);
    return {
      userId: st.user_id,
      name: st.name,
      email: st.email,
      designation: st.designation || 'Staff',
      status: mark ? mark.status : 'Present',
      remarks: mark ? mark.remarks : '',
      isMarked: Boolean(mark),
    };
  });

  ok(res, { date, session, staff: list });
});

/**
 * POST /api/mess/billing/staff-attendance
 * Batch mark staff mess attendance
 */
router.post('/staff-attendance', authorize('fees.manage', 'attendance.mark'), async (req, res) => {
  const b = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    session: z.enum(['Morning', 'Evening']),
    records: z.array(z.object({
      userId: z.coerce.number().int().positive(),
      status: z.enum(['Present', 'Absent']),
      remarks: z.string().trim().max(255).optional().nullable(),
    })).min(1),
  }).parse(req.body);

  for (const r of b.records) {
    await db.query(
      `INSERT INTO mess_staff_attendance (user_id, attendance_date, session, status, remarks, marked_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks), marked_by = VALUES(marked_by)`,
      [r.userId, b.date, b.session, r.status, r.remarks || null, req.user.id]
    );
  }

  await audit(req, {
    action: 'MESS_STAFF_ATTENDANCE_MARKED',
    module: 'mess',
    summary: `Marked staff mess attendance for ${b.records.length} members on ${b.date} (${b.session})`,
  });

  ok(res, { saved: b.records.length, date: b.date, session: b.session });
});

module.exports = router;
