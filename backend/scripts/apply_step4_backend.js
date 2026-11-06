const fs = require('fs');
const path = require('path');

// 1. Update applications.routes.js
const appRoutesPath = path.join(__dirname, '..', 'src', 'modules', 'applications', 'applications.routes.js');
let appContent = fs.readFileSync(appRoutesPath, 'utf8');

// Replace settings import
if (!appContent.includes("const { getBool } = require('../../services/settings');")) {
  appContent = appContent.replace(
    "const { FEE_STATUS_SQL } = require('../fees/fees.service');",
    "const { getBool } = require('../../services/settings');\r\nconst { FEE_STATUS_SQL } = require('../fees/fees.service');"
  );
}

// Update POST / schema
if (!appContent.includes('preferredRoomCategory:')) {
  appContent = appContent.replace(
    "preferredRoomType: z.enum(['single', 'double', 'triple', 'quad', 'dormitory']).optional().nullable(),",
    "preferredRoomType: z.enum(['single', 'double', 'triple', 'quad', 'dormitory']).optional().nullable(),\r\n      preferredRoomCategory: z.enum(['AC Room', 'Attached Toilet', 'Normal Room']).optional().nullable(),"
  );
}

// Update POST / INSERT query
if (!appContent.includes('preferred_room_category,')) {
  appContent = appContent.replace(
    "`INSERT INTO hostel_applications (application_code, student_id, academic_year, preferred_hostel_id, preferred_room_type, needs_ac, reason)\r\n         VALUES (?,?,?,?,?,?,?)`,",
    "`INSERT INTO hostel_applications (application_code, student_id, academic_year, preferred_hostel_id, preferred_room_type, preferred_room_category, needs_ac, reason)\r\n         VALUES (?,?,?,?,?,?,?,?)`,"
  );
  appContent = appContent.replace(
    "[tempCode(), studentId, b.academicYear, b.preferredHostelId || null, b.preferredRoomType || null, b.needsAc ? 1 : 0, b.reason]);",
    "[tempCode(), studentId, b.academicYear, b.preferredHostelId || null, b.preferredRoomType || null, b.preferredRoomCategory || null, b.needsAc ? 1 : 0, b.reason]);"
  );
}

// Update GET / paginate select
if (!appContent.includes('a.preferred_room_category,')) {
  appContent = appContent.replace(
    "select: `a.id, a.application_code, a.academic_year, a.status, a.preferred_room_type, a.needs_ac, a.created_at, a.reviewed_at,",
    "select: `a.id, a.application_code, a.academic_year, a.status, a.preferred_room_type, a.preferred_room_category, a.allocated_fee_structure_id, a.auto_fee_allocated, a.needs_ac, a.created_at, a.reviewed_at,"
  );
}

// Update GET /:id to fetch feeStructureV2
if (!appContent.includes('feeStructureV2')) {
  const targetGetId = "  const [documents, history, student] = await Promise.all([";
  const replacementGetId = `  let feeStructureV2 = null;
  if (app.allocated_fee_structure_id) {
    feeStructureV2 = await db.one(
      'SELECT id, name, student_type, room_category, academic_year, admission_fee, caution_deposit, room_rent, mess_charges, per_day_mess_rate, other_charges, total_amount, due_date FROM fee_structures_v2 WHERE id = ?',
      [app.allocated_fee_structure_id]
    );
  }
  const [documents, history, student] = await Promise.all([`;

  appContent = appContent.replace(targetGetId, replacementGetId);
  appContent = appContent.replace(
    "ok(res, { ...app, student, documents, history, eligibility: await eligibility(app), allowedTransitions: TRANSITIONS[app.status] });",
    "ok(res, { ...app, student, documents, history, feeStructureV2, eligibility: await eligibility(app), allowedTransitions: TRANSITIONS[app.status] });"
  );
}

// Add autoAllocateFee helper and room-category & auto-fee routes before decision
if (!appContent.includes('async function autoAllocateFee')) {
  const helperCode = `
// Step 4: Auto-fee allocation helper
async function autoAllocateFee(conn, req, app, roomCategory) {
  const category = roomCategory || app.preferred_room_category || 'Normal Room';
  const student = await db.one('SELECT id, user_id, name, student_type FROM students WHERE id = ?', [app.student_id], conn);
  const studentType = student?.student_type || 'NSCET';
  const year = app.academic_year || currentAcademicYear();

  const fs = await db.one(
    \`SELECT * FROM fee_structures_v2 
      WHERE student_type = ? AND room_category = ? AND academic_year = ? AND status = 'active' AND deleted_at IS NULL 
      ORDER BY id DESC LIMIT 1\`,
    [studentType, category, year],
    conn
  );

  if (!fs) {
    return { allocated: false, reason: \`No active fee structure found for \${studentType} - \${category} (\${year})\` };
  }

  const existingFee = await db.one(
    'SELECT id FROM student_fees WHERE student_id = ? AND fee_structure_v2_id = ?',
    [student.id, fs.id],
    conn
  );

  let feeId;
  if (!existingFee) {
    const [r] = await conn.query(
      \`INSERT INTO student_fees (student_id, fee_structure_v2_id, academic_year, total_amount, discount, due_date, remarks, assigned_by)
       VALUES (?,?,?,?,?,?,?,?)\`,
      [student.id, fs.id, fs.academic_year, fs.total_amount, 0, fs.due_date, \`Auto-allocated: \${fs.name}\`, req.user.id]
    );
    feeId = r.insertId;
  } else {
    feeId = existingFee.id;
  }

  await conn.query(
    \`UPDATE hostel_applications 
     SET preferred_room_category = ?, allocated_fee_structure_id = ?, auto_fee_allocated = 1, status = 'fee_assigned' 
     WHERE id = ?\`,
    [category, fs.id, app.id]
  );

  await conn.query(
    'INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks) VALUES (?,?,?,?,?)',
    [app.id, app.status, 'fee_assigned', req.user.id, \`Auto fee allocated: \${fs.name} (₹\${fs.total_amount})\`]
  );

  await notify(student.user_id, {
    type: 'fee_assigned',
    title: 'Hostel fee auto-assigned',
    message: \`\${fs.name} (₹\${Number(fs.total_amount).toLocaleString('en-IN')}) has been allocated based on room category "\${category}".\`,
    link: '/my/fees',
  }, conn);

  await audit(req, {
    action: 'FEE_AUTO_ALLOCATED',
    module: 'applications',
    recordId: app.id,
    summary: \`Auto-allocated fee structure \${fs.name} (₹\${fs.total_amount}) to application \${app.application_code}\`,
    newValue: { feeStructureId: fs.id, feeStructureName: fs.name, totalAmount: fs.total_amount, category, feeId },
  }, conn);

  return { allocated: true, feeStructure: fs, feeId };
}

/** PATCH /api/applications/:id/room-category */
router.patch('/:id/room-category', authorize('applications.review'),
  validate(z.object({ roomCategory: z.enum(['AC Room', 'Attached Toilet', 'Normal Room']) })),
  async (req, res) => {
    const app = await loadApp(req.params.id);
    assertAccess(req.user, app);
    await db.query('UPDATE hostel_applications SET preferred_room_category = ? WHERE id = ?', [req.body.roomCategory, app.id]);
    await audit(req, {
      action: 'APPLICATION_ROOM_CATEGORY_UPDATED',
      module: 'applications',
      recordId: app.id,
      summary: \`Set room category to \${req.body.roomCategory} for \${app.application_code}\`,
      oldValue: { preferred_room_category: app.preferred_room_category },
      newValue: { preferred_room_category: req.body.roomCategory },
    });
    ok(res, { id: app.id, roomCategory: req.body.roomCategory });
  }
);

/** POST /api/applications/:id/auto-fee */
router.post('/:id/auto-fee', authorize('applications.review'),
  validate(z.object({ roomCategory: z.enum(['AC Room', 'Attached Toilet', 'Normal Room']).optional() })),
  async (req, res) => {
    const out = await db.transaction(async (conn) => {
      const app = await loadApp(req.params.id, conn);
      assertAccess(req.user, app);
      if (!['approved', 'eligible', 'documents_verified', 'submitted'].includes(app.status)) {
        throw conflict(\`Cannot auto-allocate fee for application in status "\${app.status}"\`, 'INVALID_STATUS');
      }
      const result = await autoAllocateFee(conn, req, app, req.body.roomCategory);
      if (!result.allocated) {
        throw badRequest(result.reason, 'FEE_STRUCTURE_NOT_FOUND');
      }
      return result;
    });
    ok(res, out);
  }
);
`;

  appContent = appContent.replace(
    "/** PATCH /api/applications/:id/decision  { decision: approve|reject, remarks } */",
    `${helperCode}\r\n/** PATCH /api/applications/:id/decision  { decision: approve|reject, remarks } */`
  );
}

// Update PATCH /:id/decision to support feature_new_admission_flow
const targetDecision = `router.patch('/:id/decision', authorize('applications.review'),
  validate(z.object({ decision: z.enum(['approve', 'reject']), remarks: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const app = await loadApp(req.params.id, conn);
      assertAccess(req.user, app);
      const approve = req.body.decision === 'approve';
      await transition(conn, req, app, approve ? 'approved' : 'rejected', req.body.remarks, { remarks: req.body.remarks, reviewed_by: req.user.id, reviewed_at: toDateTimeStr() });
      await conn.query('UPDATE students SET hostel_status = ? WHERE id = ?', [approve ? 'approved' : 'rejected', app.student_id]);
      await notify(app.user_id, {
        type: approve ? 'admission_approved' : 'admission_rejected',
        title: approve ? 'Hostel admission approved' : 'Hostel admission rejected',
        message: approve ? \`\${app.application_code} approved. Fee details and room allocation will follow.\` : \`\${app.application_code} was rejected: \${req.body.remarks}\`,
        link: '/my/application',
      }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  });`;

const replacementDecision = `router.patch('/:id/decision', authorize('applications.review'),
  validate(z.object({ decision: z.enum(['approve', 'reject']), remarks: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    const out = await db.transaction(async (conn) => {
      const app = await loadApp(req.params.id, conn);
      assertAccess(req.user, app);
      const approve = req.body.decision === 'approve';

      const newFlowEnabled = await getBool('feature_new_admission_flow');
      let autoAllocated = false;
      let autoFeeRes = null;

      if (approve && newFlowEnabled) {
        autoFeeRes = await autoAllocateFee(conn, req, app, app.preferred_room_category);
        if (autoFeeRes.allocated) {
          autoAllocated = true;
          await conn.query('UPDATE students SET hostel_status = ? WHERE id = ?', ['approved', app.student_id]);
          await notify(app.user_id, {
            type: 'admission_approved',
            title: 'Hostel admission approved & fee assigned',
            message: \`\${app.application_code} approved with room category \${autoFeeRes.feeStructure.room_category}. Fee \${autoFeeRes.feeStructure.name} has been assigned.\`,
            link: '/my/application',
          }, conn);
        }
      }

      if (!autoAllocated) {
        await transition(conn, req, app, approve ? 'approved' : 'rejected', req.body.remarks, { remarks: req.body.remarks, reviewed_by: req.user.id, reviewed_at: toDateTimeStr() });
        await conn.query('UPDATE students SET hostel_status = ? WHERE id = ?', [approve ? 'approved' : 'rejected', app.student_id]);
        await notify(app.user_id, {
          type: approve ? 'admission_approved' : 'admission_rejected',
          title: approve ? 'Hostel admission approved' : 'Hostel admission rejected',
          message: approve ? \`\${app.application_code} approved. Fee details and room allocation will follow.\` : \`\${app.application_code} was rejected: \${req.body.remarks}\`,
          link: '/my/application',
        }, conn);
      }
      return { id: Number(req.params.id), autoFeeAllocated: autoAllocated };
    });
    ok(res, out);
  });`;

if (appContent.includes("const approve = req.body.decision === 'approve';\r\n      await transition(conn, req, app, approve ? 'approved' : 'rejected'")) {
  appContent = appContent.replace(targetDecision, replacementDecision);
}

fs.writeFileSync(appRoutesPath, appContent, 'utf8');
console.log('applications.routes.js updated successfully');

// 2. Update fees.routes.js
const feesRoutesPath = path.join(__dirname, '..', 'src', 'modules', 'fees', 'fees.routes.js');
let feesContent = fs.readFileSync(feesRoutesPath, 'utf8');

if (!feesContent.includes('LEFT JOIN fee_structures_v2 fs2')) {
  feesContent = feesContent.replace(
    "  JOIN fee_structures fs ON fs.id = sf.fee_structure_id\r\n  LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'",
    "  LEFT JOIN fee_structures fs ON fs.id = sf.fee_structure_id\r\n  LEFT JOIN fee_structures_v2 fs2 ON fs2.id = sf.fee_structure_v2_id\r\n  LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'"
  );
  feesContent = feesContent.replace(
    "fs.name AS fee_name,\r\n             h.code AS hostel_code, r.room_number",
    "COALESCE(fs2.name, fs.name) AS fee_name,\r\n             h.code AS hostel_code, r.room_number"
  );
  feesContent = feesContent.replace(
    "`SELECT sf.*, fs.name AS fee_name, fs.hostel_fee, fs.mess_fee, fs.maintenance_fee, fs.security_deposit, fs.other_fee,\r\n              (sf.total_amount - sf.discount - sf.amount_paid) AS balance, ${FEE_STATUS_SQL} AS status\r\n         FROM student_fees sf JOIN fee_structures fs ON fs.id = sf.fee_structure_id WHERE sf.student_id = ? ORDER BY sf.due_date DESC`, [studentId]),",
    "`SELECT sf.*, COALESCE(fs2.name, fs.name) AS fee_name, fs.hostel_fee, fs.mess_fee, fs.maintenance_fee, fs.security_deposit, fs.other_fee,\r\n              (sf.total_amount - sf.discount - sf.amount_paid) AS balance, ${FEE_STATUS_SQL} AS status\r\n         FROM student_fees sf LEFT JOIN fee_structures fs ON fs.id = sf.fee_structure_id LEFT JOIN fee_structures_v2 fs2 ON fs2.id = sf.fee_structure_v2_id WHERE sf.student_id = ? ORDER BY sf.due_date DESC`, [studentId]),"
  );
  feesContent = feesContent.replace(
    "`SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, p.remarks, fs.name AS fee_name, u.name AS recorded_by\r\n         FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id\r\n          LEFT JOIN users u ON u.id = p.recorded_by WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]),",
    "`SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, p.remarks, COALESCE(fs2.name, fs.name) AS fee_name, u.name AS recorded_by\r\n         FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id LEFT JOIN fee_structures fs ON fs.id = sf.fee_structure_id LEFT JOIN fee_structures_v2 fs2 ON fs2.id = sf.fee_structure_v2_id\r\n          LEFT JOIN users u ON u.id = p.recorded_by WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]),"
  );
}
fs.writeFileSync(feesRoutesPath, feesContent, 'utf8');
console.log('fees.routes.js updated successfully');

// 3. Update payments.routes.js
const paymentsRoutesPath = path.join(__dirname, '..', 'src', 'modules', 'fees', 'payments.routes.js');
let paymentsContent = fs.readFileSync(paymentsRoutesPath, 'utf8');

if (!paymentsContent.includes('LEFT JOIN fee_structures_v2 fs2')) {
  paymentsContent = paymentsContent.replace(
    "s.register_number, fs.name AS fee_name, u.name AS recorded_by`,\r\n    from: `FROM payments p JOIN students s ON s.id = p.student_id JOIN student_fees sf ON sf.id = p.student_fee_id\r\n           JOIN fee_structures fs ON fs.id = sf.fee_structure_id LEFT JOIN users u ON u.id = p.recorded_by",
    "s.register_number, COALESCE(fs2.name, fs.name) AS fee_name, u.name AS recorded_by`,\r\n    from: `FROM payments p JOIN students s ON s.id = p.student_id JOIN student_fees sf ON sf.id = p.student_fee_id\r\n           LEFT JOIN fee_structures fs ON fs.id = sf.fee_structure_id LEFT JOIN fee_structures_v2 fs2 ON fs2.id = sf.fee_structure_v2_id LEFT JOIN users u ON u.id = p.recorded_by"
  );
  paymentsContent = paymentsContent.replace(
    "`SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, p.remarks, fs.name AS fee_name\r\n       FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id\r\n      WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]));",
    "`SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, p.remarks, COALESCE(fs2.name, fs.name) AS fee_name\r\n       FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id LEFT JOIN fee_structures fs ON fs.id = sf.fee_structure_id LEFT JOIN fee_structures_v2 fs2 ON fs2.id = sf.fee_structure_v2_id\r\n      WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]));"
  );
}
fs.writeFileSync(paymentsRoutesPath, paymentsContent, 'utf8');
console.log('payments.routes.js updated successfully');

// 4. Update allocations.routes.js GET /pending
const allocationsRoutesPath = path.join(__dirname, '..', 'src', 'modules', 'allocations', 'allocations.routes.js');
let allocationsContent = fs.readFileSync(allocationsRoutesPath, 'utf8');

if (!allocationsContent.includes('a.preferred_room_category,')) {
  allocationsContent = allocationsContent.replace(
    "`SELECT a.id AS application_id, a.application_code, a.status, a.preferred_room_type, a.needs_ac, a.reviewed_at,",
    "`SELECT a.id AS application_id, a.application_code, a.status, a.preferred_room_type, a.preferred_room_category, a.needs_ac, a.reviewed_at,"
  );
}
fs.writeFileSync(allocationsRoutesPath, allocationsContent, 'utf8');
console.log('allocations.routes.js updated successfully');
