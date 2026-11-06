-- Rollback 005: Student Dashboard Additions
DROP TABLE IF EXISTS mess_menu_overrides;
DROP TABLE IF EXISTS mess_menu_weekly;

ALTER TABLE leave_requests
  MODIFY COLUMN leave_type ENUM('home','medical','personal','academic','emergency') NOT NULL;

ALTER TABLE visitor_entries
  DROP COLUMN IF EXISTS overstay_flagged,
  DROP COLUMN IF EXISTS rejection_remarks,
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS to_time,
  DROP COLUMN IF EXISTS from_time,
  DROP COLUMN IF EXISTS visit_date;

DELETE FROM system_settings WHERE setting_key = 'feature_student_dashboard_v2';
