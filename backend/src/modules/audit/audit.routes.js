const router = require('express').Router();
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { paged, ok } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');

router.use(authenticate, authorize('audit.view'));

/** GET /api/audit  read-only audit trail ?module&action&userId&recordId&from&to&search */
router.get('/', async (req, res) => {
  const q = parseList(req.query, { sortable: { date: 'a.created_at' }, defaultSort: 'date' });
  const where = new Where()
    .addIf(q.module, 'a.module = ?', q.module)
    .addIf(q.action, 'a.action = ?', q.action)
    .addIf(q.userId, 'a.user_id = ?', q.userId)
    .addIf(q.recordId, 'a.record_id = ?', q.recordId)
    .addIf(q.from, 'a.created_at >= ?', q.from)
    .addIf(q.to, 'a.created_at < DATE_ADD(?, INTERVAL 1 DAY)', q.to)
    .search(q.search, ['a.summary', 'a.user_name', 'a.action']);
  paged(res, await paginate(db, {
    select: 'a.id, a.user_id, a.user_name, a.user_role, a.action, a.module, a.record_id, a.summary, a.old_value, a.new_value, a.ip_address, a.created_at',
    from: 'FROM audit_logs a', where, ...q,
  }));
});

/** GET /api/audit/facets  distinct modules and actions for filters */
router.get('/facets', async (_req, res) => {
  const [modules, actions] = await Promise.all([
    db.query('SELECT DISTINCT module FROM audit_logs ORDER BY module'),
    db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action'),
  ]);
  ok(res, { modules: modules.map((m) => m.module), actions: actions.map((a) => a.action) });
});

module.exports = router;
