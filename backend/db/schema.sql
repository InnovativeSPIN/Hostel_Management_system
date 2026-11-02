-- =====================================================================
-- Hostel Operations Platform - MySQL 8 schema
-- Statements are separated by ";\n" and executed by db/setup.js.
-- Triggers live in db/triggers.sql (they need single-statement execution).
-- =====================================================================

-- ---------- Access control ----------
CREATE TABLE roles (
  id            TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(30)  NOT NULL UNIQUE,
  label         VARCHAR(60)  NOT NULL,
  description   VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id            SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code          VARCHAR(60)  NOT NULL UNIQUE,
  module        VARCHAR(40)  NOT NULL,
  description   VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id       TINYINT UNSIGNED  NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE users (
  id                 INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id            TINYINT UNSIGNED NOT NULL,
  name               VARCHAR(120) NOT NULL,
  email              VARCHAR(160) NOT NULL UNIQUE,
  phone              VARCHAR(20)  NULL,
  password_hash      VARCHAR(100) NOT NULL,
  designation        VARCHAR(80)  NULL,
  staff_skill        ENUM('electrical','plumbing','cleaning','internet','furniture','food','security','general') NULL,
  status             ENUM('active','inactive','locked') NOT NULL DEFAULT 'active',
  token_version      INT UNSIGNED NOT NULL DEFAULT 0,
  failed_logins      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  reset_token_hash   CHAR(64) NULL,
  reset_token_expires DATETIME NULL,
  last_login_at      DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME NULL,
  KEY idx_users_role (role_id),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- ---------- Academic master data (engineering college) ----------
CREATE TABLE departments (
  id              SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code            VARCHAR(12)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  short_name      VARCHAR(20)  NOT NULL,
  degree          ENUM('B.E.','B.Tech.','M.E.','M.Tech.','MBA','MCA') NOT NULL,
  university_code CHAR(3)      NULL COMMENT 'Branch code used in register numbers',
  hod_name        VARCHAR(120) NULL,
  hod_email       VARCHAR(160) NULL,
  hod_phone       VARCHAR(20)  NULL,
  block           VARCHAR(60)  NULL,
  annual_intake   SMALLINT UNSIGNED NULL,
  established_year SMALLINT UNSIGNED NULL,
  nba_accredited  TINYINT(1) NOT NULL DEFAULT 0,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Hostel structure ----------
CREATE TABLE hostels (
  id            SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code          VARCHAR(6)   NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  gender        ENUM('male','female','co-ed') NOT NULL,
  hostel_type   ENUM('UG','PG','Mixed','International') NOT NULL DEFAULT 'UG',
  address       VARCHAR(255) NULL,
  warden_id     INT UNSIGNED NULL,
  contact_phone VARCHAR(20)  NULL,
  contact_email VARCHAR(160) NULL,
  total_floors  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status        ENUM('active','inactive','maintenance') NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  CONSTRAINT fk_hostels_warden FOREIGN KEY (warden_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Wardens, staff and security staff are scoped to one or more hostels.
CREATE TABLE user_hostels (
  user_id    INT UNSIGNED NOT NULL,
  hostel_id  SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, hostel_id),
  KEY idx_uh_hostel (hostel_id),
  CONSTRAINT fk_uh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uh_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE floors (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  hostel_id    SMALLINT UNSIGNED NOT NULL,
  floor_number TINYINT NOT NULL,
  label        VARCHAR(60) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_floor (hostel_id, floor_number),
  CONSTRAINT fk_floors_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE rooms (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  hostel_id         SMALLINT UNSIGNED NOT NULL,
  floor_id          INT UNSIGNED NOT NULL,
  room_number       VARCHAR(10) NOT NULL,
  room_type         ENUM('single','double','triple','quad','dormitory') NOT NULL,
  capacity          TINYINT UNSIGNED NOT NULL,
  current_occupancy TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_ac             TINYINT(1) NOT NULL DEFAULT 0,
  attached_bath     TINYINT(1) NOT NULL DEFAULT 0,
  status            ENUM('active','maintenance','blocked','inactive') NOT NULL DEFAULT 'active',
  status_reason     VARCHAR(255) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME NULL,
  UNIQUE KEY uq_room (hostel_id, room_number),
  KEY idx_rooms_floor (floor_id),
  KEY idx_rooms_status (status),
  CONSTRAINT chk_room_capacity CHECK (capacity BETWEEN 1 AND 20),
  CONSTRAINT chk_room_occupancy CHECK (current_occupancy <= capacity),
  CONSTRAINT fk_rooms_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_rooms_floor FOREIGN KEY (floor_id) REFERENCES floors(id)
) ENGINE=InnoDB;

CREATE TABLE beds (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  room_id     INT UNSIGNED NOT NULL,
  bed_number  TINYINT UNSIGNED NOT NULL,
  bed_code    VARCHAR(30) NOT NULL UNIQUE COMMENT 'e.g. A-1-103-B2',
  status      ENUM('available','occupied','reserved','maintenance','blocked') NOT NULL DEFAULT 'available',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bed (room_id, bed_number),
  KEY idx_beds_status (status),
  CONSTRAINT fk_beds_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Students ----------
CREATE TABLE students (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL UNIQUE,
  register_number  VARCHAR(20)  NOT NULL UNIQUE,
  roll_number      VARCHAR(20)  NULL UNIQUE,
  name             VARCHAR(120) NOT NULL,
  email            VARCHAR(160) NOT NULL UNIQUE,
  phone            VARCHAR(20)  NOT NULL,
  gender           ENUM('male','female','other') NOT NULL,
  date_of_birth    DATE NULL,
  department_id    SMALLINT UNSIGNED NOT NULL,
  year_of_study    TINYINT UNSIGNED NOT NULL,
  semester         TINYINT UNSIGNED NOT NULL,
  section          CHAR(1) NULL,
  batch            VARCHAR(9) NOT NULL COMMENT 'e.g. 2023-2027',
  admission_date   DATE NULL,
  admission_quota  ENUM('government','management','nri','lateral') NOT NULL DEFAULT 'government',
  hostel_status    ENUM('not_applied','applied','approved','resident','exited','rejected') NOT NULL DEFAULT 'not_applied',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       DATETIME NULL,
  KEY idx_students_dept (department_id),
  KEY idx_students_year (year_of_study),
  KEY idx_students_status (hostel_status),
  KEY idx_students_name (name),
  CONSTRAINT chk_year CHECK (year_of_study BETWEEN 1 AND 5),
  CONSTRAINT chk_sem CHECK (semester BETWEEN 1 AND 10),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_students_dept FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE student_profiles (
  student_id              INT UNSIGNED PRIMARY KEY,
  parent_name             VARCHAR(120) NULL,
  parent_relation         VARCHAR(30)  NULL,
  parent_phone            VARCHAR(20)  NULL,
  parent_email            VARCHAR(160) NULL,
  parent_occupation       VARCHAR(80)  NULL,
  emergency_contact_name  VARCHAR(120) NULL,
  emergency_contact_phone VARCHAR(20)  NULL,
  address_line            VARCHAR(255) NULL,
  city                    VARCHAR(80)  NULL,
  district                VARCHAR(80)  NULL,
  state                   VARCHAR(80)  NULL,
  pincode                 CHAR(6)      NULL,
  blood_group             ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NULL,
  medical_notes           VARCHAR(255) NULL,
  faculty_advisor         VARCHAR(120) NULL,
  cgpa                    DECIMAL(4,2) NULL,
  scholarship             VARCHAR(120) NULL,
  first_graduate          TINYINT(1) NOT NULL DEFAULT 0,
  distance_from_home_km   SMALLINT UNSIGNED NULL,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_cgpa CHECK (cgpa IS NULL OR cgpa BETWEEN 0 AND 10),
  CONSTRAINT fk_profile_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Parent / guardian login accounts linked to one or more students (siblings).
CREATE TABLE parent_students (
  parent_user_id INT UNSIGNED NOT NULL,
  student_id     INT UNSIGNED NOT NULL,
  relation       VARCHAR(30) NOT NULL,
  is_primary     TINYINT(1) NOT NULL DEFAULT 1,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_user_id, student_id),
  KEY idx_ps_student (student_id),
  CONSTRAINT fk_ps_parent FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Admission ----------
CREATE TABLE hostel_applications (
  id                   INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_code     VARCHAR(20) NOT NULL UNIQUE,
  student_id           INT UNSIGNED NOT NULL,
  academic_year        VARCHAR(9)  NOT NULL,
  preferred_hostel_id  SMALLINT UNSIGNED NULL,
  preferred_room_type  ENUM('single','double','triple','quad','dormitory') NULL,
  needs_ac             TINYINT(1) NOT NULL DEFAULT 0,
  reason               VARCHAR(500) NULL,
  status               ENUM('submitted','documents_verified','eligible','approved','rejected','fee_assigned','allocated','confirmed','cancelled') NOT NULL DEFAULT 'submitted',
  eligibility_notes    VARCHAR(500) NULL,
  remarks              VARCHAR(500) NULL,
  reviewed_by          INT UNSIGNED NULL,
  reviewed_at          DATETIME NULL,
  -- Only one non-terminal application per student per academic year.
  open_key             VARCHAR(40) GENERATED ALWAYS AS (
                          IF(status IN ('rejected','cancelled'), NULL, CONCAT(student_id, ':', academic_year))
                       ) STORED,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_open (open_key),
  KEY idx_app_status (status),
  CONSTRAINT fk_app_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_app_hostel FOREIGN KEY (preferred_hostel_id) REFERENCES hostels(id) ON DELETE SET NULL,
  CONSTRAINT fk_app_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE application_status_history (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  from_status    VARCHAR(30) NULL,
  to_status      VARCHAR(30) NOT NULL,
  changed_by     INT UNSIGNED NULL,
  remarks        VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ash_app (application_id),
  CONSTRAINT fk_ash_app FOREIGN KEY (application_id) REFERENCES hostel_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_ash_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE application_documents (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  doc_type       ENUM('id_proof','admission_letter','address_proof','photo','medical_certificate','income_certificate','other') NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(80)  NOT NULL,
  size_bytes     INT UNSIGNED NOT NULL,
  verified       TINYINT(1) NOT NULL DEFAULT 0,
  verified_by    INT UNSIGNED NULL,
  verified_at    DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doc_app (application_id),
  CONSTRAINT fk_doc_app FOREIGN KEY (application_id) REFERENCES hostel_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Allocation ----------
CREATE TABLE room_allocations (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id      INT UNSIGNED NOT NULL,
  bed_id          INT UNSIGNED NOT NULL,
  room_id         INT UNSIGNED NOT NULL,
  hostel_id       SMALLINT UNSIGNED NOT NULL,
  application_id  INT UNSIGNED NULL,
  academic_year   VARCHAR(9) NOT NULL,
  status          ENUM('active','transferred','vacated') NOT NULL DEFAULT 'active',
  allocated_by    INT UNSIGNED NULL,
  allocated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at        DATETIME NULL,
  end_reason      VARCHAR(255) NULL,
  -- Hard guarantees: one active student per bed, one active bed per student.
  active_bed_id     INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', bed_id, NULL)) STORED,
  active_student_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', student_id, NULL)) STORED,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_alloc_active_bed (active_bed_id),
  UNIQUE KEY uq_alloc_active_student (active_student_id),
  KEY idx_alloc_student (student_id),
  KEY idx_alloc_hostel_status (hostel_id, status),
  CONSTRAINT fk_alloc_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_alloc_bed FOREIGN KEY (bed_id) REFERENCES beds(id),
  CONSTRAINT fk_alloc_room FOREIGN KEY (room_id) REFERENCES rooms(id),
  CONSTRAINT fk_alloc_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_alloc_app FOREIGN KEY (application_id) REFERENCES hostel_applications(id) ON DELETE SET NULL,
  CONSTRAINT fk_alloc_by FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE room_transfer_history (
  id                 INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id         INT UNSIGNED NOT NULL,
  from_allocation_id INT UNSIGNED NOT NULL,
  to_allocation_id   INT UNSIGNED NOT NULL,
  from_bed_id        INT UNSIGNED NOT NULL,
  to_bed_id          INT UNSIGNED NOT NULL,
  reason             VARCHAR(255) NOT NULL,
  transferred_by     INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rth_student (student_id),
  CONSTRAINT fk_rth_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_rth_from FOREIGN KEY (from_allocation_id) REFERENCES room_allocations(id),
  CONSTRAINT fk_rth_to FOREIGN KEY (to_allocation_id) REFERENCES room_allocations(id),
  CONSTRAINT fk_rth_from_bed FOREIGN KEY (from_bed_id) REFERENCES beds(id),
  CONSTRAINT fk_rth_to_bed FOREIGN KEY (to_bed_id) REFERENCES beds(id),
  CONSTRAINT fk_rth_by FOREIGN KEY (transferred_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE hostel_exit_records (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id        INT UNSIGNED NOT NULL,
  allocation_id     INT UNSIGNED NOT NULL,
  requested_exit_date DATE NOT NULL,
  exit_date         DATE NULL,
  reason            ENUM('course_completed','discontinued','transfer_to_day_scholar','medical','disciplinary','other') NOT NULL,
  reason_details    VARCHAR(500) NULL,
  room_condition    ENUM('good','minor_damage','major_damage') NULL,
  inspection_notes  VARCHAR(500) NULL,
  pending_fees      DECIMAL(10,2) NOT NULL DEFAULT 0,
  damage_charges    DECIMAL(10,2) NOT NULL DEFAULT 0,
  clearance_status  ENUM('requested','inspected','cleared','rejected','cancelled') NOT NULL DEFAULT 'requested',
  requested_by      INT UNSIGNED NULL,
  inspected_by      INT UNSIGNED NULL,
  approved_by       INT UNSIGNED NULL,
  approved_at       DATETIME NULL,
  open_student_id   INT UNSIGNED GENERATED ALWAYS AS (IF(clearance_status IN ('requested','inspected'), student_id, NULL)) STORED,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exit_open (open_student_id),
  CONSTRAINT chk_exit_money CHECK (pending_fees >= 0 AND damage_charges >= 0),
  CONSTRAINT fk_exit_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_exit_alloc FOREIGN KEY (allocation_id) REFERENCES room_allocations(id),
  CONSTRAINT fk_exit_req FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_exit_insp FOREIGN KEY (inspected_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_exit_appr FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Attendance ----------
CREATE TABLE attendance (
  id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id      INT UNSIGNED NOT NULL,
  hostel_id       SMALLINT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status          ENUM('present','absent','late','on_leave','out_pass') NOT NULL,
  check_in_time   TIME NULL,
  remarks         VARCHAR(255) NULL,
  marked_by       INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (student_id, attendance_date),
  KEY idx_att_hostel_date (hostel_id, attendance_date),
  KEY idx_att_date_status (attendance_date, status),
  CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_att_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_att_by FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE attendance_exceptions (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id       INT UNSIGNED NOT NULL,
  hostel_id        SMALLINT UNSIGNED NOT NULL,
  exception_date   DATE NOT NULL,
  exception_type   ENUM('absent','repeated_absence','low_attendance','absent_with_leave','not_marked','leave_overdue') NOT NULL,
  details          VARCHAR(500) NULL,
  status           ENUM('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolution_notes VARCHAR(500) NULL,
  resolved_by      INT UNSIGNED NULL,
  resolved_at      DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exception (student_id, exception_date, exception_type),
  KEY idx_exc_status (status, exception_date),
  CONSTRAINT fk_exc_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_exc_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_exc_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Leave ----------
CREATE TABLE leave_requests (
  id                 INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  leave_code         VARCHAR(20) NOT NULL UNIQUE,
  student_id         INT UNSIGNED NOT NULL,
  leave_type         ENUM('home','medical','personal','academic','emergency') NOT NULL,
  from_date          DATE NOT NULL,
  to_date            DATE NOT NULL,
  expected_return_at DATETIME NOT NULL,
  reason             VARCHAR(500) NOT NULL,
  destination        VARCHAR(200) NOT NULL,
  guardian_contact   VARCHAR(20)  NOT NULL,
  emergency_contact  VARCHAR(20)  NOT NULL,
  document_name      VARCHAR(255) NULL,
  document_original  VARCHAR(255) NULL,
  status             ENUM('pending','approved','rejected','cancelled','returned') NOT NULL DEFAULT 'pending',
  reviewed_by        INT UNSIGNED NULL,
  reviewed_at        DATETIME NULL,
  review_remarks     VARCHAR(500) NULL,
  departed_at        DATETIME NULL,
  returned_at        DATETIME NULL,
  return_marked_by   INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_leave_student (student_id, status),
  KEY idx_leave_dates (from_date, to_date),
  KEY idx_leave_status (status, expected_return_at),
  CONSTRAINT chk_leave_range CHECK (to_date >= from_date),
  CONSTRAINT fk_leave_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_leave_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_leave_return_by FOREIGN KEY (return_marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE leave_history (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  leave_id    INT UNSIGNED NOT NULL,
  action      VARCHAR(40) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status   VARCHAR(20) NOT NULL,
  acted_by    INT UNSIGNED NULL,
  remarks     VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lh_leave (leave_id),
  CONSTRAINT fk_lh_leave FOREIGN KEY (leave_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_lh_user FOREIGN KEY (acted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Complaints ----------
CREATE TABLE complaints (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  complaint_code   VARCHAR(20) NOT NULL UNIQUE,
  student_id       INT UNSIGNED NOT NULL,
  hostel_id        SMALLINT UNSIGNED NOT NULL,
  room_id          INT UNSIGNED NULL,
  category         ENUM('electrical','plumbing','cleaning','internet','furniture','food','security','other') NOT NULL,
  priority         ENUM('low','medium','high','critical') NOT NULL,
  title            VARCHAR(150) NOT NULL,
  description      VARCHAR(2000) NOT NULL,
  status           ENUM('pending','assigned','in_progress','resolved','closed','rejected') NOT NULL DEFAULT 'pending',
  assigned_to      INT UNSIGNED NULL,
  sla_hours        SMALLINT UNSIGNED NOT NULL,
  sla_due_at       DATETIME NOT NULL,
  escalation_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=staff,1=warden,2=admin',
  escalated_at     DATETIME NULL,
  resolved_at      DATETIME NULL,
  closed_at        DATETIME NULL,
  resolution_note  VARCHAR(1000) NULL,
  student_rating   TINYINT UNSIGNED NULL,
  student_feedback VARCHAR(500) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cmp_status (status, sla_due_at),
  KEY idx_cmp_hostel (hostel_id, status),
  KEY idx_cmp_assignee (assigned_to, status),
  KEY idx_cmp_student (student_id),
  CONSTRAINT chk_rating CHECK (student_rating IS NULL OR student_rating BETWEEN 1 AND 5),
  CONSTRAINT fk_cmp_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_cmp_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_cmp_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
  CONSTRAINT fk_cmp_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE complaint_updates (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  complaint_id INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NULL,
  from_status  VARCHAR(20) NULL,
  to_status    VARCHAR(20) NULL,
  update_type  ENUM('status','note','assignment','escalation','feedback') NOT NULL DEFAULT 'status',
  note         VARCHAR(1000) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cu_complaint (complaint_id),
  CONSTRAINT fk_cu_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_cu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE complaint_assignments (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  complaint_id  INT UNSIGNED NOT NULL,
  assigned_to   INT UNSIGNED NOT NULL,
  assigned_by   INT UNSIGNED NULL,
  assigned_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at DATETIME NULL,
  is_current    TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_ca_complaint (complaint_id),
  CONSTRAINT fk_ca_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_ca_to FOREIGN KEY (assigned_to) REFERENCES users(id),
  CONSTRAINT fk_ca_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Maintenance ----------
CREATE TABLE maintenance_requests (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_code  VARCHAR(20) NOT NULL UNIQUE,
  hostel_id     SMALLINT UNSIGNED NOT NULL,
  room_id       INT UNSIGNED NULL,
  bed_id        INT UNSIGNED NULL,
  complaint_id  INT UNSIGNED NULL,
  category      ENUM('electrical','plumbing','cleaning','furniture','structural','internet','pest_control','other') NOT NULL,
  priority      ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  title         VARCHAR(150) NOT NULL,
  description   VARCHAR(1000) NULL,
  blocks_room   TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Room put into maintenance while open',
  status        ENUM('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  assigned_to   INT UNSIGNED NULL,
  requested_by  INT UNSIGNED NULL,
  started_at    DATETIME NULL,
  completed_at  DATETIME NULL,
  cost          DECIMAL(10,2) NULL,
  notes         VARCHAR(1000) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mr_status (status),
  KEY idx_mr_hostel (hostel_id, status),
  CONSTRAINT chk_mr_cost CHECK (cost IS NULL OR cost >= 0),
  CONSTRAINT fk_mr_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_mr_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_bed FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Fees ----------
CREATE TABLE fee_structures (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name             VARCHAR(120) NOT NULL,
  academic_year    VARCHAR(9)   NOT NULL,
  hostel_id        SMALLINT UNSIGNED NULL,
  room_type        ENUM('single','double','triple','quad','dormitory') NULL,
  hostel_fee       DECIMAL(10,2) NOT NULL DEFAULT 0,
  mess_fee         DECIMAL(10,2) NOT NULL DEFAULT 0,
  maintenance_fee  DECIMAL(10,2) NOT NULL DEFAULT 0,
  security_deposit DECIMAL(10,2) NOT NULL DEFAULT 0,
  other_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount     DECIMAL(10,2) GENERATED ALWAYS AS (hostel_fee + mess_fee + maintenance_fee + security_deposit + other_fee) STORED,
  due_date         DATE NOT NULL,
  status           ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fee_structure (name, academic_year),
  CONSTRAINT chk_fee_nonneg CHECK (hostel_fee >= 0 AND mess_fee >= 0 AND maintenance_fee >= 0 AND security_deposit >= 0 AND other_fee >= 0),
  CONSTRAINT fk_fs_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE SET NULL,
  CONSTRAINT fk_fs_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE student_fees (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id       INT UNSIGNED NOT NULL,
  fee_structure_id INT UNSIGNED NOT NULL,
  academic_year    VARCHAR(9) NOT NULL,
  total_amount     DECIMAL(10,2) NOT NULL,
  discount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid      DECIMAL(10,2) NOT NULL DEFAULT 0,
  due_date         DATE NOT NULL,
  waived           TINYINT(1) NOT NULL DEFAULT 0,
  remarks          VARCHAR(255) NULL,
  assigned_by      INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_fee (student_id, fee_structure_id),
  KEY idx_sf_due (due_date),
  CONSTRAINT chk_sf_amounts CHECK (discount >= 0 AND amount_paid >= 0 AND discount <= total_amount AND amount_paid <= total_amount - discount),
  CONSTRAINT fk_sf_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_sf_structure FOREIGN KEY (fee_structure_id) REFERENCES fee_structures(id),
  CONSTRAINT fk_sf_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE payments (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  receipt_number  VARCHAR(30) NOT NULL UNIQUE,
  student_fee_id  INT UNSIGNED NOT NULL,
  student_id      INT UNSIGNED NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  payment_mode    ENUM('cash','upi','card','netbanking','dd','cheque') NOT NULL,
  transaction_id  VARCHAR(60) NOT NULL UNIQUE,
  paid_at         DATETIME NOT NULL,
  recorded_by     INT UNSIGNED NULL,
  remarks         VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pay_student (student_id),
  KEY idx_pay_date (paid_at),
  CONSTRAINT chk_pay_amount CHECK (amount > 0),
  CONSTRAINT fk_pay_sf FOREIGN KEY (student_fee_id) REFERENCES student_fees(id),
  CONSTRAINT fk_pay_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_pay_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Visitors ----------
CREATE TABLE visitors (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(120) NOT NULL,
  phone           VARCHAR(20)  NOT NULL UNIQUE,
  id_proof_type   ENUM('aadhaar','driving_license','voter_id','passport','pan','college_id','other') NOT NULL,
  id_proof_number VARCHAR(40)  NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE visitor_entries (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pass_code       VARCHAR(20) NOT NULL UNIQUE,
  visitor_id      INT UNSIGNED NOT NULL,
  student_id      INT UNSIGNED NOT NULL,
  hostel_id       SMALLINT UNSIGNED NOT NULL,
  relationship    VARCHAR(40)  NOT NULL,
  purpose         VARCHAR(255) NOT NULL,
  expected_at     DATETIME NULL,
  entry_time      DATETIME NULL,
  exit_time       DATETIME NULL,
  status          ENUM('expected','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'expected',
  approved_by     INT UNSIGNED NULL,
  checked_in_by   INT UNSIGNED NULL,
  checked_out_by  INT UNSIGNED NULL,
  remarks         VARCHAR(255) NULL,
  -- A visitor can only be physically inside once at a time.
  inside_visitor_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'checked_in', visitor_id, NULL)) STORED,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_visitor_inside (inside_visitor_id),
  KEY idx_ve_status (status),
  KEY idx_ve_hostel_date (hostel_id, created_at),
  CONSTRAINT chk_ve_times CHECK (exit_time IS NULL OR entry_time IS NULL OR exit_time >= entry_time),
  CONSTRAINT fk_ve_visitor FOREIGN KEY (visitor_id) REFERENCES visitors(id),
  CONSTRAINT fk_ve_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_ve_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id),
  CONSTRAINT fk_ve_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ve_in FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ve_out FOREIGN KEY (checked_out_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------- Activities & communication ----------
CREATE TABLE activities (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  hostel_id        SMALLINT UNSIGNED NULL COMMENT 'NULL = all hostels',
  title            VARCHAR(150) NOT NULL,
  description      VARCHAR(2000) NULL,
  category         ENUM('cultural','sports','technical','welfare','meeting','other') NOT NULL DEFAULT 'other',
  venue            VARCHAR(150) NULL,
  start_at         DATETIME NOT NULL,
  end_at           DATETIME NOT NULL,
  max_participants SMALLINT UNSIGNED NULL,
  status           ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_activity_time CHECK (end_at > start_at),
  CONSTRAINT fk_act_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE SET NULL,
  CONSTRAINT fk_act_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE activity_participants (
  activity_id   INT UNSIGNED NOT NULL,
  student_id    INT UNSIGNED NOT NULL,
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attended      TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (activity_id, student_id),
  CONSTRAINT fk_ap_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_ap_student FOREIGN KEY (student_id) REFERENCES students(id)
) ENGINE=InnoDB;

CREATE TABLE announcements (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  hostel_id    SMALLINT UNSIGNED NULL COMMENT 'NULL = all hostels',
  title        VARCHAR(150) NOT NULL,
  body         VARCHAR(4000) NOT NULL,
  priority     ENUM('normal','important','urgent') NOT NULL DEFAULT 'normal',
  audience     ENUM('all','students','staff') NOT NULL DEFAULT 'all',
  published_by INT UNSIGNED NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,
  KEY idx_ann_pub (published_at),
  CONSTRAINT fk_ann_hostel FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE SET NULL,
  CONSTRAINT fk_ann_by FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(40)  NOT NULL,
  title       VARCHAR(150) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  link        VARCHAR(255) NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  dedupe_key  VARCHAR(120) NULL COMMENT 'Prevents duplicate automated alerts',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notif_dedupe (user_id, dedupe_key),
  KEY idx_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Policies & audit ----------
CREATE TABLE system_settings (
  setting_key   VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description   VARCHAR(255) NULL,
  updated_by    INT UNSIGNED NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  user_name   VARCHAR(120) NULL,
  user_role   VARCHAR(30)  NULL,
  action      VARCHAR(60)  NOT NULL,
  module      VARCHAR(40)  NOT NULL,
  record_id   VARCHAR(40)  NULL,
  summary     VARCHAR(500) NULL,
  old_value   JSON NULL,
  new_value   JSON NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_module (module, created_at),
  KEY idx_audit_user (user_id, created_at),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB;
