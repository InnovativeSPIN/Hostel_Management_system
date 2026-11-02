const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../../config/db');
const env = require('../../config/env');
const { authenticate, signToken } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { unauthorized, badRequest } = require('../../utils/AppError');
const { ok } = require('../../utils/respond');
const { randomToken, sha256, toDateTimeStr } = require('../../utils/helpers');
const { audit } = require('../../services/audit');

const MAX_FAILED = 5;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' },
});

const password = z.string().min(8, 'Password must be at least 8 characters').max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/\d/, 'Password must contain a number');

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, roleLabel: u.role_label,
    designation: u.designation, staffSkill: u.staff_skill,
    permissions: [...u.permissions], hostelIds: u.hostelIds, studentId: u.studentId, childIds: u.childIds,
  };
}

/** POST /api/auth/login  { email, password } -> { token, user } */
router.post('/login', authLimiter,
  validate(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) })),
  async (req, res) => {
    const { email, password: pwd } = req.body;
    const user = await db.one(
      'SELECT id, name, password_hash, status, failed_logins, token_version FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    // Same error for unknown email and wrong password to avoid account enumeration.
    const invalid = unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    if (!user) {
      await bcrypt.compare(pwd, DUMMY_HASH); // equalise timing with the real path
      throw invalid;
    }
    if (user.status === 'locked') throw unauthorized('Account locked after repeated failed logins. Contact the administrator or reset your password.', 'ACCOUNT_LOCKED');
    if (user.status !== 'active') throw unauthorized('Your account is not active', 'ACCOUNT_INACTIVE');

    if (!(await bcrypt.compare(pwd, user.password_hash))) {
      const failed = user.failed_logins + 1;
      await db.query('UPDATE users SET failed_logins = ?, status = IF(? >= ?, \'locked\', status) WHERE id = ?',
        [failed, failed, MAX_FAILED, user.id]);
      if (failed >= MAX_FAILED) await audit(req, { action: 'ACCOUNT_LOCKED', module: 'auth', recordId: user.id, summary: `Account ${email} locked after ${failed} failed logins` });
      throw invalid;
    }
    await db.query('UPDATE users SET failed_logins = 0, last_login_at = NOW() WHERE id = ?', [user.id]);
    const identity = await require('../../middleware/auth').loadIdentity(user.id);
    req.user = identity;
    await audit(req, { action: 'LOGIN', module: 'auth', recordId: user.id, summary: `${user.name} signed in` });
    ok(res, { token: signToken(identity), user: publicUser(identity) });
  });

/** POST /api/auth/logout  Revokes every token issued to the user so far. */
router.post('/logout', authenticate, async (req, res) => {
  await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  await audit(req, { action: 'LOGOUT', module: 'auth', recordId: req.user.id, summary: `${req.user.name} signed out` });
  ok(res, { message: 'Signed out' });
});

/** GET /api/auth/me */
router.get('/me', authenticate, async (req, res) => ok(res, publicUser(req.user)));

/** POST /api/auth/forgot-password { email } - always responds 200 to avoid enumeration. */
router.post('/forgot-password', authLimiter,
  validate(z.object({ email: z.string().trim().toLowerCase().email() })),
  async (req, res) => {
    const user = await db.one('SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL', [req.body.email]);
    const response = { message: 'If the email is registered, a reset link has been sent.' };
    if (user) {
      const token = randomToken();
      const expires = toDateTimeStr(new Date(Date.now() + 30 * 60 * 1000));
      await db.query('UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?', [sha256(token), expires, user.id]);
      const link = `${env.frontendUrl}/reset-password?token=${token}`;
      // No mail server is configured in this project; in development the link is logged and returned.
      if (!env.isProd) {
        console.log(`[DEV] Password reset link for ${req.body.email}: ${link}`);
        response.devResetLink = link;
      }
    }
    ok(res, response);
  });

/** POST /api/auth/reset-password { token, password } */
router.post('/reset-password', authLimiter,
  validate(z.object({ token: z.string().length(64), password })),
  async (req, res) => {
    const user = await db.one(
      'SELECT id, name FROM users WHERE reset_token_hash = ? AND reset_token_expires > NOW() AND deleted_at IS NULL', [sha256(req.body.token)]);
    if (!user) throw badRequest('Reset link is invalid or has expired', 'RESET_TOKEN_INVALID');
    const hash = await bcrypt.hash(req.body.password, 10);
    await db.query(
      `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL, failed_logins = 0,
              status = IF(status = 'locked', 'active', status), token_version = token_version + 1 WHERE id = ?`, [hash, user.id]);
    await audit({ user: { id: user.id, name: user.name, role: 'self' }, ip: req.ip, get: req.get.bind(req) },
      { action: 'PASSWORD_RESET', module: 'auth', recordId: user.id, summary: `${user.name} reset their password` });
    ok(res, { message: 'Password updated. Please sign in.' });
  });

/** POST /api/auth/change-password { currentPassword, newPassword } */
router.post('/change-password', authenticate,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: password })),
  async (req, res) => {
    const row = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(req.body.currentPassword, row.password_hash))) throw badRequest('Current password is incorrect', 'WRONG_PASSWORD');
    const hash = await bcrypt.hash(req.body.newPassword, 10);
    await db.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.user.id]);
    await audit(req, { action: 'PASSWORD_CHANGED', module: 'auth', recordId: req.user.id, summary: `${req.user.name} changed their password` });
    const identity = await require('../../middleware/auth').loadIdentity(req.user.id);
    ok(res, { token: signToken(identity) });
  });

module.exports = router;
module.exports.passwordSchema = password;
