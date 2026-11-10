const mysql = require('mysql2/promise');
const env = require('../src/config/env');

async function migrate() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  console.log('Running migrations...');
  await connection.query(`
    CREATE TABLE IF NOT EXISTS parent_students (
      id int unsigned NOT NULL AUTO_INCREMENT,
      parent_user_id int unsigned NOT NULL,
      student_id int unsigned NOT NULL,
      relation varchar(50) NOT NULL DEFAULT 'Parent',
      is_primary tinyint(1) NOT NULL DEFAULT 1,
      created_by int unsigned DEFAULT NULL,
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_parent_student (parent_user_id, student_id),
      KEY fk_ps_parent (parent_user_id),
      KEY fk_ps_student (student_id),
      KEY fk_ps_created_by (created_by),
      CONSTRAINT fk_ps_parent FOREIGN KEY (parent_user_id) REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT fk_ps_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
      CONSTRAINT fk_ps_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  `);

  console.log('Migrations completed successfully.');
  await connection.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

