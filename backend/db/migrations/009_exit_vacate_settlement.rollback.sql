-- Rollback Migration 009: Exit / Vacate Workflow with Settlement Statement PDF

DROP TABLE IF EXISTS exit_settlements;

ALTER TABLE hostel_exit_records
  DROP FOREIGN KEY fk_exit_warden_appr,
  DROP COLUMN IF EXISTS warden_approved_by,
  DROP COLUMN IF EXISTS warden_approved_at,
  DROP COLUMN IF EXISTS warden_remarks,
  DROP COLUMN IF EXISTS damage_photo_url,
  DROP COLUMN IF EXISTS inspection_checklist,
  DROP COLUMN IF EXISTS settlement_id;

DELETE FROM system_settings WHERE setting_key IN ('vacate_rent_policy', 'vacate_mess_per_session');
