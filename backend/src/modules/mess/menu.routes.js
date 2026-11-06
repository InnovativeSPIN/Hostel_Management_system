const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ok, created } = require('../../utils/respond');
const { notFound, badRequest, forbidden } = require('../../utils/AppError');
const { audit } = require('../../services/audit');
const { toDateStr } = require('../../utils/helpers');

router.use(authenticate);

// Step 7: Mess Billing Routes
router.use('/billing', require('./billing.routes'));

const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isStaffOrAdmin(user) {
  return ['super_admin', 'warden', 'staff'].includes(user.role);
}

/**
 * GET /api/mess/menu/today
 * Returns today's meals combining default weekly menu with date overrides.
 */
router.get('/today', async (req, res) => {
  const today = toDateStr();
  const dayName = DAYS[new Date().getDay()];

  const [weekly, overrides] = await Promise.all([
    db.query('SELECT day_of_week, meal_type, items FROM mess_menu_weekly WHERE day_of_week = ?', [dayName]),
    db.query('SELECT id, override_date, meal_type, items, reason FROM mess_menu_overrides WHERE override_date = ?', [today]),
  ]);

  const overrideMap = new Map();
  overrides.forEach((o) => overrideMap.set(o.meal_type, o));

  const weeklyMap = new Map();
  weekly.forEach((w) => weeklyMap.set(w.meal_type, w.items));

  const meals = MEALS.map((mealType) => {
    const override = overrideMap.get(mealType);
    if (override) {
      return {
        mealType,
        items: override.items,
        isOverride: true,
        overrideId: override.id,
        reason: override.reason,
      };
    }
    return {
      mealType,
      items: weeklyMap.get(mealType) || 'Not specified',
      isOverride: false,
      reason: null,
    };
  });

  ok(res, {
    date: today,
    dayOfWeek: dayName,
    meals,
  });
});

/**
 * GET /api/mess/menu/weekly
 * Returns full weekly default master menu.
 */
router.get('/weekly', async (req, res) => {
  const rows = await db.query('SELECT * FROM mess_menu_weekly ORDER BY FIELD(day_of_week, "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"), FIELD(meal_type, "Breakfast","Lunch","Snacks","Dinner")');
  ok(res, rows);
});

/**
 * PUT /api/mess/menu/weekly
 * Update a default weekly meal.
 */
router.put('/weekly', async (req, res) => {
  if (!isStaffOrAdmin(req.user)) throw forbidden('Only hostel staff and wardens can update mess menus');
  const b = z.object({
    dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
    mealType: z.enum(['Breakfast', 'Lunch', 'Snacks', 'Dinner']),
    items: z.string().trim().min(3).max(1000),
  }).parse(req.body);

  await db.query(
    `INSERT INTO mess_menu_weekly (day_of_week, meal_type, items)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE items = VALUES(items)`,
    [b.dayOfWeek, b.mealType, b.items]
  );

  await audit(req, {
    action: 'MESS_WEEKLY_MENU_UPDATED',
    module: 'mess',
    summary: `Updated weekly menu for ${b.dayOfWeek} ${b.mealType}`,
    newValue: b,
  });

  ok(res, { success: true, ...b });
});

/**
 * GET /api/mess/menu/overrides
 * Returns active/upcoming date overrides.
 */
router.get('/overrides', async (req, res) => {
  const fromDate = req.query.from || toDateStr();
  const rows = await db.query(
    `SELECT mmo.*, u.name AS created_by_name
       FROM mess_menu_overrides mmo
       LEFT JOIN users u ON u.id = mmo.created_by
      WHERE mmo.override_date >= ?
      ORDER BY mmo.override_date ASC, FIELD(mmo.meal_type, "Breakfast","Lunch","Snacks","Dinner")`,
    [fromDate]
  );
  ok(res, rows);
});

/**
 * POST /api/mess/menu/override
 * Hostel staff creates or updates a specific date/meal override.
 */
router.post('/override', async (req, res) => {
  if (!isStaffOrAdmin(req.user)) throw forbidden('Only hostel staff and wardens can override mess menus');
  const b = z.object({
    overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    mealType: z.enum(['Breakfast', 'Lunch', 'Snacks', 'Dinner']),
    items: z.string().trim().min(3).max(1000),
    reason: z.string().trim().max(255).optional().nullable(),
  }).parse(req.body);

  const [r] = await db.pool.query(
    `INSERT INTO mess_menu_overrides (override_date, meal_type, items, reason, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE items = VALUES(items), reason = VALUES(reason), created_by = VALUES(created_by)`,
    [b.overrideDate, b.mealType, b.items, b.reason || null, req.user.id]
  );

  await audit(req, {
    action: 'MESS_MENU_OVERRIDE_SAVED',
    module: 'mess',
    summary: `Menu override for ${b.overrideDate} ${b.mealType}: ${b.items}${b.reason ? ` (${b.reason})` : ''}`,
    newValue: b,
  });

  created(res, { id: r.insertId, ...b });
});

/**
 * DELETE /api/mess/menu/override/:id
 * Delete override and revert meal back to default.
 */
router.delete('/override/:id', async (req, res) => {
  if (!isStaffOrAdmin(req.user)) throw forbidden('Only hostel staff and wardens can remove mess menu overrides');
  const id = Number(req.params.id);
  const row = await db.one('SELECT * FROM mess_menu_overrides WHERE id = ?', [id]);
  if (!row) throw notFound('Menu override');

  await db.query('DELETE FROM mess_menu_overrides WHERE id = ?', [id]);
  await audit(req, {
    action: 'MESS_MENU_OVERRIDE_DELETED',
    module: 'mess',
    recordId: id,
    summary: `Removed menu override for ${row.override_date} ${row.meal_type}`,
    oldValue: row,
  });

  ok(res, { id, deleted: true });
});

module.exports = router;
