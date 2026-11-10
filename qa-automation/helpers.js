const path = require('path');

// Test environment configuration
process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';

// Point module resolution so backend node_modules are accessible
const backendDir = path.resolve(__dirname, '..', 'backend');
const backendNodeModules = path.join(backendDir, 'node_modules');

if (!module.paths.includes(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

const dotenv = require(path.join(backendNodeModules, 'dotenv'));
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });

// Always target test database
const baseDb = (process.env.DB_NAME || 'hostel_erp').replace(/_test$/, '');
process.env.DB_NAME = `${baseDb}_test`;

const request = require('supertest');
const { setup } = require('../backend/db/setup');
const app = require('../backend/src/app');
const db = require('../backend/src/config/db');

async function resetDatabase() {
  await setup({ drop: true, dbName: process.env.DB_NAME, silent: true });
}

async function cleanup() {
  try {
    await db.pool.end();
  } catch (_e) {
    // already closed
  }
}

function client() {
  const tokens = {};
  const api = {
    async login(email, password) {
      const res = await request(app).post('/api/auth/login').send({ email, password });
      if (res.status !== 200) {
        throw new Error(`Login failed for ${email} (${res.status}): ${JSON.stringify(res.body)}`);
      }
      tokens[email] = res.body.data.token;
      return res.body.data;
    },
    as(email) {
      const auth = (r) => (tokens[email] ? r.set('Authorization', `Bearer ${tokens[email]}`) : r);
      const withBody = (r, body) => (body === undefined ? r : r.send(body));
      return {
        get: (url) => auth(request(app).get(url)),
        post: (url, body) => withBody(auth(request(app).post(url)), body),
        patch: (url, body) => withBody(auth(request(app).patch(url)), body),
        put: (url, body) => withBody(auth(request(app).put(url)), body),
        delete: (url) => auth(request(app).delete(url)),
        raw: (method, url) => auth(request(app)[method.toLowerCase()](url)),
      };
    },
    getToken(email) {
      return tokens[email];
    },
  };
  return api;
}

const D = 'demo.college.edu';
const USERS = {
  admin: [`admin@${D}`, 'Admin@123'],
  warden: [`warden.boys@${D}`, 'Warden@123'],
  wardenGirls: [`warden.girls@${D}`, 'Warden@123'],
  staff: [`electrician@${D}`, 'Staff@123'],
  security: [`security.boys@${D}`, 'Security@123'],
  parent: [`parent.711123104001@${D}`, 'Parent@123'],
};

module.exports = {
  app,
  db,
  pool: db.pool,
  query: db.query,
  one: db.one,
  transaction: db.transaction,
  resetDatabase,
  cleanup,
  client,
  USERS,
};
