-- Migration 006: Session-based Attendance (2 Sessions: Morning and Evening)
-- New table: attendance_sessions
-- Features: 2 sessions (Morning, Evening), 5 statuses (Present, Absent, Leave, Medical Leave, On Duty),
-- Mandatory absent_reason for Absent, Leave/OD auto-fill tracking, Reports by day, month, student, and block.

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT(10) UNSIGNED NOT NULL,
  hostel_id SMALLINT(5) UNSIGNED NOT NULL,
  room_id INT(10) UNSIGNED NULL DEFAULT NULL,
  block_name VARCHAR(60) NULL DEFAULT NULL,
  attendance_date DATE NOT NULL,
  session ENUM('Morning', 'Evening') NOT NULL,
  status ENUM('Present', 'Absent', 'Leave', 'Medical Leave', 'On Duty') NOT NULL,
  absent_reason VARCHAR(255) NULL DEFAULT NULL,
  remarks VARCHAR(255) NULL DEFAULT NULL,
  auto_filled TINYINT(1) NOT NULL DEFAULT 0,
  leave_id INT(10) UNSIGNED NULL DEFAULT NULL,
  marked_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_att_session (student_id, attendance_date, session),
  INDEX idx_att_sess_hostel_date (hostel_id, attendance_date, session),
  INDEX idx_att_sess_status (attendance_date, session, status),
  INDEX idx_att_sess_block (block_name, attendance_date, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('feature_session_attendance', 'true', 'Enable 2-Session Attendance (Morning and Evening) with Leave/OD auto-fill')
ON DUPLICATE KEY UPDATE description = VALUES(description);
