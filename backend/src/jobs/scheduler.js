// Periodic automation: SLA escalation, overdue leave returns, fee alerts, exception scans.
// Every job is idempotent (dedupe keys / INSERT IGNORE), so running it often is safe.
const db = require('../config/db');
const { notify, hostelWardenIds, adminIds, parentUserIds } = require('../services/notify');
const { getNumber } = require('../services/settings');
const { scanExceptions } = require('../modules/attendance/attendance.service');
const { toDateStr } = require('../utils/helpers');

let timer = null;

/** Level 0 -> 1 (warden) when SLA is breached; 1 -> 2 (administrator) after another full SLA window. */
async function escalateComplaints() {
  const toWarden = await db.query(
    `SELECT id, complaint_code, title, hostel_id, priority, assigned_to FROM complaints
      WHERE status IN ('pending','assigned','in_progress') AND escalation_level = 0 AND sla_due_at < NOW()`);
  for (const c of toWarden) {
    await db.transaction(async (conn) => {
      await conn.query('UPDATE complaints SET escalation_level = 1, escalated_at = NOW() WHERE id = ? AND escalation_level = 0', [c.id]);
      await conn.query("INSERT INTO complaint_updates (complaint_id, update_type, note) VALUES (?, 'escalation', 'SLA breached - escalated to warden')", [c.id]);
      await notify([...(await hostelWardenIds(c.hostel_id, conn)), c.assigned_to], {
        type: 'sla_breached', title: `SLA breached: ${c.complaint_code}`, message: `${c.title} (${c.priority}) has exceeded its resolution time.`,
        link: `/complaints/${c.id}`, dedupeKey: `sla1:${c.id}`,
      }, conn);
    });
  }
  const toAdmin = await db.query(
    `SELECT id, complaint_code, title, priority FROM complaints
      WHERE status IN ('pending','assigned','in_progress') AND escalation_level = 1 AND sla_due_at + INTERVAL sla_hours HOUR < NOW()`);
  for (const c of toAdmin) {
    await db.transaction(async (conn) => {
      await conn.query('UPDATE complaints SET escalation_level = 2, escalated_at = NOW() WHERE id = ? AND escalation_level = 1', [c.id]);
      await conn.query("INSERT INTO complaint_updates (complaint_id, update_type, note) VALUES (?, 'escalation', 'Unresolved for twice the SLA - escalated to hostel administrator')", [c.id]);
      await notify(await adminIds(conn), {
        type: 'sla_escalated', title: `Escalated: ${c.complaint_code}`, message: `${c.title} (${c.priority}) is unresolved for twice its SLA.`,
        link: `/complaints/${c.id}`, dedupeKey: `sla2:${c.id}`,
      }, conn);
    });
  }
  return { toWarden: toWarden.length, toAdmin: toAdmin.length };
}

/** Approved leave past expected return (+ grace) without a recorded return -> exception + warden alert. */
async function detectOverdueReturns() {
  const grace = await getNumber('leave_return_grace_hours');
  const rows = await db.query(
    `SELECT lr.id, lr.leave_code, lr.student_id, lr.expected_return_at, s.name, s.user_id, ra.hostel_id
       FROM leave_requests lr JOIN students s ON s.id = lr.student_id
       JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
      WHERE lr.status = 'approved' AND lr.returned_at IS NULL AND lr.expected_return_at + INTERVAL ? HOUR < NOW()`, [grace]);
  let created = 0;
  for (const l of rows) {
    const [r] = await db.pool.query(
      `INSERT IGNORE INTO attendance_exceptions (student_id, hostel_id, exception_date, exception_type, details) VALUES (?,?,?,?,?)`,
      [l.student_id, l.hostel_id, l.expected_return_at.slice(0, 10), 'leave_overdue', `${l.leave_code}: expected back by ${l.expected_return_at}`]);
    created += r.affectedRows;
    await notify(await hostelWardenIds(l.hostel_id), {
      type: 'leave_overdue', title: 'Leave return overdue', message: `${l.name} (${l.leave_code}) was expected back by ${l.expected_return_at}.`,
      link: `/leaves?highlight=${l.id}`, dedupeKey: `leave_overdue:${l.id}`,
    });
    await notify(l.user_id, {
      type: 'leave_overdue', title: 'You are overdue from leave', message: `You were expected back by ${l.expected_return_at}. Please contact your warden.`,
      link: '/my/leaves', dedupeKey: `leave_overdue:${l.id}`,
    });
    await notify(await parentUserIds(l.student_id), {
      type: 'leave_overdue', title: `${l.name} has not returned to the hostel`, message: `${l.leave_code}: expected back by ${l.expected_return_at}. Please contact the warden.`,
      link: `/children/${l.student_id}`, dedupeKey: `leave_overdue:${l.id}`,
    });
  }
  return { overdue: rows.length, newExceptions: created };
}

/** Reminders before due date and alerts once a fee becomes overdue (one of each per fee). */
async function feeAlerts() {
  const soon = await getNumber('fee_due_soon_days');
  const rows = await db.query(
    `SELECT sf.id, sf.student_id, sf.due_date, (sf.total_amount - sf.discount - sf.amount_paid) AS balance, s.user_id, s.name AS student_name, fs.name,
            (sf.due_date < CURDATE()) AS overdue
       FROM student_fees sf JOIN students s ON s.id = sf.student_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id
      WHERE sf.waived = 0 AND sf.amount_paid < sf.total_amount - sf.discount AND sf.due_date <= CURDATE() + INTERVAL ? DAY`, [soon]);
  let sent = 0;
  for (const f of rows) {
    sent += await notify(f.user_id, f.overdue ? {
      type: 'fee_overdue', title: 'Hostel fee overdue', message: `${f.name}: ₹${Number(f.balance).toLocaleString('en-IN')} was due on ${f.due_date}.`, link: '/my/fees', dedupeKey: `fee_overdue:${f.id}`,
    } : {
      type: 'fee_due', title: 'Hostel fee due soon', message: `${f.name}: ₹${Number(f.balance).toLocaleString('en-IN')} is due on ${f.due_date}.`, link: '/my/fees', dedupeKey: `fee_due:${f.id}`,
    });
    if (f.overdue) {
      await notify(await parentUserIds(f.student_id), {
        type: 'fee_overdue', title: `${f.student_name}'s hostel fee is overdue`, message: `${f.name}: ₹${Number(f.balance).toLocaleString('en-IN')} was due on ${f.due_date}.`,
        link: `/children/${f.student_id}`, dedupeKey: `fee_overdue:${f.id}`,
      });
    }
  }
  return { candidates: rows.length, sent };
}

/** Resolved complaints the student never confirmed are closed after 72 hours. */
async function autoCloseResolved() {
  const rows = await db.query("SELECT id FROM complaints WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL 72 HOUR");
  for (const c of rows) {
    await db.transaction(async (conn) => {
      await conn.query("UPDATE complaints SET status = 'closed', closed_at = NOW() WHERE id = ? AND status = 'resolved'", [c.id]);
      await conn.query("INSERT INTO complaint_updates (complaint_id, update_type, from_status, to_status, note) VALUES (?, 'status', 'resolved', 'closed', 'Auto-closed: no response from student within 72 hours')", [c.id]);
    });
  }
  return { closed: rows.length };
}

async function runAll() {
  const today = toDateStr();
  const yesterday = toDateStr(new Date(Date.now() - 86_400_000));
  const result = {
    complaints: await escalateComplaints(),
    leaves: await detectOverdueReturns(),
    fees: await feeAlerts(),
    autoClosed: await autoCloseResolved(),
  };
  await scanExceptions(yesterday);
  await scanExceptions(today);
  return result;
}

function start(intervalMinutes) {
  const tick = () => runAll().catch((err) => console.error('[jobs] run failed:', err.message));
  setTimeout(tick, 5_000);
  timer = setInterval(tick, intervalMinutes * 60_000);
  console.log(`Background jobs every ${intervalMinutes} min (SLA escalation, overdue leave, fee alerts, exceptions)`);
}

function stop() { if (timer) clearInterval(timer); }

module.exports = { start, stop, runAll, escalateComplaints, detectOverdueReturns, feeAlerts, autoCloseResolved };
