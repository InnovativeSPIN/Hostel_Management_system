const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { badRequest } = require('../../utils/AppError');
const { ok } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const settings = require('../../services/settings');
const jobs = require('../../jobs/scheduler');

router.use(authenticate);

const VALIDATORS = {
  number: /^\d+(\.\d+)?$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  bool: /^(true|false)$/,
};
const typeOf = (key) => (key.includes('blocks') ? 'bool' : /(late_after|hours_start|hours_end)$/.test(key) ? 'time' : 'number');

/** GET /api/settings  current policy values with descriptions */
router.get('/', authorize('settings.manage', 'dashboard.command'), async (_req, res) => {
  const current = await settings.getSettings(true);
  ok(res, Object.entries(settings.DEFAULTS).map(([key, meta]) => ({ key, value: current[key], default: meta.value, description: meta.description, type: typeOf(key) })));
});

/** PUT /api/settings  { values: { key: value } } */
router.put('/', authorize('settings.manage'), validate(z.object({ values: z.record(z.string()) })), async (req, res) => {
  const before = await settings.getSettings(true);
  const entries = Object.entries(req.body.values);
  for (const [key, value] of entries) {
    if (!settings.DEFAULTS[key]) throw badRequest(`Unknown setting ${key}`, 'UNKNOWN_SETTING');
    if (!VALIDATORS[typeOf(key)].test(value)) throw badRequest(`Invalid value for ${key}`, 'INVALID_SETTING');
  }
  await db.transaction(async (conn) => {
    for (const [key, value] of entries) {
      await conn.query(
        `INSERT INTO system_settings (setting_key, setting_value, description, updated_by) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [key, value, settings.DEFAULTS[key].description, req.user.id]);
    }
    await audit(req, { action: 'SETTINGS_UPDATED', module: 'settings', summary: `Updated ${entries.map(([k]) => k).join(', ')}`, oldValue: Object.fromEntries(entries.map(([k]) => [k, before[k]])), newValue: req.body.values }, conn);
  });
  settings.invalidate();
  ok(res, { updated: entries.length });
});

/** POST /api/settings/run-jobs  runs SLA escalation / overdue detection immediately */
router.post('/run-jobs', authorize('settings.manage', 'dashboard.command'), async (_req, res) => {
  ok(res, await jobs.runAll());
});

module.exports = router;
