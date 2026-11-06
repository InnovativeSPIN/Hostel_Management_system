-- Migration 008: Complaint and Maintenance Attachments with Image Proof
-- Adds complaint_maintenance_attachments table and helper views

CREATE TABLE IF NOT EXISTS complaint_maintenance_attachments (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id INT(10) UNSIGNED NULL DEFAULT NULL,
  maintenance_id INT(10) UNSIGNED NULL DEFAULT NULL,
  attachment_type ENUM('complaint', 'before', 'after') NOT NULL DEFAULT 'complaint',
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_size INT(10) UNSIGNED NULL DEFAULT NULL,
  mime_type VARCHAR(100) NULL DEFAULT NULL,
  uploaded_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cma_complaint (complaint_id),
  KEY idx_cma_maintenance (maintenance_id),
  KEY idx_cma_type (attachment_type),
  CONSTRAINT fk_cma_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE,
  CONSTRAINT fk_cma_maintenance FOREIGN KEY (maintenance_id) REFERENCES maintenance_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_cma_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW complaint_attachments AS
  SELECT id, complaint_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by, created_at
  FROM complaint_maintenance_attachments
  WHERE complaint_id IS NOT NULL;

CREATE OR REPLACE VIEW maintenance_attachments AS
  SELECT id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by, created_at
  FROM complaint_maintenance_attachments
  WHERE maintenance_id IS NOT NULL;
