-- Each block below is executed as a single statement by db/setup.js.
DROP TRIGGER IF EXISTS trg_audit_no_update;
-- @@
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is read-only';
END;
-- @@
DROP TRIGGER IF EXISTS trg_audit_no_delete;
-- @@
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is read-only';
END;
-- @@
DROP TRIGGER IF EXISTS trg_payment_no_update;
-- @@
CREATE TRIGGER trg_payment_no_update BEFORE UPDATE ON payments
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments are immutable';
END;
