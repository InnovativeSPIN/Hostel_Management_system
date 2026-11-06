const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/exits/exits.routes.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldCalc = `async function calculateSettlement(exitId, conn) {
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
}`;

const newCalc = `async function calculateSettlement(exitId, conn) {
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

  // 1. General pending fees from student_fees
  const feesRow = await db.one(
    \`SELECT COALESCE(SUM(total_amount - discount - amount_paid), 0) AS due,
            COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM student_fees
      WHERE student_id = ? AND waived = 0\`,
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

  // 3. Room rent due
  const roomRentDue = 0.00;

  // 4. Damage charges
  const damageCharges = Number(e.damage_charges || 0);

  // 5. Caution deposit: check fee_structures_v2 for this student's fee structure
  const fsRow = await db.one(
    \`SELECT fsv2.caution_deposit, fsv2.room_rent
       FROM student_fees sf
       JOIN fee_structures_v2 fsv2 ON fsv2.id = sf.fee_structure_v2_id
      WHERE sf.student_id = ? LIMIT 1\`,
    [e.student_id], conn || db.pool);
  let cautionDeposit = Number(fsRow?.caution_deposit || (e.is_ac ? 5000 : 3000));

  // 6. Advance paid: excess amount paid if any
  const advancePaid = Math.max(0, Number(feesRow?.total_paid || 0) - Number(generalPendingFees));

  const totalDues = generalPendingFees + attendanceMessCharges + roomRentDue + damageCharges;
  const totalCredits = cautionDeposit + advancePaid;
  const net = totalDues - totalCredits;
  const netAmount = Math.abs(net);
  const settlementType = net > 0 ? 'payable' : net < 0 ? 'refundable' : 'nil';

  return {
    exitRecord: e,
    pendingFees: generalPendingFees,
    pendingMessBill: attendanceMessCharges,
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
}`;

code = code.replace(oldCalc, newCalc);
fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Fixed calculateSettlement in exits.routes.js');
