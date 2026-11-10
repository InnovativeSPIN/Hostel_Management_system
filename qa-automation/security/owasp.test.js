const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../helpers');

describe('Security: OWASP Top 10 Resilience & Vulnerability Tests', () => {
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

  describe('A03: Injection (SQL Injection Parameterization)', () => {
    const SQLI_PAYLOADS = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "' UNION SELECT 1, 'admin', 'pass', 1, 1, 1, 1, 1, 1, 1--",
      "1' OR '1' = '1' /*",
    ];

    it('safely handles SQL injection payloads in student search queries', async () => {
      for (const payload of SQLI_PAYLOADS) {
        const res = await c.as(USERS.admin[0]).get(`/api/students?search=${encodeURIComponent(payload)}`);
        assert.equal(res.status, 200, `Search query must handle payload without SQL crash: ${payload}`);
        assert.ok(Array.isArray(res.body.data));
      }

      // Verify users table was NOT dropped
      const userCheck = await db.one('SELECT COUNT(*) AS count FROM users');
      assert.ok(userCheck.count > 0, 'Users table must remain intact');
    });

    it('safely handles SQL injection payloads in complaints and visitors filters', async () => {
      for (const payload of SQLI_PAYLOADS) {
        const cRes = await c.as(USERS.admin[0]).get(`/api/complaints?search=${encodeURIComponent(payload)}`);
        assert.equal(cRes.status, 200);

        const vRes = await c.as(USERS.admin[0]).get(`/api/visitors?search=${encodeURIComponent(payload)}`);
        assert.equal(vRes.status, 200);
      }
    });
  });

  describe('A01: Broken Access Control & IDOR', () => {
    it('blocks horizontal privilege escalation: parent accessing unlinked student ID', async () => {
      // Arun Kumar S (id 1) is linked to Shanmugam S
      // Karthik Raja M (id 2) is NOT linked
      const unlinkedRes = await c.as(USERS.parent[0]).get('/api/parents/children/2');
      assert.equal(unlinkedRes.status, 403, 'Must return 403 Forbidden for unlinked student ID');
      assert.equal(unlinkedRes.body.success, false);
    });

    it('blocks BOLA: Boys hostel warden modifying Girls hostel resources', async () => {
      // Hostel G (id 3) is girls hostel
      // Boys warden attempting to add floor to Girls hostel
      const res = await c.as(USERS.warden[0]).post('/api/hostels/3/floors', {
        floorNumber: 5,
        label: 'Unauthorized Floor Attempt',
      });
      assert.equal(res.status, 403, 'Must block warden from modifying unassigned hostel');
    });

    it('blocks unauthorized access to sensitive user configuration', async () => {
      const res = await c.as(USERS.warden[0]).get('/api/users');
      assert.equal(res.status, 403, 'Warden must not access global user administration');
    });
  });

  describe('A07: Identification and Authentication Failures', () => {
    it('rejects tampered JWT signature with 401', async () => {
      const validToken = c.getToken(USERS.admin[0]);
      assert.ok(validToken);

      // Modify the signature portion of the JWT
      const parts = validToken.split('.');
      parts[2] = 'tampered_signature_payload';
      const tamperedToken = parts.join('.');

      const request = require('supertest');
      const { app } = require('../helpers');
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });
  });
});

