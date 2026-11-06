-- Migration 002: Add student_type and student_cbse_details table
-- Additive only, non-breaking with default 'NSCET'

-- 1. Ensure CBSE department exists for referential integrity
INSERT INTO departments (code, name, short_name, degree, university_code, hod_name, block, annual_intake, established_year, nba_accredited, status)
SELECT 'CBSE', 'Nadar Saraswathi CBSE School', 'NS-CBSE', 'School', 'CBSE', 'School Principal', 'School Campus', 300, 2010, 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE code = 'CBSE');

-- 2. Add student_type column to students table (default 'NSCET')
ALTER TABLE students 
ADD COLUMN student_type ENUM('NSCET', 'NS-CBSE') NOT NULL DEFAULT 'NSCET' AFTER admission_quota;

-- 3. Create student_cbse_details table for NS-CBSE specific records
CREATE TABLE IF NOT EXISTS student_cbse_details (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL UNIQUE,
  class_level ENUM('Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12') NOT NULL,
  section VARCHAR(10) DEFAULT NULL,
  admission_number VARCHAR(50) DEFAULT NULL,
  date_of_birth DATE DEFAULT NULL,
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') DEFAULT NULL,
  parent_name VARCHAR(120) DEFAULT NULL,
  parent_relation VARCHAR(50) DEFAULT NULL,
  parent_phone VARCHAR(20) DEFAULT NULL,
  parent_email VARCHAR(160) DEFAULT NULL,
  parent_occupation VARCHAR(100) DEFAULT NULL,
  local_guardian_name VARCHAR(120) DEFAULT NULL,
  local_guardian_relation VARCHAR(50) DEFAULT NULL,
  local_guardian_phone VARCHAR(20) DEFAULT NULL,
  local_guardian_address VARCHAR(255) DEFAULT NULL,
  emergency_contact_name VARCHAR(120) DEFAULT NULL,
  emergency_contact_phone VARCHAR(20) DEFAULT NULL,
  medical_conditions TEXT DEFAULT NULL,
  allergies TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cbse_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
