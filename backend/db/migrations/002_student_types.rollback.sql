-- Rollback 002: Revert student_type and student_cbse_details table

DROP TABLE IF EXISTS student_cbse_details;

ALTER TABLE students DROP COLUMN IF EXISTS student_type;

DELETE FROM departments WHERE code = 'CBSE';
