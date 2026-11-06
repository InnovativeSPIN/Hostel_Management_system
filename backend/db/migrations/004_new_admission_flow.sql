-- Migration 004: Layered admission flow with room category and auto fee allocation
-- Additive only, non-breaking with existing applications and flow

-- 1. Add feature flag to system_settings (default 'false' / OFF)
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('feature_new_admission_flow', 'false', 'Enable layered flow: Application -> Room Category -> Auto Fee Allocation -> Room Allotment')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 2. Add room category and fee tracking columns to hostel_applications
ALTER TABLE hostel_applications
ADD COLUMN preferred_room_category VARCHAR(60) DEFAULT NULL AFTER preferred_room_type,
ADD COLUMN allocated_fee_structure_id INT UNSIGNED DEFAULT NULL AFTER remarks,
ADD COLUMN auto_fee_allocated TINYINT(1) NOT NULL DEFAULT 0 AFTER allocated_fee_structure_id;

-- 3. Add fee_structure_v2_id to student_fees
ALTER TABLE student_fees
ADD COLUMN fee_structure_v2_id INT UNSIGNED DEFAULT NULL AFTER fee_structure_id;

-- 4. Allow fee_structure_id to be nullable so V2 fee structures can be assigned directly
ALTER TABLE student_fees MODIFY COLUMN fee_structure_id INT UNSIGNED NULL;
