// Creates the database (optionally dropping it first) and applies schema + triggers.
// Usage: node db/setup.js [--drop]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function setup({ drop = false, dbName = process.env.DB_NAME, silent = false } = {}) {
  const log = silent ? () => {} : console.log;
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('Invalid DB_NAME');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    if (drop) {
      await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      log(`Dropped database ${dbName}`);
    }
    const [existing] = await conn.query('SHOW DATABASES LIKE ?', [dbName]);
    if (existing.length && !drop) {
      const [tables] = await conn.query(
        'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [dbName]);
      if (tables[0].n > 0) {
        log(`Database ${dbName} already has tables. Use "npm run db:reset" to rebuild it.`);
        return;
      }
    }
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE \`${dbName}\``);

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      .replace(/^\s*--.*$/gm, '');
    const statements = schema.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await conn.query(stmt);
    log(`Applied ${statements.length} schema statements`);

    const triggers = fs.readFileSync(path.join(__dirname, 'triggers.sql'), 'utf8')
      .split('-- @@').map((s) => s.replace(/^\s*--.*$/gm, '').trim().replace(/;$/, '')).filter(Boolean);
    for (const t of triggers) await conn.query(t);
    log(`Applied ${triggers.length} trigger statements`);
    log(`Database ${dbName} is ready.`);
  } finally {
    await conn.end();
  }
}

module.exports = { setup };

if (require.main === module) {
  setup({ drop: process.argv.includes('--drop') }).catch((err) => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
}
