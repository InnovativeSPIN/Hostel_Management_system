-- Rollback 007: Mess Billing Module
DROP TABLE IF EXISTS mess_bill_items;
DROP TABLE IF EXISTS mess_bills;
DROP TABLE IF EXISTS mess_staff_attendance;
DROP TABLE IF EXISTS mess_bill_rules;

DELETE FROM system_settings WHERE setting_key = 'feature_mess_billing';
