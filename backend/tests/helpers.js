// Test bootstrap: points the app at an isolated database, rebuilds it and loads demo data.
const path = require('path');
const { execFileSync } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
process.env.DB_NAME = `${process.env.DB_NAME}_test`;

async function resetDatabase() {
  const { setup } = require('../db/setup');
  await setup({ drop: true, dbName: process.env.DB_NAME, silent: true });
  execFileSync(process.execPath, [path.join(__dirname, '..', 'db', 'seed.js')], { env: process.env, stdio: 'ignore' });
}

const request = require('supertest');

function client(app) {
  const tokens = {};
  const api = {
    async login(email, password) {
      const res = await request(app).post('/api/auth/login').send({ email, password });
      if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.body.message}`);
      tokens[email] = res.body.data.token;
      return res.body.data;
    },
    as(email) {
      const auth = (r) => r.set('Authorization', `Bearer ${tokens[email]}`);
      // Without a body the request stays open for multipart .field()/.attach() calls.
      const withBody = (r, body) => (body === undefined ? r : r.send(body));
      return {
        get: (url) => auth(request(app).get(url)),
        post: (url, body) => withBody(auth(request(app).post(url)), body),
        patch: (url, body) => withBody(auth(request(app).patch(url)), body),
        put: (url, body) => withBody(auth(request(app).put(url)), body),
      };
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
};

module.exports = { resetDatabase, client, USERS };
