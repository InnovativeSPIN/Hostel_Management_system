-- Migration 003: Blocks, Room Categories and Fee Structure V2
-- Additive only, non-breaking with existing data

-- 1. Ensure room_category column in rooms table
SET @colExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms' AND COLUMN_NAME = 'room_category'
);
SET @sql := IF(@colExists = 0, 
  'ALTER TABLE rooms ADD COLUMN room_category VARCHAR(60) NOT NULL DEFAULT \'Normal Room\' AFTER room_type', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Note: constraint `chk_room_occupancy` already enforces (`current_occupancy` <= `capacity`) in rooms table.

-- 3. Set room categories on existing rooms based on features
UPDATE rooms SET room_category = 'AC Room' WHERE is_ac = 1;
UPDATE rooms SET room_category = 'Attached Toilet' WHERE attached_bath = 1 AND is_ac = 0;
UPDATE rooms SET room_category = 'Normal Room' WHERE is_ac = 0 AND attached_bath = 0;

-- 4. Ensure Ground Floor exists for Block-A (Hostel 1) and Block-B (Hostel 2)
INSERT INTO floors (hostel_id, floor_number, label)
SELECT 1, 0, 'Ground Floor'
WHERE NOT EXISTS (SELECT 1 FROM floors WHERE hostel_id = 1 AND floor_number = 0);

INSERT INTO floors (hostel_id, floor_number, label)
SELECT 2, 0, 'Ground Floor'
WHERE NOT EXISTS (SELECT 1 FROM floors WHERE hostel_id = 2 AND floor_number = 0);

-- 5. NSCET Block-A (Ground Floor, rooms 1-9):
-- 4 AC rooms (rooms 1-4, 3 members each) + 5 attached-toilet rooms (rooms 5-9, 3 members each)
SET @floorA := (SELECT id FROM floors WHERE hostel_id = 1 AND floor_number = 0 LIMIT 1);

-- Room 1 (AC, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '1', 'triple', 'AC Room', 3, 0, 1, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '1');

-- Room 2 (AC, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '2', 'triple', 'AC Room', 3, 0, 1, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '2');

-- Room 3 (AC, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '3', 'triple', 'AC Room', 3, 0, 1, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '3');

-- Room 4 (AC, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '4', 'triple', 'AC Room', 3, 0, 1, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '4');

-- Room 5 (Attached Toilet, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '5', 'triple', 'Attached Toilet', 3, 0, 0, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '5');

-- Room 6 (Attached Toilet, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '6', 'triple', 'Attached Toilet', 3, 0, 0, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '6');

-- Room 7 (Attached Toilet, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '7', 'triple', 'Attached Toilet', 3, 0, 0, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '7');

-- Room 8 (Attached Toilet, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '8', 'triple', 'Attached Toilet', 3, 0, 0, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '8');

-- Room 9 (Attached Toilet, 3 members)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 1, @floorA, '9', 'triple', 'Attached Toilet', 3, 0, 0, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE hostel_id = 1 AND floor_id = @floorA AND room_number = '9');

-- Add beds for Block-A Rooms 1-9 (3 beds each)
INSERT INTO beds (room_id, bed_number, bed_code, status)
SELECT r.id, b.n, CONCAT('A-', r.room_number, '-', b.n), 'available'
FROM rooms r
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) b
WHERE r.hostel_id = 1 AND r.floor_id = @floorA AND r.room_number IN ('1','2','3','4','5','6','7','8','9')
  AND NOT EXISTS (
    SELECT 1 FROM beds e WHERE e.room_id = r.id AND e.bed_number = b.n
  );

-- 6. NSCET Block-B (rooms 1-9): normal rooms, 4 sharing
SET @floorB := (SELECT id FROM floors WHERE hostel_id = 2 AND floor_number = 0 LIMIT 1);

-- Rooms 1 to 9 (Normal Room, 4 sharing)
INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, room_category, capacity, current_occupancy, is_ac, attached_bath, status)
SELECT 2, @floorB, r_num, 'quad', 'Normal Room', 4, 0, 0, 0, 'active'
FROM (
  SELECT '1' AS r_num UNION ALL SELECT '2' UNION ALL SELECT '3' UNION ALL SELECT '4' UNION ALL 
  SELECT '5' UNION ALL SELECT '6' UNION ALL SELECT '7' UNION ALL SELECT '8' UNION ALL SELECT '9'
) nums
WHERE NOT EXISTS (
  SELECT 1 FROM rooms WHERE hostel_id = 2 AND floor_id = @floorB AND room_number = nums.r_num
);

-- Add beds for Block-B Rooms 1-9 (4 beds each)
INSERT INTO beds (room_id, bed_number, bed_code, status)
SELECT r.id, b.n, CONCAT('B-', r.room_number, '-', b.n), 'available'
FROM rooms r
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) b
WHERE r.hostel_id = 2 AND r.floor_id = @floorB AND r.room_number IN ('1','2','3','4','5','6','7','8','9')
  AND NOT EXISTS (
    SELECT 1 FROM beds e WHERE e.room_id = r.id AND e.bed_number = b.n
  );

-- 7. NEW fee structure tables: fee_structures_v2
CREATE TABLE IF NOT EXISTS fee_structures_v2 (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  student_type ENUM('NSCET', 'NS-CBSE') NOT NULL DEFAULT 'NSCET',
  room_category VARCHAR(60) NOT NULL,
  academic_year VARCHAR(9) NOT NULL,
  admission_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  caution_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  room_rent DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  mess_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  per_day_mess_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  other_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  due_date DATE DEFAULT NULL,
  status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
  remarks VARCHAR(255) DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_fee_v2_lookup (student_type, room_category, academic_year),
  CONSTRAINT fk_fee_v2_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Seed admin-editable fee structures for 2026-27 (no hard-coded values in code)
INSERT INTO fee_structures_v2 (name, student_type, room_category, academic_year, admission_fee, caution_deposit, room_rent, mess_charges, per_day_mess_rate, other_charges, total_amount, due_date, status, created_by)
VALUES
('NSCET - AC Room (2026-27)', 'NSCET', 'AC Room', '2026-27', 5000.00, 5000.00, 25000.00, 30000.00, 150.00, 2000.00, 67000.00, '2026-08-31', 'active', 1),
('NSCET - Attached Toilet (2026-27)', 'NSCET', 'Attached Toilet', '2026-27', 5000.00, 5000.00, 18000.00, 30000.00, 150.00, 2000.00, 60000.00, '2026-08-31', 'active', 1),
('NSCET - Normal Room (2026-27)', 'NSCET', 'Normal Room', '2026-27', 5000.00, 5000.00, 12000.00, 30000.00, 150.00, 2000.00, 54000.00, '2026-08-31', 'active', 1),
('NS-CBSE - Attached Toilet (2026-27)', 'NS-CBSE', 'Attached Toilet', '2026-27', 3000.00, 5000.00, 15000.00, 25000.00, 130.00, 2000.00, 50000.00, '2026-08-31', 'active', 1),
('NS-CBSE - Normal Room (2026-27)', 'NS-CBSE', 'Normal Room', '2026-27', 3000.00, 5000.00, 10000.00, 25000.00, 130.00, 2000.00, 45000.00, '2026-08-31', 'active', 1);
