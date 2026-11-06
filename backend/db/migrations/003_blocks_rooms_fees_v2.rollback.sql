-- Rollback 003: Revert blocks, room categories and fee structures v2

DROP TABLE IF EXISTS fee_structures_v2;

-- Remove added beds for Block A and Block B Ground Floor rooms 1-9
DELETE FROM beds WHERE room_id IN (
  SELECT r.id FROM rooms r 
  JOIN floors f ON f.id = r.floor_id 
  WHERE f.floor_number = 0 AND r.room_number IN ('1','2','3','4','5','6','7','8','9')
);

-- Remove added rooms for Ground floor 1-9
DELETE FROM rooms WHERE floor_id IN (
  SELECT id FROM floors WHERE floor_number = 0
) AND room_number IN ('1','2','3','4','5','6','7','8','9');

-- Remove added ground floors if empty
DELETE FROM floors WHERE floor_number = 0;

-- Remove constraint and column from rooms
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_room_capacity;
ALTER TABLE rooms DROP COLUMN IF EXISTS room_category;
