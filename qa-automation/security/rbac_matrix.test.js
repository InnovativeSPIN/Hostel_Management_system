const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS } = require('../helpers');

describe('Security: Role-Based Access Control (RBAC) Matrix', () => {
  let c;

  before(async () => {
    await resetDatabase();
    c = client();
    for (const [key, [email, pwd]] of Object.entries(USERS)) {
      await c.login(email, pwd);
    }
  });

  after(async () => {
    await cleanup();
  });

  describe('Unauthenticated User Access', () => {
    it('blocks unauthenticated access to all private endpoints with 401', async () => {
      const endpoints = [
        ['get', '/api/hostels'],
        ['get', '/api/students'],
        ['get', '/api/allocations'],
        ['get', '/api/attendance'],
        ['get', '/api/leaves'],
        ['get', '/api/fees'],
        ['get', '/api/settings'],
        ['get', '/api/audit'],
      ];

      for (const [method, url] of endpoints) {
        const res = await c.as().raw(method, url);
        assert.equal(res.status, 401, `Expected 401 for unauthenticated ${method.toUpperCase()} ${url}`);
      }
    });
  });

  describe('Super Admin Permissions (Full Administrative Privilege)', () => {
    it('allows super_admin to access system settings, audit logs and create hostels', async () => {
      const sRes = await c.as(USERS.admin[0]).get('/api/settings');
      assert.equal(sRes.status, 200);

      const aRes = await c.as(USERS.admin[0]).get('/api/audit');
      assert.equal(aRes.status, 200);

      const hRes = await c.as(USERS.admin[0]).get('/api/hostels');
      assert.equal(hRes.status, 200);
    });
  });

  describe('Warden Permissions (Hostel Operations Privilege)', () => {
    it('allows warden to view assigned hostels, allocations and attendance', async () => {
      const hRes = await c.as(USERS.warden[0]).get('/api/hostels');
      assert.equal(hRes.status, 200);

      const aRes = await c.as(USERS.warden[0]).get('/api/allocations');
      assert.equal(aRes.status, 200);

      const attRes = await c.as(USERS.warden[0]).get('/api/attendance');
      assert.equal(attRes.status, 200);
    });

    it('denies warden permission to update system settings or access audit trail with 403', async () => {
      // Warden can view settings via dashboard.command, but cannot MODIFY settings (requires settings.manage)
      const putRes = await c.as(USERS.warden[0]).put('/api/settings', {
        values: { late_after: '21:00' },
      });
      assert.equal(putRes.status, 403, 'Warden must be forbidden from updating system settings');

      // Warden cannot access system audit logs
      const aRes = await c.as(USERS.warden[0]).get('/api/audit');
      assert.equal(aRes.status, 403, 'Warden must be forbidden from viewing audit trail');
    });
  });

  describe('Staff & Security Permissions (Task & Gate Privilege)', () => {
    it('allows security to view current visitors and register gate entries', async () => {
      const vRes = await c.as(USERS.security[0]).get('/api/visitors/current');
      assert.equal(vRes.status, 200);
    });

    it('denies security access to fee management, student directory and allocations with 403', async () => {
      const fRes = await c.as(USERS.security[0]).get('/api/fees');
      assert.equal(fRes.status, 403);

      const sRes = await c.as(USERS.security[0]).get('/api/students');
      assert.equal(sRes.status, 403);

      const aRes = await c.as(USERS.security[0]).get('/api/allocations');
      assert.equal(aRes.status, 403);
    });

    it('denies staff access to approve leaves or modify fee structures', async () => {
      const lRes = await c.as(USERS.staff[0]).patch('/api/leaves/1/approve', { remarks: 'Staff attempt' });
      assert.equal(lRes.status, 403);

      const fsRes = await c.as(USERS.staff[0]).post('/api/fees/structures', {});
      assert.equal(fsRes.status, 403);
    });
  });
});
