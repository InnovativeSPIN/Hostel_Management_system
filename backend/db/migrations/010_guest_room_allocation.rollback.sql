-- Rollback Migration 010: Guest Room Allocation
DROP TABLE IF EXISTS guest_allocations;
DROP TABLE IF EXISTS guest_rooms;
DELETE FROM system_settings WHERE setting_key = 'guest_room_fee_policy';
