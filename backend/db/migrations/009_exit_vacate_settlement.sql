-- Migration 009: Exit / Vacate Workflow with Settlement Statement PDF
-- Additive columns on hostel_exit_records and new exit_settlements table

ALTER TABLE hostel_exit_records
  ADD COLUMN warden_approved_by INT(10) UNSIGNED NULL DEFAULT NULL AFTER requested_by,
  ADD COLUMN warden_approved_at DATETIME NULL DEFAULT NULL AFTER warden_approved_by,
  ADD COLUMN warden_remarks VARCHAR(500) NULL DEFAULT NULL AFTER warden_approved_at,
  ADD COLUMN damage_photo_url VARCHAR(255) NULL DEFAULT NULL AFTER inspection_notes,
  ADD COLUMN inspection_checklist JSON NULL DEFAULT NULL AFTER damage_photo_url,
  ADD COLUMN settlement_id INT(10) UNSIGNED NULL DEFAULT NULL AFTER clearance_status,
  ADD CONSTRAINT fk_exit_warden_appr FOREIGN KEY (warden_approved_by) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS exit_settlements (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  exit_record_id INT(10) UNSIGNED NOT NULL,
  student_id INT(10) UNSIGNED NOT NULL,
  pending_fees DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pending_mess_bill DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  room_rent_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  damage_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  caution_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  advance_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Positive = payable by student, Negative = refundable',
  settlement_type ENUM('payable', 'refundable', 'nil') NOT NULL DEFAULT 'nil',
  status ENUM('pending', 'settled', 'refunded') NOT NULL DEFAULT 'pending',
  breakdown JSON NULL DEFAULT NULL,
  notes VARCHAR(500) NULL DEFAULT NULL,
  settled_by INT(10) UNSIGNED NULL DEFAULT NULL,
  settled_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_exit_settlement (exit_record_id),
  KEY idx_es_student (student_id),
  CONSTRAINT fk_es_exit FOREIGN KEY (exit_record_id) REFERENCES hostel_exit_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_es_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_es_settled_by FOREIGN KEY (settled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  ('vacate_rent_policy', 'daily_prorata', 'Policy for room rent on vacate: daily_prorata or full_month'),
  ('vacate_mess_per_session', '75.00', 'Per-session mess charge for unbilled attendance on vacate')
ON DUPLICATE KEY UPDATE description = VALUES(description);
