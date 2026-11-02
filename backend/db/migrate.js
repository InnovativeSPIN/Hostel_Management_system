// Upgrades an existing database in place (no data loss): adds tables introduced after the
// first release and syncs roles / permissions from src/config/permissions.js.
// Usage: npm run db:migrate
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const db = require('../src/config/db');
const { PERMISSIONS, ROLES } = require('../src/config/permissions');

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS parent_students (
     parent_user_id INT UNSIGNED NOT NULL,
     student_id     INT UNSIGNED NOT NULL,
     relation       VARCHAR(30) NOT NULL,
     is_primary     TINYINT(1) NOT NULL DEFAULT 1,
     created_by     INT UNSIGNED NULL,
     created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (parent_user_id, student_id),
     KEY idx_ps_student (student_id),
     CONSTRAINT fk_ps_parent FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
     CONSTRAINT fk_ps_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
     CONSTRAINT fk_ps_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
   ) ENGINE=InnoDB`,
];

async function migrate({ silent = false } = {}) {
  const log = silent ? () => {} : console.log;
  for (const sql of MIGRATIONS) await db.query(sql);
  for (const [name, r] of Object.entries(ROLES)) {
    await db.query('INSERT INTO roles (name, label, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description)',
      [name, r.label, r.description]);
  }
  for (const [code, [module, description]] of Object.entries(PERMISSIONS)) {
    await db.query('INSERT INTO permissions (code, module, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description)',
      [code, module, description]);
  }
  for (const [name, r] of Object.entries(ROLES)) {
    await db.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (?) WHERE r.name = ?`, [r.permissions, name]);
  }
  log(`Migrations applied; ${Object.keys(ROLES).length} roles and ${Object.keys(PERMISSIONS).length} permissions in sync.`);
}

module.exports = { migrate };

if (require.main === module) {
  migrate().then(() => db.pool.end()).catch(async (err) => {
    console.error('Migration failed:', err.message);
    await db.pool.end();
    process.exit(1);
  });
}
