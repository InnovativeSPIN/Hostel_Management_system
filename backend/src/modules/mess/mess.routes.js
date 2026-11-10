const PDFDocument = require('pdfkit');
const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, badRequest, conflict } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { isStudent, isAdmin } = require('../../utils/scope');
const { tempCode, assignCode, toDateStr } = require('../../utils/helpers');

router.use(authenticate);

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];

/** GET /api/mess/menu/today  today's menu with staff overrides */
router.get('/menu/today', async (_req, res) => {
  const today = new Date();
  const dayName = DAYS[today.getDay()];
  const todayStr = toDateStr(today);

  const [defaults, overrides] = await Promise.all([
    db.query('SELECT meal_type, items FROM mess_menu WHERE day_of_week = ?', [dayName]),
    db.query('SELECT meal_type, items, reason FROM mess_menu_overrides WHERE override_date = ?', [todayStr]),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.meal_type, o]));
  const menu = MEALS.map((meal) => {
    const ov = overrideMap.get(meal);
    const def = defaults.find((d) => d.meal_type === meal);
    return {
      mealType: meal,
      items: ov ? ov.items : (def?.items || 'Not specified'),
      isOverride: Boolean(ov),
      reason: ov?.reason || null,
    };
  });

  ok(res, { date: todayStr, day: dayName, meals: menu });
});

/** GET /api/mess/menu  full weekly menu */
router.get('/menu', async (_req, res) => {
  const rows = await db.query('SELECT * FROM mess_menu ORDER BY FIELD(day_of_week, "monday","tuesday","wednesday","thursday","friday","saturday","sunday"), FIELD(meal_type, "breakfast","lunch","snacks","dinner")');
  ok(res, rows);
});

/** PUT /api/mess/menu/:day/:meal  update default menu item */
router.put('/menu/:day/:meal', authorize('hostels.manage', 'settings.manage'),
  validate(z.object({ items: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    const { day, meal } = req.params;
    if (!DAYS.includes(day.toLowerCase())) throw badRequest('Invalid day of week', 'INVALID_DAY');
    if (!MEALS.includes(meal.toLowerCase())) throw badRequest('Invalid meal type', 'INVALID_MEAL');
    await db.query(
      `INSERT INTO mess_menu (day_of_week, meal_type, items) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE items = VALUES(items)`,
      [day.toLowerCase(), meal.toLowerCase(), req.body.items]
    );
    await audit(req, { action: 'MESS_MENU_UPDATED', module: 'mess', recordId: null, summary: `Updated ${day} ${meal} menu`, newValue: req.body });
    ok(res, { day, meal, items: req.body.items });
  });

/** POST /api/mess/menu/override  staff override for date & meal */
router.post('/menu/override', authorize('hostels.manage', 'settings.manage'),
  validate(z.object({
    overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealType: z.enum(MEALS),
    items: z.string().trim().min(3).max(500),
    reason: z.string().trim().max(255).optional(),
  })),
  async (req, res) => {
    const b = req.body;
    await db.query(
      `INSERT INTO mess_menu_overrides (override_date, meal_type, items, reason, created_by) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE items = VALUES(items), reason = VALUES(reason), created_by = VALUES(created_by)`,
      [b.overrideDate, b.mealType, b.items, b.reason || null, req.user.id]
    );
    await audit(req, { action: 'MESS_MENU_OVERRIDDEN', module: 'mess', recordId: null, summary: `Override on ${b.overrideDate} for ${b.mealType}`, newValue: b });
    created(res, b);
  });

/** GET /api/mess/attendance/staff  staff mess attendance roster/history */
router.get('/attendance/staff', authorize('attendance.view', 'attendance.mark'), async (req, res) => {
  const date = req.query.date || toDateStr();
  const session = req.query.session || 'morning';
  const rows = await db.query(
    `SELECT sma.*, u.name AS staff_name, u.email AS staff_email, r.label AS role_label
       FROM staff_mess_attendance sma
       JOIN users u ON u.id = sma.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE sma.attendance_date = ? AND sma.session = ?
      ORDER BY u.name`,
    [date, session]
  );
  ok(res, rows);
});

/** POST /api/mess/attendance/staff  mark staff mess attendance */
router.post('/attendance/staff', authorize('attendance.mark'),
  validate(z.object({
    records: z.array(z.object({
      userId: z.coerce.number().int().positive(),
      status: z.enum(['present', 'absent']),
      remarks: z.string().trim().max(255).optional(),
    })).min(1),
    attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(toDateStr()),
    session: z.enum(['morning', 'evening']).default('morning'),
  })),
  async (req, res) => {
    const { records, attendanceDate, session } = req.body;
    await db.transaction(async (conn) => {
      for (const r of records) {
        await conn.query(
          `INSERT INTO staff_mess_attendance (user_id, attendance_date, session, status, remarks)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks)`,
          [r.userId, attendanceDate, session, r.status, r.remarks || null]
        );
      }
      await audit(req, { action: 'STAFF_MESS_ATTENDANCE_MARKED', module: 'mess', recordId: null, summary: `Marked ${records.length} staff mess marks for ${attendanceDate} (${session})` }, conn);
    });
    ok(res, { count: records.length, attendanceDate, session });
  });

/** POST /api/mess/bills/preview  preview student or staff mess bills calculated from attendance */
router.post('/bills/preview', authorize('fees.manage', 'fees.view_all'),
  validate(z.object({
    billMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
    dailyRate: z.coerce.number().min(1).max(5000).default(120),
    userType: z.enum(['student', 'staff']).default('student'),
  })),
  async (req, res) => {
    const { billMonth, dailyRate, userType } = req.body;
    const [year, month] = billMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    if (userType === 'student') {
      // Query students with their attendance count for that month
      const students = await db.query(
        `SELECT s.id, s.name, s.register_number, s.student_type,
                ANY_VALUE(h.code) AS hostel_code,
                ANY_VALUE(r.room_number) AS room_number,
                COUNT(a.id) AS total_marked,
                SUM(a.status IN ('present', 'late')) AS present_sessions,
                SUM(a.status = 'absent') AS absent_sessions,
                SUM(a.status IN ('on_leave', 'medical_leave', 'on_duty')) AS approved_leave_sessions
           FROM students s
           JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
           JOIN hostels h ON h.id = ra.hostel_id
           JOIN rooms r ON r.id = ra.room_id
           LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date BETWEEN ? AND ?
          GROUP BY s.id, s.name, s.register_number, s.student_type ORDER BY s.name`,
        [`${billMonth}-01`, `${billMonth}-${String(daysInMonth).padStart(2, '0')}`]
      );

      const preview = students.map((s) => {
        // Attendance sessions per day = 2 (morning & evening)
        const presentDays = Math.round((Number(s.present_sessions) || 0) / 2);
        const absentDays = Math.max(0, daysInMonth - presentDays);
        const baseAmount = presentDays * dailyRate;
        const rebateAmount = 0; // Rebates can be calculated if > 5 consecutive leave days
        const netAmount = baseAmount - rebateAmount;

        return {
          studentId: s.id,
          name: s.name,
          registerNumber: s.register_number,
          studentType: s.student_type,
          hostelCode: s.hostel_code,
          roomNumber: s.room_number,
          billMonth,
          totalDays: daysInMonth,
          presentDays,
          absentDays,
          dailyRate,
          baseAmount,
          rebateAmount,
          netAmount,
        };
      });

      return ok(res, { billMonth, dailyRate, daysInMonth, totalStudents: preview.length, preview });
    }

    // Staff bills preview
    const staffMembers = await db.query(
      `SELECT u.id, u.name, u.email, ANY_VALUE(r.label) AS role_label,
              COUNT(sma.id) AS total_sessions,
              SUM(sma.status = 'present') AS present_sessions
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN staff_mess_attendance sma ON sma.user_id = u.id AND sma.attendance_date BETWEEN ? AND ?
        WHERE r.name IN ('warden', 'assistant_warden', 'accountant', 'security_head', 'security_guard', 'maintenance_staff')
        GROUP BY u.id, u.name, u.email ORDER BY u.name`,
      [`${billMonth}-01`, `${billMonth}-${String(daysInMonth).padStart(2, '0')}`]
    );

    const staffPreview = staffMembers.map((st) => {
      const presentDays = Math.round((Number(st.present_sessions) || 0) / 2);
      const absentDays = Math.max(0, daysInMonth - presentDays);
      const baseAmount = presentDays * dailyRate;
      const netAmount = baseAmount;
      return {
        staffId: st.id,
        name: st.name,
        role: st.role_label,
        billMonth,
        totalDays: daysInMonth,
        presentDays,
        absentDays,
        dailyRate,
        baseAmount,
        rebateAmount: 0,
        netAmount,
      };
    });

    ok(res, { billMonth, dailyRate, daysInMonth, totalStaff: staffPreview.length, preview: staffPreview });
  });

/** POST /api/mess/bills/confirm  save preview as draft/confirmed bills */
router.post('/bills/confirm', authorize('fees.manage'),
  validate(z.object({
    bills: z.array(z.object({
      studentId: z.coerce.number().int().positive().optional().nullable(),
      staffId: z.coerce.number().int().positive().optional().nullable(),
      billMonth: z.string().regex(/^\d{4}-\d{2}$/),
      totalDays: z.coerce.number().int().positive(),
      presentDays: z.coerce.number().int().min(0),
      absentDays: z.coerce.number().int().min(0),
      dailyRate: z.coerce.number().positive(),
      baseAmount: z.coerce.number().min(0),
      rebateAmount: z.coerce.number().min(0).default(0),
      netAmount: z.coerce.number().min(0),
    })).min(1),
  })),
  async (req, res) => {
    const { bills } = req.body;
    const inserted = await db.transaction(async (conn) => {
      let count = 0;
      for (const b of bills) {
        const [r] = await conn.query(
          `INSERT INTO mess_bills (bill_code, student_id, staff_id, bill_month, total_days, present_days, absent_days, daily_rate, base_amount, rebate_amount, net_amount, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?, 'confirmed')`,
          [tempCode(), b.studentId || null, b.staffId || null, b.billMonth, b.totalDays, b.presentDays, b.absentDays, b.dailyRate, b.baseAmount, b.rebateAmount, b.netAmount]
        );
        await assignCode(conn, 'mess_bills', 'bill_code', 'MBIL', r.insertId);
        count++;
      }
      await audit(req, { action: 'MESS_BILLS_CONFIRMED', module: 'mess', recordId: null, summary: `Generated ${count} mess bills for ${bills[0].billMonth}` }, conn);
      return count;
    });
    created(res, { count: inserted });
  });

/** PATCH /api/mess/bills/:id/publish  publish bill and record in financial ledger */
router.patch('/bills/:id/publish', authorize('fees.manage'), async (req, res) => {
  const bill = await db.one('SELECT * FROM mess_bills WHERE id = ?', [req.params.id]);
  if (!bill) throw notFound('Mess bill');
  if (bill.status === 'published') throw conflict('Bill is already published', 'ALREADY_PUBLISHED');

  await db.transaction(async (conn) => {
    await conn.query("UPDATE mess_bills SET status = 'published', published_at = NOW() WHERE id = ?", [bill.id]);
    if (bill.student_id) {
      const student = await db.one('SELECT user_id, name FROM students WHERE id = ?', [bill.student_id], conn);
      if (student) {
        await notify(student.user_id, {
          type: 'mess_bill_published',
          title: `Mess Bill for ${bill.bill_month} Published`,
          message: `Your mess bill ${bill.bill_code} for ₹${Number(bill.net_amount).toLocaleString('en-IN')} has been published.`,
          link: '/my/fees',
        }, conn);
      }
    }
    await audit(req, { action: 'MESS_BILL_PUBLISHED', module: 'mess', recordId: bill.id, summary: `Published bill ${bill.bill_code}` }, conn);
  });
  ok(res, { id: bill.id, status: 'published' });
});

/** GET /api/mess/bills  list mess bills */
router.get('/bills', authorize('fees.view_all', 'fees.manage'), async (req, res) => {
  const q = parseList(req.query, { sortable: { created: 'mb.created_at', amount: 'mb.net_amount', month: 'mb.bill_month' }, defaultSort: 'created' });
  const where = new Where()
    .addIf(q.billMonth, 'mb.bill_month = ?', q.billMonth)
    .addIf(q.status, 'mb.status = ?', q.status)
    .addIf(q.studentId, 'mb.student_id = ?', q.studentId)
    .search(q.search, ['mb.bill_code', 's.name', 's.register_number', 'u.name']);

  if (isStudent(req.user)) where.add('mb.student_id = ?', req.user.studentId || 0);

  paged(res, await paginate(db, {
    select: `mb.*, s.name AS student_name, s.register_number, u.name AS staff_name`,
    from: `FROM mess_bills mb LEFT JOIN students s ON s.id = mb.student_id LEFT JOIN users u ON u.id = mb.staff_id`,
    where, ...q,
  }));
});

/** GET /api/mess/bills/:id/pdf  download mess bill PDF */
router.get('/bills/:id/pdf', async (req, res) => {
  const bill = await db.one(
    `SELECT mb.*, s.name AS student_name, s.register_number, h.name AS hostel_name, r.room_number, u.name AS staff_name
       FROM mess_bills mb
       LEFT JOIN students s ON s.id = mb.student_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
       LEFT JOIN hostels h ON h.id = ra.hostel_id
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN users u ON u.id = mb.staff_id
      WHERE mb.id = ?`,
    [req.params.id]
  );
  if (!bill) throw notFound('Mess bill');
  if (isStudent(req.user) && req.user.studentId !== bill.student_id) throw forbidden();

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="mess-bill-${bill.bill_code}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#1e3a8a').text('HOSTEL MANAGEMENT ERP', { align: 'center' });
  doc.fontSize(12).fillColor('#4b5563').text(`MONTHLY MESS BILL - ${bill.bill_month}`, { align: 'center' });
  doc.moveDown(1);

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.8);

  const name = bill.student_name || bill.staff_name;
  doc.fontSize(10).fillColor('#111827');
  doc.text(`Bill Code: ${bill.bill_code}`);
  doc.text(`Name: ${name}`);
  if (bill.register_number) doc.text(`Register Number: ${bill.register_number}`);
  if (bill.hostel_name) doc.text(`Hostel / Room: ${bill.hostel_name} (Room ${bill.room_number})`);
  doc.text(`Billing Month: ${bill.bill_month}`);
  doc.text(`Status: ${bill.status.toUpperCase()}`);
  doc.moveDown(1);

  const startY = doc.y;
  doc.rect(40, startY, 515, 120).fill('#f9fafb');
  doc.fillColor('#111827').fontSize(10);
  doc.text(`Total Days in Month:`, 55, startY + 15);
  doc.text(`${bill.total_days} days`, 400, startY + 15, { align: 'right' });

  doc.text(`Present (Diet) Days:`, 55, startY + 35);
  doc.text(`${bill.present_days} days`, 400, startY + 35, { align: 'right' });

  doc.text(`Daily Mess Rate:`, 55, startY + 55);
  doc.text(`₹ ${Number(bill.daily_rate).toFixed(2)} / day`, 400, startY + 55, { align: 'right' });

  doc.text(`Rebate / Absent Deduction:`, 55, startY + 75);
  doc.text(`- ₹ ${Number(bill.rebate_amount).toFixed(2)}`, 400, startY + 75, { align: 'right' });

  doc.strokeColor('#1e3a8a').lineWidth(1.5).moveTo(55, startY + 95).lineTo(540, startY + 95).stroke();
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e3a8a');
  doc.text(`TOTAL NET AMOUNT PAYABLE:`, 55, startY + 102);
  doc.text(`₹ ${Number(bill.net_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 400, startY + 102, { align: 'right' });

  doc.font('Helvetica').fontSize(8).fillColor('#9ca3af').text(`Generated on ${new Date().toLocaleString('en-IN')} by Hostel Mess Management System`, 40, doc.page.height - 50, { align: 'center' });
  doc.end();
});

module.exports = router;
