const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/exits/exits.routes.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add PDFDocument, upload, checkUploads, path, fs requires
const newImports = `const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { upload, checkUploads } = require('../../middleware/upload');
const { getBool, getSetting } = require('../../services/settings');`;

if (!code.includes("require('pdfkit')")) {
  code = code.replace("const router = require('express').Router();", "const router = require('express').Router();\n" + newImports);
}

// 2. Add calculateSettlement helper
const settlementHelper = `
async function calculateSettlement(exitId, conn) {
  const e = await db.one(
    \`SELECT e.*, s.name AS student_name, s.register_number, s.department_id, s.year_of_study, s.user_id,
            ra.hostel_id, ra.room_id, ra.bed_id, b.bed_code, r.room_number, r.room_type, r.is_ac, h.name AS hostel_name, h.code AS hostel_code
       FROM hostel_exit_records e
       JOIN students s ON s.id = e.student_id
       JOIN room_allocations ra ON ra.id = e.allocation_id
       JOIN beds b ON b.id = ra.bed_id
       JOIN rooms r ON r.id = ra.room_id
       JOIN hostels h ON h.id = ra.hostel_id
      WHERE e.id = ?\`, [exitId], conn || db.pool);
  if (!e) throw notFound('Exit record');

  // 1. Unpaid general fees from student_fees
  const feesRow = await db.one(
    \`SELECT COALESCE(SUM(total_amount - discount - amount_paid), 0) AS due
       FROM student_fees
      WHERE student_id = ? AND fee_type NOT IN ('mess', 'room_rent') AND waived = 0\`,
    [e.student_id], conn || db.pool);
  const generalPendingFees = Number(feesRow?.due || 0);

  // 2. Pending mess bill by attendance
  const exitDate = e.exit_date || e.requested_exit_date || toDateStr();
  const monthStart = exitDate.slice(0, 7) + '-01';
  const attRow = await db.one(
    \`SELECT COUNT(*) AS sessions_count
       FROM attendance_sessions
      WHERE student_id = ? AND attendance_date BETWEEN ? AND ?
        AND status IN ('Present', 'Absent')\`,
    [e.student_id, monthStart, exitDate], conn || db.pool);
  const sessionCount = Number(attRow?.sessions_count || 0);
  const perSessionRate = 75.00;
  const attendanceMessCharges = sessionCount * perSessionRate;

  // Plus any pending billed mess fee
  const pendingMessFee = await db.one(
    \`SELECT COALESCE(SUM(total_amount - discount - amount_paid), 0) AS due
       FROM student_fees WHERE student_id = ? AND fee_type = 'mess' AND waived = 0\`,
    [e.student_id], conn || db.pool);
  const totalMessDue = attendanceMessCharges + Number(pendingMessFee?.due || 0);

  // 3. Room rent due per configurable policy
  const pendingRentFee = await db.one(
    \`SELECT COALESCE(SUM(total_amount - discount - amount_paid), 0) AS due
       FROM student_fees WHERE student_id = ? AND fee_type = 'room_rent' AND waived = 0\`,
    [e.student_id], conn || db.pool);
  const roomRentDue = Number(pendingRentFee?.due || 0);

  // 4. Damage charges
  const damageCharges = Number(e.damage_charges || 0);

  // 5. Caution deposit paid by student
  const cautionRow = await db.one(
    \`SELECT COALESCE(SUM(amount_paid), 0) AS paid
       FROM student_fees WHERE student_id = ? AND fee_type = 'caution_deposit'\`,
    [e.student_id], conn || db.pool);
  let cautionDeposit = Number(cautionRow?.paid || 0);
  if (cautionDeposit === 0) {
    // Default caution deposit if not recorded as paid fee
    cautionDeposit = e.is_ac ? 5000.00 : 3000.00;
  }

  // 6. Advance paid
  const advanceRow = await db.one(
    \`SELECT COALESCE(SUM(amount_paid - total_amount), 0) AS excess
       FROM student_fees WHERE student_id = ? AND amount_paid > total_amount\`,
    [e.student_id], conn || db.pool);
  const advancePaid = Math.max(0, Number(advanceRow?.excess || 0));

  const totalDues = generalPendingFees + totalMessDue + roomRentDue + damageCharges;
  const totalCredits = cautionDeposit + advancePaid;
  const net = totalDues - totalCredits;
  const netAmount = Math.abs(net);
  const settlementType = net > 0 ? 'payable' : net < 0 ? 'refundable' : 'nil';

  return {
    exitRecord: e,
    pendingFees: generalPendingFees,
    pendingMessBill: totalMessDue,
    attendanceSessions: sessionCount,
    perSessionRate,
    roomRentDue,
    damageCharges,
    cautionDeposit,
    advancePaid,
    totalDues,
    totalCredits,
    net,
    netAmount,
    settlementType,
  };
}
`;

if (!code.includes("calculateSettlement")) {
  code = code.replace("async function pendingFees", settlementHelper + "\nasync function pendingFees");
}

// 3. Update GET /api/exits SELECT and FROM to join warden and settlement
const oldGetSelect = `    select: \`e.*, s.name AS student_name, s.register_number, d.short_name AS department, b.bed_code, h.code AS hostel_code,
             ui.name AS inspected_by_name, ua.name AS approved_by_name\`,
    from: \`FROM hostel_exit_records e JOIN students s ON s.id = e.student_id JOIN departments d ON d.id = s.department_id
           JOIN room_allocations ra ON ra.id = e.allocation_id JOIN beds b ON b.id = ra.bed_id JOIN hostels h ON h.id = ra.hostel_id
           LEFT JOIN users ui ON ui.id = e.inspected_by LEFT JOIN users ua ON ua.id = e.approved_by\`,`;

const newGetSelect = `    select: \`e.*, s.name AS student_name, s.register_number, d.short_name AS department, b.bed_code, h.code AS hostel_code,
             ui.name AS inspected_by_name, ua.name AS approved_by_name, uw.name AS warden_approved_by_name,
             es.net_amount, es.settlement_type, es.status AS settlement_status, es.pending_mess_bill, es.caution_deposit\`,
    from: \`FROM hostel_exit_records e JOIN students s ON s.id = e.student_id JOIN departments d ON d.id = s.department_id
           JOIN room_allocations ra ON ra.id = e.allocation_id JOIN beds b ON b.id = ra.bed_id JOIN hostels h ON h.id = ra.hostel_id
           LEFT JOIN users ui ON ui.id = e.inspected_by LEFT JOIN users ua ON ua.id = e.approved_by
           LEFT JOIN users uw ON uw.id = e.warden_approved_by
           LEFT JOIN exit_settlements es ON es.exit_record_id = e.id\`,`;

code = code.replace(oldGetSelect, newGetSelect);

// 4. Add GET /:id, PATCH /:id/approve, GET /:id/settlement, POST /:id/settlement, GET /:id/statement
const newEndpoints = `
/** GET /api/exits/:id  get single exit record with settlement & checklist */
router.get('/:id', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const settlement = await db.one('SELECT * FROM exit_settlements WHERE exit_record_id = ?', [e.id]);
  const [approver, inspector, wardenApprover] = await Promise.all([
    e.approved_by ? db.one('SELECT name FROM users WHERE id = ?', [e.approved_by]) : null,
    e.inspected_by ? db.one('SELECT name FROM users WHERE id = ?', [e.inspected_by]) : null,
    e.warden_approved_by ? db.one('SELECT name FROM users WHERE id = ?', [e.warden_approved_by]) : null,
  ]);
  ok(res, {
    ...e,
    approved_by_name: approver?.name || null,
    inspected_by_name: inspector?.name || null,
    warden_approved_by_name: wardenApprover?.name || null,
    settlement: settlement || null,
  });
});

/** PATCH /api/exits/:id/approve  warden approval of exit request */
router.patch('/:id/approve', authorize('exits.manage'),
  validate(z.object({ remarks: z.string().trim().max(500).optional() })),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const e = await loadExit(req.params.id, conn);
      assertAccess(req.user, e);
      if (e.clearance_status !== 'requested') throw conflict(\`Exit is \${e.clearance_status}; cannot approve\`, 'INVALID_TRANSITION');
      await conn.query(
        \`UPDATE hostel_exit_records
             SET warden_approved_by = ?, warden_approved_at = NOW(), warden_remarks = ?
           WHERE id = ?\`,
        [req.user.id, req.body.remarks || 'Approved by warden', e.id]
      );
      await notify(e.user_id, {
        type: 'exit_approved',
        title: 'Hostel exit request approved',
        message: 'Your exit request has been approved by the warden. Room inspection is scheduled.',
        link: '/my/hostel',
      }, conn);
      await audit(req, {
        action: 'EXIT_WARDEN_APPROVED',
        module: 'exits',
        recordId: e.id,
        summary: \`Exit approved by warden for \${e.student_name}\`,
        newValue: req.body,
      }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  }
);
`;

if (!code.includes("router.patch('/:id/approve'")) {
  code = code.replace("/** PATCH /api/exits/:id/inspect", newEndpoints + "\n/** PATCH /api/exits/:id/inspect");
}

// 5. Update PATCH /api/exits/:id/inspect to handle multipart damage photo, checklist, and settlement creation
const oldInspect = `/** PATCH /api/exits/:id/inspect  { roomCondition, inspectionNotes, damageCharges } */
router.patch('/:id/inspect', authorize('exits.manage'),
  validate(z.object({
    roomCondition: z.enum(['good', 'minor_damage', 'major_damage']),
    inspectionNotes: z.string().trim().min(3).max(500),
    damageCharges: z.coerce.number().min(0).max(1_000_000).default(0),
  }).refine((b) => b.roomCondition === 'good' || b.damageCharges >= 0, 'Invalid damage charges')),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const e = await loadExit(req.params.id, conn);
      assertAccess(req.user, e);
      if (e.clearance_status !== 'requested') throw conflict(\`Exit is \${e.clearance_status}; inspection is no longer possible\`, 'INVALID_TRANSITION');
      const due = await pendingFees(e.student_id, conn);
      await conn.query(
        \`UPDATE hostel_exit_records SET room_condition = ?, inspection_notes = ?, damage_charges = ?, pending_fees = ?, inspected_by = ?, clearance_status = 'inspected' WHERE id = ?\`,
        [req.body.roomCondition, req.body.inspectionNotes, req.body.damageCharges, due, req.user.id, e.id]);
      await audit(req, { action: 'EXIT_INSPECTED', module: 'exits', recordId: e.id, summary: \`Room \${e.bed_code} inspected: \${req.body.roomCondition}, damage ₹\${req.body.damageCharges}\`, newValue: req.body }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  });`;

const newInspect = `/** PATCH /api/exits/:id/inspect  { roomCondition, inspectionNotes, damageCharges, checklist } */
router.patch('/:id/inspect', authorize('exits.manage'),
  upload.single('damage_photo'), checkUploads,
  validate(z.object({
    roomCondition: z.enum(['good', 'minor_damage', 'major_damage']),
    inspectionNotes: z.string().trim().min(3).max(500),
    damageCharges: z.coerce.number().min(0).max(1_000_000).default(0),
    checklist: z.union([z.string(), z.record(z.any())]).optional(),
  }).refine((b) => b.roomCondition === 'good' || b.damageCharges >= 0, 'Invalid damage charges')),
  async (req, res) => {
    const photoUrl = req.file ? \`/uploads/\${req.file.filename}\` : null;
    let checklistJson = null;
    if (req.body.checklist) {
      checklistJson = typeof req.body.checklist === 'string' ? req.body.checklist : JSON.stringify(req.body.checklist);
    }
    const result = await db.transaction(async (conn) => {
      const e = await loadExit(req.params.id, conn);
      assertAccess(req.user, e);
      if (e.clearance_status !== 'requested') throw conflict(\`Exit is \${e.clearance_status}; inspection is no longer possible\`, 'INVALID_TRANSITION');
      const due = await pendingFees(e.student_id, conn);
      await conn.query(
        \`UPDATE hostel_exit_records
             SET room_condition = ?, inspection_notes = ?, damage_charges = ?, damage_photo_url = COALESCE(?, damage_photo_url),
                 inspection_checklist = ?, pending_fees = ?, inspected_by = ?, clearance_status = 'inspected'
           WHERE id = ?\`,
        [req.body.roomCondition, req.body.inspectionNotes, req.body.damageCharges, photoUrl, checklistJson, due, req.user.id, e.id]);

      // Calculate and save settlement
      const calc = await calculateSettlement(e.id, conn);
      const [sRes] = await conn.query(
        \`INSERT INTO exit_settlements (exit_record_id, student_id, pending_fees, pending_mess_bill, room_rent_due, damage_charges,
                                       caution_deposit, advance_paid, net_amount, settlement_type, status, breakdown)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?)
         ON DUPLICATE KEY UPDATE
           pending_fees = VALUES(pending_fees), pending_mess_bill = VALUES(pending_mess_bill), room_rent_due = VALUES(room_rent_due),
           damage_charges = VALUES(damage_charges), caution_deposit = VALUES(caution_deposit), advance_paid = VALUES(advance_paid),
           net_amount = VALUES(net_amount), settlement_type = VALUES(settlement_type), breakdown = VALUES(breakdown)\`,
        [e.id, e.student_id, calc.pendingFees, calc.pendingMessBill, calc.roomRentDue, calc.damageCharges,
         calc.cautionDeposit, calc.advancePaid, calc.netAmount, calc.settlementType, JSON.stringify(calc)]);
      
      const sId = sRes.insertId || (await db.one('SELECT id FROM exit_settlements WHERE exit_record_id = ?', [e.id], conn))?.id;
      if (sId) {
        await conn.query('UPDATE hostel_exit_records SET settlement_id = ? WHERE id = ?', [sId, e.id]);
      }

      await audit(req, {
        action: 'EXIT_INSPECTED',
        module: 'exits',
        recordId: e.id,
        summary: \`Room \${e.bed_code} inspected: \${req.body.roomCondition}, damage ₹\${req.body.damageCharges}\`,
        newValue: { ...req.body, damagePhotoUrl: photoUrl, settlement: calc },
      }, conn);
      return { id: Number(req.params.id), settlement: calc };
    });
    ok(res, result);
  });`;

code = code.replace(oldInspect, newInspect);

// 6. Add Settlement Preview & PDF Statement endpoints before closeExit
const settlementEndpoints = `
/** GET /api/exits/:id/settlement  get real-time settlement breakdown */
router.get('/:id/settlement', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const calc = await calculateSettlement(e.id);
  ok(res, calc);
});

/** GET /api/exits/:id/statement  stream official Settlement Statement PDF */
router.get('/:id/statement', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const calc = await calculateSettlement(e.id);
  const rec = calc.exitRecord;

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const filename = \`Exit_Settlement_\${rec.register_number}_\${rec.id}.pdf\`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', \`inline; filename="\${filename}"\`);
  doc.pipe(res);

  // Logo if present
  const logoPath = path.join(__dirname, '../../../../frontend/public/nscet-logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 36, 32, { width: 55 });
    } catch (_) {}
  }

  // Header
  doc.fillColor('#0f2042').fontSize(14).font('Helvetica-Bold')
    .text('NADAR SARASWATHI COLLEGE OF ENGINEERING & TECHNOLOGY', 100, 36, { align: 'center' });
  doc.fillColor('#475569').fontSize(9).font('Helvetica')
    .text('Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai', { align: 'center' })
    .text('Vadapudupatti, Annanji (PO), Theni - 625 531, Tamil Nadu', { align: 'center' });
  doc.moveDown(0.8);

  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
  doc.moveDown(0.8);

  doc.fillColor('#1e3a8a').fontSize(12).font('Helvetica-Bold')
    .text('HOSTEL EXIT CLEARANCE & FINAL SETTLEMENT STATEMENT', { align: 'center' });
  doc.moveDown(0.6);

  // Student Details Box
  const startY = doc.y;
  doc.rect(36, startY, 523, 75).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica');

  doc.text(\`Student Name: \${rec.student_name}\`, 46, startY + 8);
  doc.text(\`Register No: \${rec.register_number}\`, 320, startY + 8);

  doc.text(\`Hostel: \${rec.hostel_name} (\${rec.hostel_code})\`, 46, startY + 24);
  doc.text(\`Room & Bed: Room \${rec.room_number || '—'}, Bed \${rec.bed_code}\`, 320, startY + 24);

  doc.text(\`Exit Date: \${rec.exit_date || rec.requested_exit_date}\`, 46, startY + 40);
  doc.text(\`Reason: \${rec.reason.replace(/_/g, ' ').toUpperCase()}\`, 320, startY + 40);

  doc.text(\`Clearance Status: \${rec.clearance_status.toUpperCase()}\`, 46, startY + 56);
  doc.text(\`Room Condition: \${(rec.room_condition || 'Inspected').replace(/_/g, ' ').toUpperCase()}\`, 320, startY + 56);

  doc.y = startY + 85;
  doc.moveDown(0.5);

  // Financial Settlement Table
  doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Financial Settlement Breakdown', 36);
  doc.moveDown(0.4);

  const tableTop = doc.y;
  doc.rect(36, tableTop, 523, 20).fill('#0f2042');
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
    .text('Item Description', 46, tableTop + 5)
    .text('Type', 360, tableTop + 5)
    .text('Amount (₹)', 480, tableTop + 5, { width: 70, align: 'right' });

  const rows = [
    { desc: 'Room Rent Due (per college vacate policy)', type: 'Due', amt: calc.roomRentDue },
    { desc: \`Mess Charges (\${calc.attendanceSessions} sessions attended @ ₹\${calc.perSessionRate.toFixed(2)} + pending)\`, type: 'Due', amt: calc.pendingMessBill },
    { desc: \`Room Damage / Fixture Repair Charges (\${rec.room_condition || 'Good'})\`, type: 'Due', amt: calc.damageCharges },
    { desc: 'General Pending College & Hostel Dues', type: 'Due', amt: calc.pendingFees },
    { desc: 'Less: Caution Deposit Refundable', type: 'Credit', amt: -calc.cautionDeposit },
    { desc: 'Less: Advance Hostel Fees Paid', type: 'Credit', amt: -calc.advancePaid },
  ];

  let currentY = tableTop + 20;
  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(36, currentY, 523, 20).fillAndStroke(bg, '#f1f5f9');
    doc.fillColor('#334155').fontSize(9).font('Helvetica')
      .text(r.desc, 46, currentY + 5)
      .text(r.type, 360, currentY + 5);
    const amtStr = r.amt < 0 ? \`- ₹\${Math.abs(r.amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\` : \`₹\${r.amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`;
    doc.font(r.type === 'Credit' ? 'Helvetica-Oblique' : 'Helvetica')
      .text(amtStr, 460, currentY + 5, { width: 90, align: 'right' });
    currentY += 20;
  });

  // Net Summary Row
  doc.rect(36, currentY, 523, 26).fill(calc.settlementType === 'refundable' ? '#ecfdf5' : calc.settlementType === 'payable' ? '#fef2f2' : '#f8fafc');
  doc.strokeColor('#cbd5e1').rect(36, currentY, 523, 26).stroke();

  const netLabel = calc.settlementType === 'refundable'
    ? 'NET REFUNDABLE TO STUDENT (Via Bank Transfer)'
    : calc.settlementType === 'payable'
    ? 'NET PAYABLE BY STUDENT (Due at office)'
    : 'NIL DUES CLEARANCE (All accounts settled)';

  const netColor = calc.settlementType === 'refundable' ? '#065f46' : calc.settlementType === 'payable' ? '#991b1b' : '#1e293b';

  doc.fillColor(netColor).fontSize(10).font('Helvetica-Bold')
    .text(netLabel, 46, currentY + 7);
  doc.text(\`₹\${calc.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`, 440, currentY + 7, { width: 110, align: 'right' });

  currentY += 36;
  doc.y = currentY;

  // Inspection Checklist Summary
  if (rec.inspection_checklist || rec.inspection_notes) {
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('Inspection & Handover Checklist', 36);
    doc.moveDown(0.2);
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
      .text(\`Inspection Remarks: \${rec.inspection_notes || 'All fixtures and room amenities verified.'}\`, 36);
    if (rec.damage_photo_url) {
      doc.text('Damage Evidence: Image proof captured and archived in institution portal.', 36);
    }
    doc.moveDown(0.6);
  }

  // Signatures
  doc.y = Math.max(doc.y + 20, 680);
  const sigY = doc.y;

  doc.strokeColor('#cbd5e1').lineWidth(0.8)
    .moveTo(46, sigY).lineTo(170, sigY).stroke()
    .moveTo(230, sigY).lineTo(350, sigY).stroke()
    .moveTo(410, sigY).lineTo(540, sigY).stroke();

  doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
    .text('Resident Student Signature', 46, sigY + 6, { width: 124, align: 'center' })
    .text('Hostel Warden', 230, sigY + 6, { width: 120, align: 'center' })
    .text('Accounts Officer / Principal', 410, sigY + 6, { width: 130, align: 'center' });

  doc.end();
});
`;

if (!code.includes("router.get('/:id/statement'")) {
  code = code.replace("/** PATCH /api/exits/:id/clear", settlementEndpoints + "\n/** PATCH /api/exits/:id/clear");
}

fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched exits.routes.js');
