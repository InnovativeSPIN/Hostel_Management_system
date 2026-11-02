const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, forbidden, conflict } = require('../../utils/AppError');
const { ok, created } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const { isAdmin, isStudent, assertHostelAccess } = require('../../utils/scope');
const { hostelHealth } = require('../dashboard/health.service');

router.use(authenticate);

const hostelBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, 'Code must be 1-6 letters/digits'),
  name: z.string().trim().min(3).max(120),
  gender: z.enum(['male', 'female', 'co-ed']),
  hostelType: z.enum(['UG', 'PG', 'Mixed', 'International']).default('UG'),
  address: z.string().trim().max(255).optional().nullable(),
  wardenId: z.coerce.number().int().positive().optional().nullable(),
  contactPhone: z.string().trim().max(20).optional().nullable(),
  contactEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'maintenance']).default('active'),
});

const STATS = `
  (SELECT COUNT(*) FROM rooms r WHERE r.hostel_id = h.id AND r.deleted_at IS NULL) AS total_rooms,
  (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = h.id AND r.deleted_at IS NULL) AS total_beds,
  (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = h.id AND r.deleted_at IS NULL AND b.status = 'occupied') AS occupied_beds,
  (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = h.id AND r.deleted_at IS NULL AND b.status = 'available' AND r.status = 'active') AS available_beds,
  (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = h.id AND r.deleted_at IS NULL AND b.status IN ('maintenance','blocked')) AS unavailable_beds,
  (SELECT COUNT(*) FROM rooms r WHERE r.hostel_id = h.id AND r.status = 'maintenance' AND r.deleted_at IS NULL) AS maintenance_rooms`;

/** GET /api/hostels  (students get the basic list for application preferences) */
router.get('/', async (req, res) => {
  const scoped = !isAdmin(req.user) && !isStudent(req.user);
  const rows = await db.query(
    `SELECT h.id, h.code, h.name, h.gender, h.hostel_type, h.address, h.contact_phone, h.contact_email, h.status, h.total_floors,
            h.warden_id, w.name AS warden_name, w.phone AS warden_phone ${isStudent(req.user) ? '' : `, ${STATS}`}
       FROM hostels h LEFT JOIN users w ON w.id = h.warden_id
      WHERE h.deleted_at IS NULL ${scoped ? 'AND h.id IN (?)' : ''}
      ORDER BY h.code`, scoped ? [req.user.hostelIds.length ? req.user.hostelIds : [0]] : []);
  ok(res, rows);
});

/** GET /api/hostels/:id  hostel with floors and live statistics */
router.get('/:id', authorize('hostels.view'), async (req, res) => {
  assertHostelAccess(req.user, req.params.id);
  const hostel = await db.one(
    `SELECT h.*, w.name AS warden_name, w.phone AS warden_phone, w.email AS warden_email, ${STATS}
       FROM hostels h LEFT JOIN users w ON w.id = h.warden_id WHERE h.id = ? AND h.deleted_at IS NULL`, [req.params.id]);
  if (!hostel) throw notFound('Hostel');
  const floors = await db.query(
    `SELECT f.id, f.floor_number, f.label, COUNT(DISTINCT r.id) AS rooms,
            COUNT(b.id) AS beds, SUM(b.status = 'occupied') AS occupied, SUM(b.status = 'available' AND r.status = 'active') AS available
       FROM floors f LEFT JOIN rooms r ON r.floor_id = f.id AND r.deleted_at IS NULL LEFT JOIN beds b ON b.room_id = r.id
      WHERE f.hostel_id = ? GROUP BY f.id ORDER BY f.floor_number`, [hostel.id]);
  const staff = await db.query(
    `SELECT u.id, u.name, u.phone, u.designation, r.label AS role FROM user_hostels uh
       JOIN users u ON u.id = uh.user_id AND u.deleted_at IS NULL JOIN roles r ON r.id = u.role_id
      WHERE uh.hostel_id = ? ORDER BY r.id, u.name`, [hostel.id]);
  ok(res, { ...hostel, floors, staff, health: await hostelHealth(hostel.id) });
});

/** POST /api/hostels  (super admin) */
router.post('/', authorize('hostels.manage'), validate(hostelBody), async (req, res) => {
  if (!isAdmin(req.user)) throw forbidden('Only administrators can create hostels');
  const b = req.body;
  const [r] = await db.pool.query(
    `INSERT INTO hostels (code, name, gender, hostel_type, address, warden_id, contact_phone, contact_email, status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.code, b.name, b.gender, b.hostelType, b.address || null, b.wardenId || null, b.contactPhone || null, b.contactEmail || null, b.status]);
  if (b.wardenId) await db.query('INSERT IGNORE INTO user_hostels (user_id, hostel_id) VALUES (?,?)', [b.wardenId, r.insertId]);
  await audit(req, { action: 'HOSTEL_CREATED', module: 'hostels', recordId: r.insertId, summary: `Created hostel ${b.name}`, newValue: b });
  created(res, { id: r.insertId });
});

/** PUT /api/hostels/:id */
router.put('/:id', authorize('hostels.manage'), validate(hostelBody), async (req, res) => {
  assertHostelAccess(req.user, req.params.id);
  const before = await db.one('SELECT * FROM hostels WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!before) throw notFound('Hostel');
  const b = req.body;
  if (!isAdmin(req.user) && (b.wardenId ?? null) !== before.warden_id) throw forbidden('Only administrators can change the warden');
  if (b.gender !== before.gender) {
    const residents = await db.one("SELECT COUNT(*) AS n FROM room_allocations WHERE hostel_id = ? AND status = 'active'", [before.id]);
    if (residents.n > 0) throw conflict('Cannot change hostel gender while students are allocated', 'HOSTEL_HAS_RESIDENTS');
  }
  await db.query(
    `UPDATE hostels SET code=?, name=?, gender=?, hostel_type=?, address=?, warden_id=?, contact_phone=?, contact_email=?, status=? WHERE id = ?`,
    [b.code, b.name, b.gender, b.hostelType, b.address || null, b.wardenId || null, b.contactPhone || null, b.contactEmail || null, b.status, before.id]);
  if (b.wardenId) await db.query('INSERT IGNORE INTO user_hostels (user_id, hostel_id) VALUES (?,?)', [b.wardenId, before.id]);
  await audit(req, { action: 'HOSTEL_UPDATED', module: 'hostels', recordId: before.id, summary: `Updated hostel ${b.name}`, oldValue: before, newValue: b });
  ok(res, { id: before.id });
});

/** POST /api/hostels/:id/floors  { floorNumber, label } */
router.post('/:id/floors', authorize('hostels.manage'),
  validate(z.object({ floorNumber: z.coerce.number().int().min(-2).max(50), label: z.string().trim().max(60).optional() })),
  async (req, res) => {
    assertHostelAccess(req.user, req.params.id);
    const hostel = await db.one('SELECT id, name FROM hostels WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!hostel) throw notFound('Hostel');
    const label = req.body.label || (req.body.floorNumber === 0 ? 'Ground Floor' : `Floor ${req.body.floorNumber}`);
    const [r] = await db.pool.query('INSERT INTO floors (hostel_id, floor_number, label) VALUES (?,?,?)', [hostel.id, req.body.floorNumber, label])
      .catch((e) => { if (e.code === 'ER_DUP_ENTRY') throw conflict('This floor already exists', 'FLOOR_EXISTS'); throw e; });
    await db.query('UPDATE hostels SET total_floors = (SELECT COUNT(*) FROM floors WHERE hostel_id = ?) WHERE id = ?', [hostel.id, hostel.id]);
    await audit(req, { action: 'FLOOR_CREATED', module: 'hostels', recordId: r.insertId, summary: `Added ${label} to ${hostel.name}` });
    created(res, { id: r.insertId });
  });

/** GET /api/hostels/:id/floors */
router.get('/:id/floors', authorize('hostels.view', 'allocations.manage'), async (req, res) => {
  ok(res, await db.query('SELECT id, floor_number, label FROM floors WHERE hostel_id = ? ORDER BY floor_number', [req.params.id]));
});

module.exports = router;
