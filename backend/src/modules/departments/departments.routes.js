const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound } = require('../../utils/AppError');
const { ok, created } = require('../../utils/respond');
const { audit } = require('../../services/audit');

router.use(authenticate);

const body = z.object({
  code: z.string().trim().toUpperCase().min(2).max(12),
  name: z.string().trim().min(3).max(120),
  shortName: z.string().trim().min(2).max(20),
  degree: z.enum(['B.E.', 'B.Tech.', 'M.E.', 'M.Tech.', 'MBA', 'MCA']),
  universityCode: z.string().trim().regex(/^\d{3}$/, 'Branch code must be 3 digits').optional().nullable(),
  hodName: z.string().trim().max(120).optional().nullable(),
  hodEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  hodPhone: z.string().trim().max(20).optional().nullable(),
  block: z.string().trim().max(60).optional().nullable(),
  annualIntake: z.coerce.number().int().min(0).max(1000).optional().nullable(),
  establishedYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  nbaAccredited: z.coerce.boolean().default(false),
  status: z.enum(['active', 'inactive']).default('active'),
});

const cols = (b) => [b.code, b.name, b.shortName, b.degree, b.universityCode || null, b.hodName || null, b.hodEmail || null,
  b.hodPhone || null, b.block || null, b.annualIntake ?? null, b.establishedYear ?? null, b.nbaAccredited ? 1 : 0, b.status];

/** GET /api/departments  with hostel resident statistics per department */
router.get('/', async (_req, res) => {
  ok(res, await db.query(
    `SELECT d.*,
            COUNT(s.id) AS total_students,
            SUM(s.hostel_status = 'resident') AS hostel_residents,
            SUM(s.hostel_status IN ('applied','approved')) AS pending_admissions
       FROM departments d LEFT JOIN students s ON s.department_id = d.id AND s.deleted_at IS NULL
      GROUP BY d.id ORDER BY d.degree, d.name`));
});

/** GET /api/departments/:id */
router.get('/:id', async (req, res) => {
  const dept = await db.one('SELECT * FROM departments WHERE id = ?', [req.params.id]);
  if (!dept) throw notFound('Department');
  const byYear = await db.query(
    `SELECT year_of_study, COUNT(*) AS students, SUM(hostel_status = 'resident') AS residents
       FROM students WHERE department_id = ? AND deleted_at IS NULL GROUP BY year_of_study ORDER BY year_of_study`, [dept.id]);
  ok(res, { ...dept, byYear });
});

/** POST /api/departments */
router.post('/', authorize('departments.manage'), validate(body), async (req, res) => {
  const [r] = await db.pool.query(
    `INSERT INTO departments (code, name, short_name, degree, university_code, hod_name, hod_email, hod_phone, block, annual_intake, established_year, nba_accredited, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, cols(req.body));
  await audit(req, { action: 'DEPARTMENT_CREATED', module: 'departments', recordId: r.insertId, summary: `Created department ${req.body.code}`, newValue: req.body });
  created(res, { id: r.insertId });
});

/** PUT /api/departments/:id */
router.put('/:id', authorize('departments.manage'), validate(body), async (req, res) => {
  const before = await db.one('SELECT * FROM departments WHERE id = ?', [req.params.id]);
  if (!before) throw notFound('Department');
  await db.query(
    `UPDATE departments SET code=?, name=?, short_name=?, degree=?, university_code=?, hod_name=?, hod_email=?, hod_phone=?, block=?,
            annual_intake=?, established_year=?, nba_accredited=?, status=? WHERE id = ?`, [...cols(req.body), before.id]);
  await audit(req, { action: 'DEPARTMENT_UPDATED', module: 'departments', recordId: before.id, summary: `Updated department ${req.body.code}`, oldValue: before, newValue: req.body });
  ok(res, { id: before.id });
});

module.exports = router;
