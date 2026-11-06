-- Rollback Step 1: Admission changes
ALTER TABLE students 
  MODIFY COLUMN admission_quota ENUM('government', 'management', 'nri', 'lateral') NOT NULL DEFAULT 'government';

ALTER TABLE students 
  DROP COLUMN photo_url;
