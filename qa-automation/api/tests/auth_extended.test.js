const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, client, resetDatabase, cleanup, USERS } = require('../../helpers');

describe('API: Authentication & User Management Extended', () => {
  let c;

  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await cleanup();
  });

  beforeEach(() => {
    c = client();
  });

  describe('POST /api/auth/login', () => {
    it('authenticates valid admin credentials and returns user payload + JWT', async () => {
      const res = await c.as().post('/api/auth/login', {
        email: USERS.admin[0],
        password: USERS.admin[1],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.token, 'Must return JWT token');
      assert.equal(res.body.data.user.email, USERS.admin[0]);
      assert.equal(res.body.data.user.role, 'super_admin');
    });

    it('authenticates valid warden credentials', async () => {
      const res = await c.as().post('/api/auth/login', {
        email: USERS.warden[0],
        password: USERS.warden[1],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.user.role, 'warden');
    });

    it('rejects invalid password with 401', async () => {
      const res = await c.as().post('/api/auth/login', {
        email: USERS.admin[0],
        password: 'WrongPassword999!',
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it('rejects nonexistent user email with 401', async () => {
      const res = await c.as().post('/api/auth/login', {
        email: 'ghost.user.404@demo.college.edu',
        password: 'SomePassword123!',
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it('rejects missing or empty credentials with 400 or 401', async () => {
      const res1 = await c.as().post('/api/auth/login', { email: '' });
      assert.ok([400, 401].includes(res1.status));

      const res2 = await c.as().post('/api/auth/login', {});
      assert.ok([400, 401].includes(res2.status));
    });
  });

  describe('Protected Route Authentication & Token Handling', () => {
    it('rejects requests missing Authorization header with 401', async () => {
      const res = await c.as().get('/api/auth/me');
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it('rejects malformed Bearer tokens with 401', async () => {
      const request = require('supertest');
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.garbage.token');
      assert.equal(res.status, 401);
    });

    it('rejects tokens with invalid header scheme', async () => {
      const request = require('supertest');
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      assert.equal(res.status, 401);
    });

    it('returns authenticated user profile on GET /api/auth/me with valid token', async () => {
      await c.login(USERS.admin[0], USERS.admin[1]);
      const res = await c.as(USERS.admin[0]).get('/api/auth/me');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.email, USERS.admin[0]);
      assert.ok(Array.isArray(res.body.data.permissions), 'Permissions must be an array');
    });
  });
});
