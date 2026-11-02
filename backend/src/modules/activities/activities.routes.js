const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict, forbidden, badRequest } = require('../../utils/AppError');
const { ok, created } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const { isAdmin, isStudent, assertHostelAccess } = require('../../utils/scope');

router.use(authenticate);

const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/).transform((s) => s.replace('T', ' '));
const body = z.object({
  hostelId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(['cultural', 'sports', 'technical', 'welfare', 'meeting', 'other']),
  venue: z.string().trim().max(150).optional(),
  startAt: dt,
  endAt: dt,
  maxParticipants: z.coerce.number().int().min(1).max(5000).optional().nullable(),
}).refine((b) => b.endAt > b.startAt, { message: 'End time must be after start time', path: ['endAt'] });

function hostelVisibility(user) {
  if (isAdmin(user)) return { sql: '1=1', params: [] };
  const ids = user.hostelIds.length ? user.hostelIds : [0];
  return { sql: '(a.hostel_id IS NULL OR a.hostel_id IN (?))', params: [ids] };
}

/** GET /api/activities  ?upcoming=true */
router.get('/', authorize('activities.view'), async (req, res) => {
  const vis = hostelVisibility(req.user);
  const upcoming = req.query.upcoming === 'true' ? "AND a.end_at >= NOW() AND a.status = 'scheduled'" : '';
  ok(res, await db.query(
    `SELECT a.*, h.name AS hostel_name, u.name AS created_by_name,
            (SELECT COUNT(*) FROM activity_participants p WHERE p.activity_id = a.id) AS participants,
            ${isStudent(req.user) ? 'EXISTS (SELECT 1 FROM activity_participants p WHERE p.activity_id = a.id AND p.student_id = ?)' : '0'} AS registered
       FROM activities a LEFT JOIN hostels h ON h.id = a.hostel_id LEFT JOIN users u ON u.id = a.created_by
      WHERE ${vis.sql} ${upcoming} ORDER BY a.start_at DESC LIMIT 200`,
    [...(isStudent(req.user) ? [req.user.studentId || 0] : []), ...vis.params]));
});

/** GET /api/activities/:id/participants */
router.get('/:id/participants', authorize('activities.manage'), async (req, res) => {
  ok(res, await db.query(
    `SELECT p.student_id, p.registered_at, p.attended, s.name, s.register_number, d.short_name AS department, s.year_of_study
       FROM activity_participants p JOIN students s ON s.id = p.student_id JOIN departments d ON d.id = s.department_id
      WHERE p.activity_id = ? ORDER BY s.name`, [req.params.id]));
});

/** POST /api/activities */
router.post('/', authorize('activities.manage'), validate(body), async (req, res) => {
  const b = req.body;
  if (b.hostelId) assertHostelAccess(req.user, b.hostelId);
  else if (!isAdmin(req.user)) throw forbidden('Only administrators can create campus-wide activities');
  const [r] = await db.pool.query(
    `INSERT INTO activities (hostel_id, title, description, category, venue, start_at, end_at, max_participants, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.hostelId || null, b.title, b.description || null, b.category, b.venue || null, b.startAt, b.endAt, b.maxParticipants || null, req.user.id]);
  await audit(req, { action: 'ACTIVITY_CREATED', module: 'activities', recordId: r.insertId, summary: b.title, newValue: b });
  created(res, { id: r.insertId });
});

/** PATCH /api/activities/:id/status  { status: completed|cancelled } */
router.patch('/:id/status', authorize('activities.manage'), validate(z.object({ status: z.enum(['scheduled', 'completed', 'cancelled']) })), async (req, res) => {
  const a = await db.one('SELECT * FROM activities WHERE id = ?', [req.params.id]);
  if (!a) throw notFound('Activity');
  if (a.hostel_id) assertHostelAccess(req.user, a.hostel_id);
  await db.query('UPDATE activities SET status = ? WHERE id = ?', [req.body.status, a.id]);
  await audit(req, { action: 'ACTIVITY_STATUS', module: 'activities', recordId: a.id, summary: `${a.title}: ${a.status} → ${req.body.status}` });
  ok(res, { id: a.id });
});

/** POST /api/activities/:id/register   DELETE /api/activities/:id/register  (students) */
router.post('/:id/register', authorize('activities.join'), async (req, res) => {
  await db.transaction(async (conn) => {
    const a = await db.one('SELECT * FROM activities WHERE id = ? FOR UPDATE', [req.params.id], conn);
    if (!a) throw notFound('Activity');
    if (a.status !== 'scheduled' || new Date(a.end_at.replace(' ', 'T')) < new Date()) throw conflict('Registration is closed for this activity', 'REGISTRATION_CLOSED');
    if (a.hostel_id && !req.user.hostelIds.includes(a.hostel_id)) throw forbidden('This activity is for another hostel');
    const count = await db.one('SELECT COUNT(*) AS n FROM activity_participants WHERE activity_id = ?', [a.id], conn);
    if (a.max_participants && count.n >= a.max_participants) throw conflict('This activity is full', 'ACTIVITY_FULL');
    const [r] = await conn.query('INSERT IGNORE INTO activity_participants (activity_id, student_id) VALUES (?,?)', [a.id, req.user.studentId]);
    if (!r.affectedRows) throw conflict('You are already registered', 'ALREADY_REGISTERED');
  });
  created(res, { id: Number(req.params.id) });
});

router.delete('/:id/register', authorize('activities.join'), async (req, res) => {
  const [r] = await db.pool.query('DELETE FROM activity_participants WHERE activity_id = ? AND student_id = ?', [req.params.id, req.user.studentId]);
  if (!r.affectedRows) throw badRequest('You are not registered for this activity', 'NOT_REGISTERED');
  ok(res, { id: Number(req.params.id) });
});

/** PATCH /api/activities/:id/attendance  { studentIds: [] } marks who attended */
router.patch('/:id/attendance', authorize('activities.manage'), validate(z.object({ studentIds: z.array(z.number().int().positive()) })), async (req, res) => {
  await db.transaction(async (conn) => {
    await conn.query('UPDATE activity_participants SET attended = 0 WHERE activity_id = ?', [req.params.id]);
    if (req.body.studentIds.length) await conn.query('UPDATE activity_participants SET attended = 1 WHERE activity_id = ? AND student_id IN (?)', [req.params.id, req.body.studentIds]);
  });
  ok(res, { id: Number(req.params.id) });
});

module.exports = router;
