-- Rollback Migration 008: Complaint and Maintenance Attachments with Image Proof

DROP VIEW IF EXISTS maintenance_attachments;
DROP VIEW IF EXISTS complaint_attachments;
DROP TABLE IF EXISTS complaint_maintenance_attachments;
