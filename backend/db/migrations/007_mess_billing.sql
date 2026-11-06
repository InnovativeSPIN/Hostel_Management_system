-- Migration 007: Mess Billing Module (Students and Staff)
-- Tables: mess_bill_rules, mess_staff_attendance, mess_bills, mess_bill_items

CREATE TABLE IF NOT EXISTS mess_bill_rules (
  id INT(11) NOT NULL AUTO_INCREMENT,
  academic_year VARCHAR(10) NOT NULL DEFAULT '2026-27',
  month_year VARCHAR(7) NOT NULL,
  student_per_day_rate DECIMAL(10,2) NOT NULL DEFAULT 150.00,
  staff_per_day_rate DECIMAL(10,2) NOT NULL DEFAULT 120.00,
  session_weight DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  charge_present TINYINT(1) NOT NULL DEFAULT 1,
  charge_absent TINYINT(1) NOT NULL DEFAULT 1,
  charge_leave TINYINT(1) NOT NULL DEFAULT 0,
  charge_medical_leave TINYINT(1) NOT NULL DEFAULT 0,
  charge_on_duty TINYINT(1) NOT NULL DEFAULT 0,
  min_leave_days_for_rebate INT(11) NOT NULL DEFAULT 1,
  other_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'active',
  created_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rules_month (academic_year, month_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mess_staff_attendance (
  id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT(10) UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  session ENUM('Morning', 'Evening') NOT NULL,
  status ENUM('Present', 'Absent') NOT NULL DEFAULT 'Present',
  remarks VARCHAR(255) NULL DEFAULT NULL,
  marked_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_staff_att (user_id, attendance_date, session),
  INDEX idx_staff_att_date (attendance_date, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mess_bills (
  id INT(11) NOT NULL AUTO_INCREMENT,
  bill_code VARCHAR(30) NOT NULL,
  academic_year VARCHAR(10) NOT NULL,
  month_year VARCHAR(7) NOT NULL,
  bill_type ENUM('student', 'staff') NOT NULL DEFAULT 'student',
  hostel_id SMALLINT(5) UNSIGNED NULL DEFAULT NULL,
  total_members INT(11) NOT NULL DEFAULT 0,
  total_sessions INT(11) NOT NULL DEFAULT 0,
  total_chargeable_days DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  per_day_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('preview', 'confirmed', 'published') NOT NULL DEFAULT 'preview',
  due_date DATE NULL DEFAULT NULL,
  published_at DATETIME NULL DEFAULT NULL,
  generated_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bill_code (bill_code),
  INDEX idx_bill_month_type (month_year, bill_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mess_bill_items (
  id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  mess_bill_id INT(11) NOT NULL,
  student_id INT(10) UNSIGNED NULL DEFAULT NULL,
  staff_user_id INT(10) UNSIGNED NULL DEFAULT NULL,
  total_sessions INT(11) NOT NULL DEFAULT 0,
  present_sessions INT(11) NOT NULL DEFAULT 0,
  absent_sessions INT(11) NOT NULL DEFAULT 0,
  leave_sessions INT(11) NOT NULL DEFAULT 0,
  chargeable_sessions INT(11) NOT NULL DEFAULT 0,
  chargeable_days DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  mess_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rebate_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  student_fee_id INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_item_bill (mess_bill_id),
  INDEX idx_item_student (mess_bill_id, student_id),
  INDEX idx_item_staff (mess_bill_id, staff_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default billing rule for current month
INSERT INTO mess_bill_rules (academic_year, month_year, student_per_day_rate, staff_per_day_rate, session_weight, charge_present, charge_absent, charge_leave, min_leave_days_for_rebate)
VALUES ('2026-27', DATE_FORMAT(CURDATE(), '%Y-%m'), 150.00, 120.00, 0.50, 1, 1, 0, 1)
ON DUPLICATE KEY UPDATE student_per_day_rate = VALUES(student_per_day_rate);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('feature_mess_billing', 'true', 'Enable Mess Billing Module (Students and Staff) with One-Click PDF and Ledger Publishing')
ON DUPLICATE KEY UPDATE description = VALUES(description);
