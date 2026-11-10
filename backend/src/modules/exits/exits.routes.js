const PDFDocument = require('pdfkit');
const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict, forbidden, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify, hostelWardenIds } = require('../../services/notify');
const { isStudent, isAdmin } = require('../../utils/scope');
const { vacate } = require('../allocations/allocations.service');
const { toDateStr } = require('../../utils/helpers');

router.use(authenticate);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function pendingFees(studentId, conn) {
  const r = await db.one(
    `SELECT COALESCE(SUM(total_amount - discount - amount_paid),0) AS due FROM student_fees WHERE student_id = ? AND waived = 0`, [studentId], conn || db.pool);
  return Number(r.due);
}

async function calculateSettlement(studentId, damageCharges = 0, conn) {
  const feeRows = await db.query(
    `SELECT fs.name, fs.hostel_fee, fs.mess_fee, fs.security_deposit, sf.total_amount, sf.discount, sf.amount_paid,
            (sf.total_amount - sf.discount - sf.amount_paid) AS balance
       FROM student_fees sf JOIN fee_structures fs ON fs.id = sf.fee_structure_id
      WHERE sf.student_id = ? AND sf.waived = 0`, [studentId], conn || db.pool);
  
  let rentDues = 0;
  let cautionDeposit = 0;
  let advancePaid = 0;

  for (const f of feeRows) {
    rentDues += Math.max(0, Number(f.balance));
    if (Number(f.security_deposit) > 0 && Number(f.amount_paid) >= Number(f.security_deposit)) {
      cautionDeposit += Number(f.security_deposit);
    }
    if (Number(f.amount_paid) > Number(f.total_amount - f.discount)) {
      advancePaid += Number(f.amount_paid) - Number(f.total_amount - f.discount);
    }
  }

  const messRes = await db.one(
    `SELECT COALESCE(SUM(net_amount), 0) AS mess_dues FROM mess_bills WHERE student_id = ? AND status = 'published'`,
    [studentId], conn || db.pool);
  const messDues = Number(messRes?.mess_dues || 0);
  const damages = Number(damageCharges || 0);

  // Settlement formula: mess dues + rent + damages - advance - deposit
  const finalSettlement = (messDues + rentDues + damages) - (advancePaid + cautionDeposit);

  return {
    messDues,
    rentDues,
    damageCharges: damages,
    advancePaid,
    cautionDeposit,
    finalSettlement,
    breakdown: feeRows,
  };
}

async function loadExit(id, conn) {
  const e = await db.one(
    `SELECT e.*, s.name AS student_name, s.register_number, s.user_id, ra.hostel_id, b.bed_code
       FROM hostel_exit_records e JOIN students s ON s.id = e.student_id
       JOIN room_allocations ra ON ra.id = e.allocation_id JOIN beds b ON b.id = ra.bed_id
      WHERE e.id = ? ${conn ? 'FOR UPDATE' : ''}`, [id], conn || db.pool);
  if (!e) throw notFound('Exit record');
  return e;
}

function assertAccess(user, e) {
  if (isStudent(user)) { if (user.studentId !== e.student_id) throw forbidden(); return; }
  if (!isAdmin(user) && !user.hostelIds.includes(e.hostel_id)) throw forbidden('This record is outside your scope');
}

/** POST /api/exits  { studentId (staff only), requestedExitDate, reason, reasonDetails } */
router.post('/', authorize('exits.request', 'exits.manage'),
  validate(z.object({
    studentId: z.coerce.number().int().positive().optional(),
    requestedExitDate: date,
    reason: z.enum(['course_completed', 'discontinued', 'transfer_to_day_scholar', 'medical', 'disciplinary', 'other']),
    reasonDetails: z.string().trim().max(500).optional(),
  })),
  async (req, res) => {
    const b = req.body;
    const studentId = isStudent(req.user) ? req.user.studentId : b.studentId;
    if (!studentId) throw badRequest('studentId is required', 'STUDENT_REQUIRED');
    if (b.requestedExitDate < toDateStr()) throw badRequest('Exit date cannot be in the past', 'INVALID_DATE');
    if (isStudent(req.user) && b.reason === 'disciplinary') throw badRequest('Invalid reason', 'INVALID_REASON');
    const alloc = await db.one(
      `SELECT ra.id, ra.hostel_id, s.name FROM room_allocations ra JOIN students s ON s.id = ra.student_id WHERE ra.student_id = ? AND ra.status = 'active'`, [studentId]);
    if (!alloc) throw conflict('Student does not hold an active bed allocation', 'NO_ACTIVE_ALLOCATION');
    if (!isStudent(req.user) && !isAdmin(req.user) && !req.user.hostelIds.includes(alloc.hostel_id)) throw forbidden();
    const due = await pendingFees(studentId);
    const id = await db.transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO hostel_exit_records (student_id, allocation_id, requested_exit_date, reason, reason_details, pending_fees, requested_by)
         VALUES (?,?,?,?,?,?,?)`, [studentId, alloc.id, b.requestedExitDate, b.reason, b.reasonDetails || null, due, req.user.id]);
      await notify(await hostelWardenIds(alloc.hostel_id, conn), {
        type: 'exit_requested', title: 'Hostel exit requested', message: `${alloc.name} requested exit on ${b.requestedExitDate}.`, link: `/exits?highlight=${r.insertId}`,
      }, conn);
      await audit(req, { action: 'EXIT_REQUESTED', module: 'exits', recordId: r.insertId, summary: `Exit requested for ${alloc.name} (${b.reason})`, newValue: b }, conn);
      return r.insertId;
    });
    created(res, { id, pendingFees: due });
  });

/** GET /api/exits  ?status&hostelId&search&from&to */
router.get('/', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const q = parseList(req.query, { sortable: { created: 'e.created_at', exit: 'e.requested_exit_date' }, defaultSort: 'created' });
  const where = new Where()
    .addIf(q.status, 'e.clearance_status = ?', q.status)
    .addIf(q.hostelId, 'ra.hostel_id = ?', q.hostelId)
    .addIf(q.from, 'e.requested_exit_date >= ?', q.from)
    .addIf(q.to, 'e.requested_exit_date <= ?', q.to)
    .search(q.search, ['s.name', 's.register_number']);
  if (isStudent(req.user)) where.add('e.student_id = ?', req.user.studentId || 0);
  else if (!isAdmin(req.user)) where.add('ra.hostel_id IN (?)', req.user.hostelIds.length ? req.user.hostelIds : [0]);
  paged(res, await paginate(db, {
    select: `e.*, s.name AS student_name, s.register_number, d.short_name AS department, b.bed_code, h.code AS hostel_code,
             ui.name AS inspected_by_name, ua.name AS approved_by_name`,
    from: `FROM hostel_exit_records e JOIN students s ON s.id = e.student_id JOIN departments d ON d.id = s.department_id
           JOIN room_allocations ra ON ra.id = e.allocation_id JOIN beds b ON b.id = ra.bed_id JOIN hostels h ON h.id = ra.hostel_id
           LEFT JOIN users ui ON ui.id = e.inspected_by LEFT JOIN users ua ON ua.id = e.approved_by`,
    where, ...q,
  }));
});

/** PATCH /api/exits/:id/inspect  { roomCondition, inspectionNotes, damageCharges } */
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
      if (e.clearance_status !== 'requested') throw conflict(`Exit is ${e.clearance_status}; inspection is no longer possible`, 'INVALID_TRANSITION');
      const due = await pendingFees(e.student_id, conn);
      await conn.query(
        `UPDATE hostel_exit_records SET room_condition = ?, inspection_notes = ?, damage_charges = ?, pending_fees = ?, inspected_by = ?, clearance_status = 'inspected' WHERE id = ?`,
        [req.body.roomCondition, req.body.inspectionNotes, req.body.damageCharges, due, req.user.id, e.id]);
      await audit(req, { action: 'EXIT_INSPECTED', module: 'exits', recordId: e.id, summary: `Room ${e.bed_code} inspected: ${req.body.roomCondition}, damage ₹${req.body.damageCharges}`, newValue: req.body }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  });

/**
 * PATCH /api/exits/:id/clear  { exitDate, acknowledgeDues, remarks }
 * Verifies fees, releases the bed, marks the student exited - all in one transaction.
 */
router.patch('/:id/clear', authorize('exits.manage'),
  validate(z.object({ exitDate: date, acknowledgeDues: z.boolean().default(false), remarks: z.string().trim().max(255).optional() })),
  async (req, res) => {
    const out = await db.transaction(async (conn) => {
      const e = await loadExit(req.params.id, conn);
      assertAccess(req.user, e);
      if (e.clearance_status !== 'inspected') throw conflict('Room inspection must be completed before clearance', 'INSPECTION_REQUIRED');
      const due = await pendingFees(e.student_id, conn);
      const outstanding = due + Number(e.damage_charges);
      if (outstanding > 0 && !req.body.acknowledgeDues) {
        throw conflict(`Student has ₹${outstanding.toLocaleString('en-IN')} outstanding (fees ₹${due}, damages ₹${e.damage_charges}). Confirm to clear with dues recorded.`, 'PENDING_DUES');
      }
      await conn.query(
        `UPDATE hostel_exit_records SET clearance_status = 'cleared', exit_date = ?, pending_fees = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
        [req.body.exitDate, due, req.user.id, e.id]);
      const v = await vacate(req, e.allocation_id, `Hostel exit: ${e.reason}${req.body.remarks ? ` - ${req.body.remarks}` : ''}`, conn);
      await notify(e.user_id, {
        type: 'exit_cleared', title: 'Hostel exit cleared',
        message: `Your exit is cleared and bed ${v.bedCode} released.${outstanding > 0 ? ` Outstanding dues: ₹${outstanding.toLocaleString('en-IN')}.` : ''}`, link: '/my/hostel',
      }, conn);
      await audit(req, { action: 'EXIT_CLEARED', module: 'exits', recordId: e.id, summary: `Exit cleared for ${e.register_number} - ${e.student_name}; ${v.bedCode} released`, newValue: { ...req.body, outstanding } }, conn);
      return { id: e.id, outstanding };
    });
    ok(res, out);
  });

/** PATCH /api/exits/:id/reject  { remarks }   PATCH /api/exits/:id/cancel (student) */
const closeExit = (action) => [authorize(action === 'reject' ? 'exits.manage' : 'exits.request'),
  validate(z.object({ remarks: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const e = await loadExit(req.params.id, conn);
      assertAccess(req.user, e);
      if (!['requested', 'inspected'].includes(e.clearance_status)) throw conflict(`Exit is already ${e.clearance_status}`, 'INVALID_TRANSITION');
      const status = action === 'reject' ? 'rejected' : 'cancelled';
      await conn.query('UPDATE hostel_exit_records SET clearance_status = ?, inspection_notes = CONCAT_WS(' | ', inspection_notes, ?) WHERE id = ?', [status, req.body.remarks, e.id]);
      if (action === 'reject') await notify(e.user_id, { type: 'exit_rejected', title: 'Exit request rejected', message: req.body.remarks, link: '/my/hostel' }, conn);
      await audit(req, { action: `EXIT_${status.toUpperCase()}`, module: 'exits', recordId: e.id, summary: `${e.student_name}: ${req.body.remarks}` }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  }];
router.patch('/:id/reject', ...closeExit('reject'));
router.patch('/:id/cancel', ...closeExit('cancel'));

/** GET /api/exits/:id/settlement  detailed calculation breakdown */
router.get('/:id/settlement', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const settlement = await calculateSettlement(e.student_id, e.damage_charges);
  ok(res, { ...settlement, exitRecord: e });
});

/** GET /api/exits/:id/statement  download formal exit settlement PDF */
router.get('/:id/statement', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const settlement = await calculateSettlement(e.student_id, e.damage_charges);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="exit-settlement-${e.register_number}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#1e3a8a').text('HOSTEL MANAGEMENT ERP', { align: 'center' });
  doc.fontSize(12).fillColor('#4b5563').text('STUDENT EXIT & CLEARANCE SETTLEMENT STATEMENT', { align: 'center' });
  doc.moveDown(1);

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.8);

  doc.fontSize(10).fillColor('#111827');
  doc.text(`Student Name: ${e.student_name}`);
  doc.text(`Register Number: ${e.register_number}`);
  doc.text(`Bed / Room: ${e.bed_code}`);
  doc.text(`Exit Reason: ${e.reason}`);
  doc.text(`Requested Date: ${e.requested_exit_date}`);
  doc.text(`Clearance Status: ${e.clearance_status.toUpperCase()}`);
  doc.moveDown(1);

  doc.fontSize(12).fillColor('#1e3a8a').text('Final Settlement Calculation');
  doc.fontSize(9).fillColor('#6b7280').text('Formula: (Mess Dues + Rent Dues + Damage Charges) - (Advance Paid + Caution Deposit)');
  doc.moveDown(0.5);

  const startY = doc.y;
  doc.rect(40, startY, 515, 140).fill('#f9fafb');
  doc.fillColor('#111827').fontSize(10);
  doc.text(`1. Rent & Hostel Dues:`, 55, startY + 15);
  doc.text(`₹ ${settlement.rentDues.toLocaleString('en-IN')}`, 400, startY + 15, { align: 'right' });
  
  doc.text(`2. Pending Mess Bills:`, 55, startY + 35);
  doc.text(`₹ ${settlement.messDues.toLocaleString('en-IN')}`, 400, startY + 35, { align: 'right' });

  doc.text(`3. Damage / Repair Charges:`, 55, startY + 55);
  doc.text(`₹ ${settlement.damageCharges.toLocaleString('en-IN')}`, 400, startY + 55, { align: 'right' });

  doc.text(`4. Less: Caution Deposit:`, 55, startY + 75);
  doc.text(`- ₹ ${settlement.cautionDeposit.toLocaleString('en-IN')}`, 400, startY + 75, { align: 'right' });

  doc.text(`5. Less: Advance Paid:`, 55, startY + 95);
  doc.text(`- ₹ ${settlement.advancePaid.toLocaleString('en-IN')}`, 400, startY + 95, { align: 'right' });

  doc.strokeColor('#1e3a8a').lineWidth(1.5).moveTo(55, startY + 115).lineTo(540, startY + 115).stroke();
  doc.fontSize(11).font('Helvetica-Bold').fillColor(settlement.finalSettlement > 0 ? '#b91c1c' : '#15803d');
  doc.text(`NET PAYABLE / (REFUNDABLE):`, 55, startY + 122);
  doc.text(`₹ ${settlement.finalSettlement.toLocaleString('en-IN')}`, 400, startY + 122, { align: 'right' });

  doc.font('Helvetica').fontSize(8).fillColor('#9ca3af').text(`Generated on ${new Date().toLocaleString('en-IN')} by Hostel ERP Clearance Authority`, 40, doc.page.height - 50, { align: 'center' });
  doc.end();
});

module.exports = router;
