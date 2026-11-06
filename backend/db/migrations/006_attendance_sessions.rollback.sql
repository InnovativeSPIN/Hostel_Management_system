-- Rollback 006: Session-based Attendance
DROP TABLE IF EXISTS attendance_sessions;
DELETE FROM system_settings WHERE setting_key = 'feature_session_attendance';
