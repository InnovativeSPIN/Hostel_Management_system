-- Rollback 004: Revert layered admission flow

DELETE FROM system_settings WHERE setting_key = 'feature_new_admission_flow';

ALTER TABLE hostel_applications 
DROP COLUMN IF EXISTS preferred_room_category,
DROP COLUMN IF EXISTS allocated_fee_structure_id,
DROP COLUMN IF EXISTS auto_fee_allocated;

ALTER TABLE student_fees DROP COLUMN IF EXISTS fee_structure_v2_id;
ALTER TABLE student_fees MODIFY COLUMN fee_structure_id INT UNSIGNED NOT NULL;
