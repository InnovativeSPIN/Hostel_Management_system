const env = require('./config/env');
const app = require('./app');
const db = require('./config/db');
const jobs = require('./jobs/scheduler');

async function start() {
  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.error('Cannot connect to MySQL. Check DB_* variables in backend/.env and run "npm run db:setup".');
    console.error(err.message);
    process.exit(1);
  }
  const server = app.listen(env.port, () => {
    console.log(`Hostel ERP API listening on http://localhost:${env.port}`);
  });
  if (env.jobs.enabled) jobs.start(env.jobs.intervalMinutes);

  const shutdown = () => {
    jobs.stop();
    server.close(() => db.pool.end().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
