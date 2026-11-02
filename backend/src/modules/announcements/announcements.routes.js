const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, forbidden } = require('../../utils/AppError');
const { ok, created } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { isAdmin, isStudent, assertHostelAccess } = require('../../utils/scope');

router.use(authenticate);

const body = z.object({
  hostelId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(5).max(4000),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  audience: z.enum(['all', 'students', 'staff']).default('all'),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
});

/** GET /api/announcements  active announcements visible to the user */
router.get('/', authorize('announcements.view'), async (req, res) => {
  const params = [];
  let scope = '1=1';
  if (!isAdmin(req.user)) { scope = '(a.hostel_id IS NULL OR a.hostel_id IN (?))'; params.push(req.user.hostelIds.length ? req.user.hostelIds : [0]); }
  const audience = isStudent(req.user) ? "a.audience IN ('all','students')" : req.user.role === 'parent' ? "a.audience = 'all'" : isAdmin(req.user) || req.user.permissions.has('announcements.manage') ? '1=1' : "a.audience IN ('all','staff')";
  const includeExpired = req.query.all === 'true' && req.user.permissions.has('announcements.manage');
  ok(res, await db.query(
    `SELECT a.*, h.name AS hostel_name, u.name AS published_by_name
       FROM announcements a LEFT JOIN hostels h ON h.id = a.hostel_id LEFT JOIN users u ON u.id = a.published_by
      WHERE a.deleted_at IS NULL AND ${scope} AND ${audience} ${includeExpired ? '' : 'AND (a.expires_at IS NULL OR a.expires_at > NOW())'}
      ORDER BY FIELD(a.priority,'urgent','important','normal'), a.published_at DESC LIMIT 100`, params));
});

/** POST /api/announcements  publishes and notifies the audience (important/urgent only) */
router.post('/', authorize('announcements.manage'), validate(body), async (req, res) => {
  const b = req.body;
  if (b.hostelId) assertHostelAccess(req.user, b.hostelId);
  else if (!isAdmin(req.user)) throw forbidden('Only administrators can publish to all hostels');
  const id = await db.transaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO announcements (hostel_id, title, body, priority, audience, published_by, expires_at) VALUES (?,?,?,?,?,?,?)',
      [b.hostelId || null, b.title, b.body, b.priority, b.audience, req.user.id, b.expiresAt || null]);
    if (b.priority !== 'normal') {
      const recipients = await db.query(
        `SELECT DISTINCT u.id FROM users u JOIN roles ro ON ro.id = u.role_id
           LEFT JOIN students s ON s.user_id = u.id LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
           LEFT JOIN user_hostels uh ON uh.user_id = u.id
          WHERE u.status = 'active' AND u.deleted_at IS NULL AND u.id <> ?
            AND (? = 'all' OR (? = 'students' AND ro.name = 'student') OR (? = 'staff' AND ro.name <> 'student'))
            AND (? IS NULL OR ra.hostel_id = ? OR uh.hostel_id = ? OR ro.name = 'super_admin')
            AND (ro.name <> 'student' OR ra.id IS NOT NULL)`,
        [req.user.id, b.audience, b.audience, b.audience, b.hostelId || null, b.hostelId || null, b.hostelId || null], conn);
      await notify(recipients.map((x) => x.id), { type: 'announcement', title: `${b.priority === 'urgent' ? 'URGENT: ' : ''}${b.title}`, message: b.body.slice(0, 200), link: '/announcements' }, conn);
    }
    await audit(req, { action: 'ANNOUNCEMENT_PUBLISHED', module: 'announcements', recordId: r.insertId, summary: b.title, newValue: b }, conn);
    return r.insertId;
  });
  created(res, { id });
});

/** DELETE /api/announcements/:id  (soft delete) */
router.delete('/:id', authorize('announcements.manage'), async (req, res) => {
  const a = await db.one('SELECT * FROM announcements WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!a) throw notFound('Announcement');
  if (a.hostel_id) assertHostelAccess(req.user, a.hostel_id); else if (!isAdmin(req.user)) throw forbidden();
  await db.query('UPDATE announcements SET deleted_at = NOW() WHERE id = ?', [a.id]);
  await audit(req, { action: 'ANNOUNCEMENT_REMOVED', module: 'announcements', recordId: a.id, summary: a.title, oldValue: a });
  ok(res, { id: a.id });
});

module.exports = router;
