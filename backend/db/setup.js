const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

async function setup(options = {}) {
  const drop = options.drop !== undefined ? options.drop : process.argv.includes('--drop');
  const dbName = options.dbName || process.env.DB_NAME || env.db.database || 'hostel_erp';
  const silent = options.silent !== undefined ? options.silent : false;

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  if (!silent) console.log(`Connected to MySQL at ${env.db.host}:${env.db.port}. Setting up database "${dbName}"...`);

  if (drop) {
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\`;`);
  }
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
  await connection.query(`USE \`${dbName}\`;`);

  const sqlFile = path.join(__dirname, 'hostel_erp.sql');
  let sql = fs.readFileSync(sqlFile, 'utf8');

  // Strip hardcoded database creation and selection so it runs against dbName
  sql = sql.replace(/CREATE DATABASE\s+IF NOT EXISTS\s+`[^`]+`[^;]*;/gi, '');
  sql = sql.replace(/USE\s+`[^`]+`;/gi, '');

  await connection.query(sql);

  // Apply supplemental schema items: Parent Role, Permissions, Seed Parent, Immutability Triggers, Active Leave Date
  const supplementalSql = `
    -- 1. Ensure 'parent' role exists
    INSERT INTO roles (id, name, label, description)
    VALUES (6, 'parent', 'Parent / Guardian', 'Read-only portal access for linked students')
    ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description);

    -- 2. Ensure 'parent.portal' and 'parents.manage' permissions exist
    INSERT INTO permissions (code, module, description)
    VALUES 
      ('parent.portal', 'parents', 'Access the parent portal for linked children'),
      ('parents.manage', 'parents', 'Link and manage parent accounts')
    ON DUPLICATE KEY UPDATE description = VALUES(description);

    -- 3. Ensure role_permission mapping exists for parent and warden/admin
    INSERT IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'parent' AND p.code = 'parent.portal';

    INSERT IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name IN ('super_admin', 'warden') AND p.code = 'parents.manage';

    -- 4. Seed parent user for student Arun Kumar S (711123104001)
    INSERT INTO users (id, role_id, name, email, phone, password_hash, status)
    VALUES (101, 6, 'Shanmugam S', 'parent.711123104001@demo.college.edu', '9842011111', '$2b$10$dr7G1YGJN2HHD0CBXUoI8eCpfeuKH3pIKqB8LywEADYQJMB.lpPm2', 'active')
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role_id = VALUES(role_id), status = 'active';

    -- 5. Seed link between parent user 101 and students Arun Kumar S (1) and Harini Ramesh (38)
    INSERT IGNORE INTO parent_students (parent_user_id, student_id, relation, is_primary)
    VALUES (101, 1, 'Father', 1), (101, 38, 'Father', 0);

    -- 6. Ensure at least one ongoing approved leave request covers CURDATE() with returned_at IS NULL
    UPDATE leave_requests
    SET from_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY),
        to_date = DATE_ADD(CURDATE(), INTERVAL 2 DAY),
        status = 'approved',
        returned_at = NULL
    WHERE id = 1;

    -- 7. Immutability triggers for Payments
    DROP TRIGGER IF EXISTS trg_payments_no_update;
    CREATE TRIGGER trg_payments_no_update
    BEFORE UPDATE ON payments
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments are immutable';
    END;

    -- 8. Immutability triggers for Audit Logs
    DROP TRIGGER IF EXISTS trg_audit_logs_no_update;
    CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are read-only and immutable';
    END;

    DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;
    CREATE TRIGGER trg_audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    BEGIN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are read-only and immutable';
    END;
  `;

  await connection.query(supplementalSql);

  // Apply Phase 1-4 Schema Alignments: Attendance Sessions, Student Types, Quotas, Proof Attachments, Mess Billing, Guest Rooms
  const safeRun = async (name, fn) => {
    try {
      await fn();
    } catch (err) {
      if (!silent) console.warn(`Notice (${name}): ${err.message}`);
    }
  };

  // 1. Attendance session column
  await safeRun('attendance.session', async () => {
    const [attCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'session'",
      [dbName]
    );
    if (!attCols.length) {
      await connection.query("ALTER TABLE attendance ADD COLUMN session ENUM('morning','evening') NOT NULL DEFAULT 'morning' AFTER attendance_date");
    }
  });

  // 2. Attendance status enum (including medical_leave and on_duty)
  await safeRun('attendance.status', async () => {
    await connection.query("ALTER TABLE attendance MODIFY COLUMN status ENUM('present','absent','late','on_leave','medical_leave','on_duty','out_pass') NOT NULL");
  });

  // 3. Attendance unique key update
  await safeRun('attendance.uq_attendance_session', async () => {
    const [attIdx] = await connection.query(
      "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance' AND INDEX_NAME = 'uq_attendance_session'",
      [dbName]
    );
    if (!attIdx.length) {
      await connection.query("ALTER TABLE attendance ADD UNIQUE KEY uq_attendance_session (student_id, attendance_date, session)");
    }
    const [oldIdx] = await connection.query(
      "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance' AND INDEX_NAME = 'uq_attendance'",
      [dbName]
    );
    if (oldIdx.length) {
      await connection.query("ALTER TABLE attendance DROP INDEX uq_attendance");
    }
  });

  // 4. Students student_type and admission_quota
  await safeRun('students.student_type', async () => {
    const [stuCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'students' AND COLUMN_NAME = 'student_type'",
      [dbName]
    );
    if (!stuCols.length) {
      await connection.query("ALTER TABLE students ADD COLUMN student_type ENUM('nscet','ns_cbse') NOT NULL DEFAULT 'nscet' AFTER batch");
    }
    await connection.query(
      "ALTER TABLE students MODIFY COLUMN admission_quota ENUM('government','management','nri','lateral','7_point_5_scheme','sports_quota') NOT NULL DEFAULT 'government'"
    );
  });

  // 5. Student profiles school_class & school_section
  await safeRun('student_profiles.school_class', async () => {
    const [profCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_profiles' AND COLUMN_NAME = 'school_class'",
      [dbName]
    );
    if (!profCols.length) {
      await connection.query("ALTER TABLE student_profiles ADD COLUMN school_class VARCHAR(20) DEFAULT NULL AFTER faculty_advisor");
      await connection.query("ALTER TABLE student_profiles ADD COLUMN school_section VARCHAR(10) DEFAULT NULL AFTER school_class");
    }
  });

  // 6. Hostel applications student_type and admission_quota
  await safeRun('hostel_applications.student_type', async () => {
    const [appCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hostel_applications' AND COLUMN_NAME = 'student_type'",
      [dbName]
    );
    if (!appCols.length) {
      await connection.query("ALTER TABLE hostel_applications ADD COLUMN student_type ENUM('nscet','ns_cbse') NOT NULL DEFAULT 'nscet' AFTER preferred_room_type");
    }
    const [appQuotaCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hostel_applications' AND COLUMN_NAME = 'admission_quota'",
      [dbName]
    );
    if (!appQuotaCols.length) {
      await connection.query("ALTER TABLE hostel_applications ADD COLUMN admission_quota ENUM('government','management','nri','lateral','7_point_5_scheme','sports_quota') NOT NULL DEFAULT 'government' AFTER student_type");
    }
  });

  // 7. Leave requests on_duty enum
  await safeRun('leave_requests.on_duty', async () => {
    await connection.query("ALTER TABLE leave_requests MODIFY COLUMN leave_type ENUM('home','medical','personal','academic','emergency','on_duty') NOT NULL");
  });

  // 8. Phase 2: Complaint Attachments (1-3 image proofs)
  await safeRun('complaint_attachments', async () => {
    const [attTable] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'complaint_attachments'",
      [dbName]
    );
    if (!attTable.length) {
      await connection.query(`
        CREATE TABLE complaint_attachments (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          complaint_id INT UNSIGNED NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          file_size INT UNSIGNED NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_ca_complaint (complaint_id),
          FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
    }
  });

  // 9. Phase 2: Maintenance before and after images
  await safeRun('maintenance_requests.images', async () => {
    const [maintBefore] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'maintenance_requests' AND COLUMN_NAME = 'before_image'",
      [dbName]
    );
    if (!maintBefore.length) {
      await connection.query("ALTER TABLE maintenance_requests ADD COLUMN before_image VARCHAR(255) DEFAULT NULL AFTER notes");
      await connection.query("ALTER TABLE maintenance_requests ADD COLUMN after_image VARCHAR(255) DEFAULT NULL AFTER before_image");
    }
  });

  // 10. Student photo in student_profiles
  await safeRun('student_profiles.photo_url', async () => {
    const [photoCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_profiles' AND COLUMN_NAME = 'photo_url'",
      [dbName]
    );
    if (!photoCols.length) {
      await connection.query("ALTER TABLE student_profiles ADD COLUMN photo_url VARCHAR(255) DEFAULT NULL AFTER school_section");
    }
  });

  // 11. Student type in fee_structures (NSCET vs NS-CBSE)
  await safeRun('fee_structures.student_type', async () => {
    const [feeTypeCols] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fee_structures' AND COLUMN_NAME = 'student_type'",
      [dbName]
    );
    if (!feeTypeCols.length) {
      await connection.query("ALTER TABLE fee_structures ADD COLUMN student_type ENUM('nscet','ns_cbse') NOT NULL DEFAULT 'nscet' AFTER room_type");
    }
  });

  // 12. Mess menu & overrides
  await safeRun('mess_menu', async () => {
    const [messMenuTbl] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mess_menu'",
      [dbName]
    );
    if (!messMenuTbl.length) {
      await connection.query(`
        CREATE TABLE mess_menu (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          day_of_week ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
          meal_type ENUM('breakfast','lunch','snacks','dinner') NOT NULL,
          items TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_day_meal (day_of_week, meal_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
      // Seed default weekly menu
      await connection.query(`
        INSERT INTO mess_menu (day_of_week, meal_type, items) VALUES
        ('monday', 'breakfast', 'Idli, Sambar, Coconut Chutney, Coffee/Tea'),
        ('monday', 'lunch', 'Rice, Dal Tadka, Poriyal, Rasam, Curd'),
        ('monday', 'snacks', 'Sundal, Tea'),
        ('monday', 'dinner', 'Chapati, Paneer Butter Masala, Rice, Rasam'),
        ('tuesday', 'breakfast', 'Poori, Potato Masala, Coffee/Tea'),
        ('tuesday', 'lunch', 'Sambar Rice, Potato Fry, Curd Rice, Pickle'),
        ('tuesday', 'snacks', 'Samosa, Tea'),
        ('tuesday', 'dinner', 'Dosa, Tomato Chutney, Sambar, Milk'),
        ('wednesday', 'breakfast', 'Pongal, Medu Vada, Sambar, Chutney, Tea'),
        ('wednesday', 'lunch', 'Rice, Chicken Curry / Veg Kurma, Dal, Rasam, Curd'),
        ('wednesday', 'snacks', 'Veg Cutlet, Tea'),
        ('wednesday', 'dinner', 'Parotta, Veg/Egg Curry, Raitha'),
        ('thursday', 'breakfast', 'Rava Kichadi, Coconut Chutney, Coffee/Tea'),
        ('thursday', 'lunch', 'Rice, Karakuzhambu, Kootu, Appalam, Curd'),
        ('thursday', 'snacks', 'Bonda, Tea'),
        ('thursday', 'dinner', 'Chapati, Dal Fry, Jeera Rice, Curd'),
        ('friday', 'breakfast', 'Idiyappam, Veg Kurma / Coconut Milk, Tea'),
        ('friday', 'lunch', 'Rice, Sambar, Keerai Poriyal, Rasam, Payasam'),
        ('friday', 'snacks', 'Puffs, Tea'),
        ('friday', 'dinner', 'Fried Rice, Gobi Manchurian, Soup'),
        ('saturday', 'breakfast', 'Uttapam, Sambar, Chutney, Coffee/Tea'),
        ('saturday', 'lunch', 'Lemon/Tomato Rice, Potato Poriyal, Curd Rice'),
        ('saturday', 'snacks', 'Biscuits, Tea'),
        ('saturday', 'dinner', 'Chapati, Aloo Gobi Masala, Rice, Rasam'),
        ('sunday', 'breakfast', 'Masala Dosa, Sambar, Chutney, Coffee/Tea'),
        ('sunday', 'lunch', 'Chicken Biryani / Veg Biryani, Onion Raitha, Egg/Paneer, Brinjal Curry'),
        ('sunday', 'snacks', 'Cake, Tea'),
        ('sunday', 'dinner', 'Idli, Sambar, Milagai Podi, Warm Milk');
      `);
    }
  });

  await safeRun('mess_menu_overrides', async () => {
    const [messOverrideTbl] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mess_menu_overrides'",
      [dbName]
    );
    if (!messOverrideTbl.length) {
      await connection.query(`
        CREATE TABLE mess_menu_overrides (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          override_date DATE NOT NULL,
          meal_type ENUM('breakfast','lunch','snacks','dinner') NOT NULL,
          items TEXT NOT NULL,
          reason VARCHAR(255) DEFAULT NULL,
          created_by INT UNSIGNED DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_date_meal (override_date, meal_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
    }
  });

  // 13. Staff mess attendance (morning & evening sessions)
  await safeRun('staff_mess_attendance', async () => {
    const [staffMessAttTbl] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_mess_attendance'",
      [dbName]
    );
    if (!staffMessAttTbl.length) {
      await connection.query(`
        CREATE TABLE staff_mess_attendance (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          attendance_date DATE NOT NULL,
          session ENUM('morning','evening') NOT NULL DEFAULT 'morning',
          status ENUM('present','absent') NOT NULL DEFAULT 'present',
          remarks VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_staff_mess_att (user_id, attendance_date, session),
          KEY idx_sma_date (attendance_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
    }
  });

  // 14. Mess bills (one-click generation: draft/preview -> confirm -> publish, with PDF export)
  await safeRun('mess_bills', async () => {
    const [messBillsTbl] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mess_bills'",
      [dbName]
    );
    if (!messBillsTbl.length) {
      await connection.query(`
        CREATE TABLE mess_bills (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          bill_code VARCHAR(32) NOT NULL UNIQUE,
          student_id INT UNSIGNED DEFAULT NULL,
          staff_id INT UNSIGNED DEFAULT NULL,
          bill_month VARCHAR(7) NOT NULL,
          total_days INT NOT NULL DEFAULT 0,
          present_days INT NOT NULL DEFAULT 0,
          absent_days INT NOT NULL DEFAULT 0,
          daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          rebate_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          status ENUM('draft','confirmed','published') NOT NULL DEFAULT 'draft',
          published_at DATETIME DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_mb_student (student_id),
          KEY idx_mb_staff (staff_id),
          KEY idx_mb_month (bill_month)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
    }
  });

  // 15. Guest rooms & bookings (zero fee, check-in, check-out, history)
  await safeRun('guest_rooms', async () => {
    const [guestRoomsTbl] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'guest_rooms'",
      [dbName]
    );
    if (!guestRoomsTbl.length) {
      await connection.query(`
        CREATE TABLE guest_rooms (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          room_number VARCHAR(20) NOT NULL UNIQUE,
          hostel_id INT UNSIGNED DEFAULT NULL,
          capacity INT UNSIGNED NOT NULL DEFAULT 2,
          is_ac TINYINT(1) NOT NULL DEFAULT 1,
          status ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available',
          notes VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
      // Seed sample guest rooms
      await connection.query(`
        INSERT INTO guest_rooms (room_number, capacity, is_ac, status, notes) VALUES
        ('GR-101', 2, 1, 'available', 'VIP Guest Suite Ground Floor'),
        ('GR-102', 2, 1, 'available', 'Executive Guest Room Ground Floor'),
        ('GR-201', 3, 0, 'available', 'Standard Guest Room First Floor');
      `);
    }
  });

  await safeRun('guest_room_bookings', async () => {
    const [guestBookingsTbl] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'guest_room_bookings'",
      [dbName]
    );
    if (!guestBookingsTbl.length) {
      await connection.query(`
        CREATE TABLE guest_room_bookings (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          booking_code VARCHAR(32) NOT NULL UNIQUE,
          guest_room_id INT UNSIGNED NOT NULL,
          guest_name VARCHAR(120) NOT NULL,
          guest_phone VARCHAR(20) NOT NULL,
          guest_email VARCHAR(160) DEFAULT NULL,
          purpose VARCHAR(255) NOT NULL,
          check_in_date DATE NOT NULL,
          check_out_date DATE NOT NULL,
          actual_check_in DATETIME DEFAULT NULL,
          actual_check_out DATETIME DEFAULT NULL,
          status ENUM('reserved','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'reserved',
          fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          booked_by_user_id INT UNSIGNED DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_grb_room (guest_room_id),
          FOREIGN KEY (guest_room_id) REFERENCES guest_rooms (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
    }
  });

  // Also apply the same supplemental schema to the main database if not already
  if (!silent) console.log(`Database "${dbName}" initialized successfully!`);
  await connection.end();
}

if (require.main === module) {
  setup().catch((err) => {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { setup };
