const router = require('express').Router();
const db = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { ok } = require('../../utils/respond');

router.use(authenticate);

/** GET /api/notifications?unread=true&limit=  -> { items, unread } */
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const unreadOnly = req.query.unread === 'true';
  const [items, count] = await Promise.all([
    db.query(`SELECT id, type, title, message, link, is_read, created_at FROM notifications
               WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''} ORDER BY created_at DESC, id DESC LIMIT ?`, [req.user.id, limit]),
    db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]),
  ]);
  ok(res, { items, unread: count.n });
});

/** GET /api/notifications/count */
router.get('/count', async (req, res) => {
  ok(res, { unread: (await db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id])).n });
});

/** PATCH /api/notifications/:id/read */
router.patch('/:id/read', async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  ok(res, { id: Number(req.params.id) });
});

/** PATCH /api/notifications/read-all */
router.patch('/read-all', async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
  ok(res, { done: true });
});

module.exports = router;
