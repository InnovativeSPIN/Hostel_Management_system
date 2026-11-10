const fs = require('fs');
const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { upload, checkUploads, sendUpload } = require('../../middleware/upload');
const { notFound, forbidden, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify, hostelWardenIds } = require('../../services/notify');
const { slaHours } = require('../../services/settings');
const { isStudent, isAdmin } = require('../../utils/scope');
const { tempCode, assignCode } = require('../../utils/helpers');
const { TRANSITIONS, pickAssignee, suggest } = require('./complaints.service');

router.use(authenticate);

const CATEGORIES = ['electrical', 'plumbing', 'cleaning', 'internet', 'furniture', 'food', 'security', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const SELECT = `c.*, s.name AS student_name, s.register_number, s.phone AS student_phone, h.code AS hostel_code, h.name AS hostel_name,
  r.room_number, u.name AS assigned_to_name, u.phone AS assigned_to_phone,
  (c.status IN ('pending','assigned','in_progress') AND c.sla_due_at < NOW()) AS sla_breached,
  (c.resolved_at IS NOT NULL AND c.resolved_at > c.sla_due_at) AS resolved_late,
  TIMESTAMPDIFF(MINUTE, NOW(), c.sla_due_at) AS minutes_to_sla`;
const FROM = `FROM complaints c JOIN students s ON s.id = c.student_id JOIN hostels h ON h.id = c.hostel_id
  LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN users u ON u.id = c.assigned_to`;

// Role the current user plays for a complaint, used by the transition table.
function actorRole(user, c) {
  if (isStudent(user)) return c.student_id === user.studentId ? 'student' : null;
  if (user.permissions.has('complaints.assign') && (isAdmin(user) || user.hostelIds.includes(c.hostel_id))) return 'manager';
  if (user.permissions.has('complaints.work') && c.assigned_to === user.id) return 'staff';
  return null;
}

async function loadComplaint(id, conn) {
  const c = await db.one(`SELECT ${SELECT}, s.user_id AS student_user_id ${FROM} WHERE c.id = ? ${conn ? 'FOR UPDATE' : ''}`, [id], conn || db.pool);
  if (!c) throw notFound('Complaint');
  return c;
}

function canView(user, c) {
  if (isStudent(user)) return c.student_id === user.studentId;
  if (user.permissions.has('complaints.view_all')) return isAdmin(user) || user.hostelIds.includes(c.hostel_id);
  return c.assigned_to === user.id;
}

async function addUpdate(conn, complaintId, userId, type, from, to, note) {
  await conn.query('INSERT INTO complaint_updates (complaint_id, user_id, update_type, from_status, to_status, note) VALUES (?,?,?,?,?,?)',
    [complaintId, userId, type, from, to, note || null]);
}

/** POST /api/complaints/suggest  { text } -> rule-based category/priority suggestion */
router.post('/suggest', validate(z.object({ text: z.string().max(2000) })), (req, res) => ok(res, suggest(req.body.text)));

/** POST /api/complaints  { category, priority, title, description, studentId (staff only), images (1-3 files) } - auto-assigns by skill and workload */
router.post('/', authorize('complaints.create', 'complaints.assign'),
  upload.array('images', 5), checkUploads,
  validate(z.object({
    studentId: z.coerce.number().int().positive().optional(),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    title: z.string().trim().min(5).max(150),
    description: z.string().trim().min(10, 'Please describe the problem in a little more detail').max(2000),
  })),
  async (req, res) => {
    const files = req.files || [];
    if (req.is('multipart/form-data')) {
      if (files.length < 1 || files.length > 3) {
        files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (_) {} });
        throw badRequest('Please provide between 1 and 3 image proofs', 'PROOF_COUNT_INVALID');
      }
    }
    const b = req.body;
    const studentId = isStudent(req.user) ? req.user.studentId : b.studentId;
    if (!studentId) throw badRequest('studentId is required', 'STUDENT_REQUIRED');
    const alloc = await db.one(
      `SELECT ra.hostel_id, ra.room_id, s.user_id, s.name FROM room_allocations ra JOIN students s ON s.id = ra.student_id
        WHERE ra.student_id = ? AND ra.status = 'active'`, [studentId]);
    if (!alloc) throw conflict('Complaints can only be raised by current hostel residents', 'NOT_A_RESIDENT');
    if (!isStudent(req.user) && !isAdmin(req.user) && !req.user.hostelIds.includes(alloc.hostel_id)) throw forbidden();

    // Prevent accidental duplicate submissions (same title within 10 minutes).
    const dup = await db.one(
      `SELECT complaint_code FROM complaints WHERE student_id = ? AND title = ? AND created_at > NOW() - INTERVAL 10 MINUTE`, [studentId, b.title]);
    if (dup) throw conflict(`You already submitted this complaint (${dup.complaint_code})`, 'DUPLICATE_COMPLAINT');

    const hours = await slaHours(b.priority);
    const out = await db.transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO complaints (complaint_code, student_id, hostel_id, room_id, category, priority, title, description, sla_hours, sla_due_at)
         VALUES (?,?,?,?,?,?,?,?,?, NOW() + INTERVAL ? HOUR)`,
        [tempCode(), studentId, alloc.hostel_id, alloc.room_id, b.category, b.priority, b.title, b.description, hours, hours]);
      const code = await assignCode(conn, 'complaints', 'complaint_code', 'CMP', r.insertId);
      await addUpdate(conn, r.insertId, req.user.id, 'status', null, 'pending', 'Complaint submitted');

      if (files.length > 0) {
        for (const f of files) {
          await conn.query(
            'INSERT INTO complaint_attachments (complaint_id, file_name, original_name, mime_type, file_size) VALUES (?,?,?,?,?)',
            [r.insertId, f.filename, f.originalname, f.mimetype, f.size]
          );
        }
      }

      const assignee = await pickAssignee(conn, alloc.hostel_id, b.category);
      if (assignee) {
        await conn.query("UPDATE complaints SET assigned_to = ?, status = 'assigned' WHERE id = ?", [assignee.id, r.insertId]);
        await conn.query('INSERT INTO complaint_assignments (complaint_id, assigned_to, assigned_by) VALUES (?,?,NULL)', [r.insertId, assignee.id]);
        await addUpdate(conn, r.insertId, null, 'assignment', 'pending', 'assigned', `Auto-assigned to ${assignee.name} (skill match / lowest workload)`);
        await notify(assignee.id, { type: 'complaint_assigned', title: `New ${b.priority} complaint ${code}`, message: `${b.title} — resolve within ${hours}h.`, link: `/complaints/${r.insertId}` }, conn);
      } else {
        await notify(await hostelWardenIds(alloc.hostel_id, conn), { type: 'complaint_unassigned', title: `Complaint ${code} needs assignment`, message: `${b.title} (${b.category}, ${b.priority})`, link: `/complaints/${r.insertId}` }, conn);
      }
      await notify(alloc.user_id, { type: 'complaint_created', title: `Complaint ${code} registered`, message: `Expected resolution within ${hours} hours.${assignee ? ` Assigned to ${assignee.name}.` : ''}`, link: `/complaints/${r.insertId}` }, conn);
      await audit(req, { action: 'COMPLAINT_CREATED', module: 'complaints', recordId: r.insertId, summary: `${code}: ${b.title} (${b.category}/${b.priority})`, newValue: b }, conn);
      return { id: r.insertId, complaintCode: code, assignedTo: assignee?.name || null, slaHours: hours, attachmentsCount: files.length };
    });
    created(res, out);
  });

/**
 * GET /api/complaints
 * Filters: status (or open=true), category, priority, hostelId, assignedTo, from/to, sla=breached|due_today|on_track, search
 */
router.get('/', async (req, res) => {
  const q = parseList(req.query, {
    sortable: { created: 'c.created_at', sla: 'c.sla_due_at', priority: "FIELD(c.priority,'critical','high','medium','low')", status: 'c.status' },
    defaultSort: 'created',
  });
  const where = new Where()
    .addIf(q.status, 'c.status = ?', q.status)
    .addIf(q.category, 'c.category = ?', q.category)
    .addIf(q.priority, 'c.priority = ?', q.priority)
    .addIf(q.hostelId, 'c.hostel_id = ?', q.hostelId)
    .addIf(q.assignedTo, 'c.assigned_to = ?', q.assignedTo)
    .addIf(q.from, 'c.created_at >= ?', q.from)
    .addIf(q.to, 'c.created_at < DATE_ADD(?, INTERVAL 1 DAY)', q.to)
    .search(q.search, ['c.complaint_code', 'c.title', 's.name', 's.register_number', 'r.room_number']);
  if (q.open === 'true') where.add("c.status IN ('pending','assigned','in_progress')");
  if (q.sla === 'breached') where.add("c.status IN ('pending','assigned','in_progress') AND c.sla_due_at < NOW()");
  if (q.sla === 'due_today') where.add("c.status IN ('pending','assigned','in_progress') AND c.sla_due_at BETWEEN NOW() AND CONCAT(CURDATE(), ' 23:59:59')");
  if (q.sla === 'on_track') where.add("c.status IN ('pending','assigned','in_progress') AND c.sla_due_at >= NOW()");
  if (q.escalated === 'true') where.add('c.escalation_level > 0');

  if (isStudent(req.user)) where.add('c.student_id = ?', req.user.studentId || 0);
  else if (req.user.permissions.has('complaints.view_all')) { if (!isAdmin(req.user)) where.add('c.hostel_id IN (?)', req.user.hostelIds.length ? req.user.hostelIds : [0]); }
  else if (req.user.permissions.has('complaints.work')) where.add('c.assigned_to = ?', req.user.id);
  else throw forbidden();

  paged(res, await paginate(db, { select: SELECT, from: FROM, where, ...q }));
});

/** GET /api/complaints/:id  complaint with full lifecycle timeline */
router.get('/:id', async (req, res) => {
  const c = await loadComplaint(req.params.id);
  if (!canView(req.user, c)) throw forbidden();
  const [updates, assignments, maintenance, attachments] = await Promise.all([
    db.query(
      `SELECT cu.*, u.name AS user_name, r.label AS user_role FROM complaint_updates cu
         LEFT JOIN users u ON u.id = cu.user_id LEFT JOIN roles r ON r.id = u.role_id WHERE cu.complaint_id = ? ORDER BY cu.id`, [c.id]),
    db.query(
      `SELECT ca.*, u.name AS assigned_to_name, b.name AS assigned_by_name FROM complaint_assignments ca
         JOIN users u ON u.id = ca.assigned_to LEFT JOIN users b ON b.id = ca.assigned_by WHERE ca.complaint_id = ? ORDER BY ca.id`, [c.id]),
    db.query('SELECT id, request_code, status FROM maintenance_requests WHERE complaint_id = ?', [c.id]),
    db.query('SELECT id, file_name, original_name, mime_type, file_size, created_at FROM complaint_attachments WHERE complaint_id = ? ORDER BY id', [c.id]),
  ]);
  const role = actorRole(req.user, c);
  const allowed = role ? Object.entries(TRANSITIONS[c.status]).filter(([, roles]) => roles.includes(role)).map(([s]) => s) : [];
  ok(res, { ...c, updates, assignments, maintenance, attachments, actorRole: role, allowedTransitions: allowed });
});

/** GET /api/complaints/:id/attachments/:attachmentId  serve uploaded proof */
router.get('/:id/attachments/:attachmentId', async (req, res) => {
  const c = await loadComplaint(req.params.id);
  if (!canView(req.user, c)) throw forbidden();
  const att = await db.one('SELECT * FROM complaint_attachments WHERE id = ? AND complaint_id = ?', [req.params.attachmentId, c.id]);
  if (!att) throw notFound('Attachment');
  sendUpload(res, att.file_name, att.original_name);
});

/** PATCH /api/complaints/:id/assign  { assignedTo, note } */
router.patch('/:id/assign', authorize('complaints.assign'),
  validate(z.object({ assignedTo: z.coerce.number().int().positive(), note: z.string().trim().max(500).optional() })),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const c = await loadComplaint(req.params.id, conn);
      if (actorRole(req.user, c) !== 'manager') throw forbidden();
      if (!['pending', 'assigned', 'in_progress'].includes(c.status)) throw conflict(`Cannot reassign a ${c.status} complaint`, 'INVALID_TRANSITION');
      if (c.assigned_to === req.body.assignedTo) throw conflict('Complaint is already assigned to this person', 'ALREADY_ASSIGNED');
      const staff = await db.one(
        `SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id JOIN user_hostels uh ON uh.user_id = u.id AND uh.hostel_id = ?
          WHERE u.id = ? AND r.name IN ('staff','warden') AND u.status = 'active'`, [c.hostel_id, req.body.assignedTo], conn);
      if (!staff) throw badRequest('Assignee must be active staff of this hostel', 'INVALID_ASSIGNEE');
      await conn.query('UPDATE complaint_assignments SET is_current = 0, unassigned_at = NOW() WHERE complaint_id = ? AND is_current = 1', [c.id]);
      await conn.query('INSERT INTO complaint_assignments (complaint_id, assigned_to, assigned_by) VALUES (?,?,?)', [c.id, staff.id, req.user.id]);
      const newStatus = c.status === 'pending' ? 'assigned' : c.status;
      await conn.query('UPDATE complaints SET assigned_to = ?, status = ? WHERE id = ?', [staff.id, newStatus, c.id]);
      await addUpdate(conn, c.id, req.user.id, 'assignment', c.status, newStatus, `Assigned to ${staff.name}${req.body.note ? `: ${req.body.note}` : ''}`);
      await notify(staff.id, { type: 'complaint_assigned', title: `Complaint ${c.complaint_code} assigned to you`, message: `${c.title} (${c.priority}). SLA due ${c.sla_due_at}.`, link: `/complaints/${c.id}` }, conn);
      await notify(c.student_user_id, { type: 'complaint_assigned', title: `${c.complaint_code} assigned`, message: `${staff.name} is handling your complaint.`, link: `/complaints/${c.id}` }, conn);
      await audit(req, { action: 'COMPLAINT_ASSIGNED', module: 'complaints', recordId: c.id, summary: `${c.complaint_code} → ${staff.name}`, oldValue: { assignedTo: c.assigned_to_name }, newValue: { assignedTo: staff.name } }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  });

/**
 * PATCH /api/complaints/:id/status  { status, note, rating?, feedback? }
 * resolved -> closed (student confirms, with rating) | resolved -> in_progress (student says not fixed)
 */
router.patch('/:id/status', validate(z.object({
  status: z.enum(['assigned', 'in_progress', 'resolved', 'closed', 'rejected']),
  note: z.string().trim().max(1000).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  feedback: z.string().trim().max(500).optional(),
})), async (req, res) => {
  const b = req.body;
  const out = await db.transaction(async (conn) => {
    const c = await loadComplaint(req.params.id, conn);
    const role = actorRole(req.user, c);
    if (!role) throw forbidden();
    const allowed = TRANSITIONS[c.status][b.status];
    if (!allowed) throw conflict(`Cannot move complaint from "${c.status}" to "${b.status}"`, 'INVALID_TRANSITION');
    if (!allowed.includes(role)) throw forbidden(`Only ${allowed.join(' or ')} can move a complaint to "${b.status}"`);
    if (b.status === 'assigned' && !c.assigned_to) throw badRequest('Assign the complaint to a staff member first', 'ASSIGNEE_REQUIRED');
    if (['resolved', 'rejected'].includes(b.status) && !b.note) throw badRequest('Please add a note describing the outcome', 'NOTE_REQUIRED');
    if (c.status === 'resolved' && b.status === 'in_progress' && !b.note) throw badRequest('Please describe what is still not fixed', 'NOTE_REQUIRED');

    const sets = ['status = ?'];
    const vals = [b.status];
    if (b.status === 'resolved') { sets.push('resolved_at = NOW()', 'resolution_note = ?'); vals.push(b.note); }
    if (b.status === 'in_progress' && c.status === 'resolved') sets.push('resolved_at = NULL');
    if (b.status === 'closed') { sets.push('closed_at = NOW()'); if (b.rating) { sets.push('student_rating = ?', 'student_feedback = ?'); vals.push(b.rating, b.feedback || null); } }
    if (b.status === 'rejected') sets.push('closed_at = NOW()');
    await conn.query(`UPDATE complaints SET ${sets.join(', ')} WHERE id = ?`, [...vals, c.id]);
    const label = c.status === 'resolved' && b.status === 'in_progress' ? 'Reopened by student: ' : '';
    await addUpdate(conn, c.id, req.user.id, b.rating ? 'feedback' : 'status', c.status, b.status, `${label}${b.note || ''}${b.rating ? ` (rated ${b.rating}/5${b.feedback ? `: ${b.feedback}` : ''})` : ''}`.trim() || null);

    if (b.status === 'resolved') {
      await notify(c.student_user_id, { type: 'complaint_resolved', title: `${c.complaint_code} resolved`, message: `${b.note}. Please confirm or reopen if the issue persists.`, link: `/complaints/${c.id}` }, conn);
    } else if (b.status === 'rejected') {
      await notify(c.student_user_id, { type: 'complaint_rejected', title: `${c.complaint_code} rejected`, message: b.note, link: `/complaints/${c.id}` }, conn);
    } else if (b.status === 'in_progress' && c.status === 'resolved' && c.assigned_to) {
      await notify(c.assigned_to, { type: 'complaint_reopened', title: `${c.complaint_code} reopened`, message: b.note, link: `/complaints/${c.id}` }, conn);
    }
    await audit(req, { action: 'COMPLAINT_STATUS', module: 'complaints', recordId: c.id, summary: `${c.complaint_code}: ${c.status} → ${b.status}`, oldValue: { status: c.status }, newValue: b }, conn);
    return { id: c.id, status: b.status };
  });
  ok(res, out);
});

/** POST /api/complaints/:id/notes  { note } */
router.post('/:id/notes', validate(z.object({ note: z.string().trim().min(2).max(1000) })), async (req, res) => {
  const c = await loadComplaint(req.params.id);
  if (!canView(req.user, c) || !actorRole(req.user, c)) throw forbidden();
  await db.transaction((conn) => addUpdate(conn, c.id, req.user.id, 'note', null, null, req.body.note));
  created(res, { id: c.id });
});

module.exports = router;
