-- Step 1: Admission changes (additive only)
-- Add '7.5% Scheme' and 'Sports Quota' to admission_quota ENUM
ALTER TABLE students 
  MODIFY COLUMN admission_quota ENUM('government', 'management', 'nri', 'lateral', '7.5% Scheme', 'Sports Quota') NOT NULL DEFAULT 'government';

-- Add student photo field (nullable, default NULL)
ALTER TABLE students 
  ADD COLUMN photo_url VARCHAR(255) DEFAULT NULL;
