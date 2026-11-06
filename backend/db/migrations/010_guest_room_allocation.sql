-- Migration 010: Guest Room Allocation (Zero Fee)
-- Master table for guest rooms and allocation records

CREATE TABLE IF NOT EXISTS guest_rooms (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  room_number VARCHAR(20) NOT NULL,
  hostel_id SMALLINT(5) UNSIGNED NULL DEFAULT NULL,
  block_name VARCHAR(50) NOT NULL DEFAULT 'Guest Block',
  floor_number INT(11) NOT NULL DEFAULT 1,
  room_type ENUM('single', 'double', 'suite', 'dormitory') NOT NULL DEFAULT 'double',
  is_ac TINYINT(1) NOT NULL DEFAULT 1,
  capacity INT(11) NOT NULL DEFAULT 2,
  amenities VARCHAR(255) NULL DEFAULT 'Attached Bath, WiFi, TV, Kettle',
  status ENUM('available', 'occupied', 'maintenance', 'blocked') NOT NULL DEFAULT 'available',
  remarks VARCHAR(255) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_guest_room (room_number, block_name),
  KEY idx_gr_hostel (hostel_id),
  CONSTRAINT fk_gr_hostel FOREIGN KEY (hostel_id) REFERENCES hostels (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guest_allocations (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_code VARCHAR(30) NOT NULL UNIQUE,
  guest_room_id INT(10) UNSIGNED NOT NULL,
  guest_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(120) NULL DEFAULT NULL,
  id_proof_type ENUM('aadhaar', 'driving_license', 'voter_id', 'passport', 'pan', 'other') NOT NULL DEFAULT 'aadhaar',
  id_proof_number VARCHAR(50) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  related_student_id INT(10) UNSIGNED NULL DEFAULT NULL,
  relationship_to_student VARCHAR(50) NULL DEFAULT NULL,
  number_of_guests INT(11) NOT NULL DEFAULT 1,
  check_in_at DATETIME NOT NULL,
  expected_check_out_at DATETIME NOT NULL,
  actual_check_out_at DATETIME NULL DEFAULT NULL,
  status ENUM('active', 'checked_out', 'cancelled') NOT NULL DEFAULT 'active',
  remarks VARCHAR(500) NULL DEFAULT NULL,
  allocated_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ga_room (guest_room_id),
  KEY idx_ga_student (related_student_id),
  KEY idx_ga_status (status),
  CONSTRAINT fk_ga_room FOREIGN KEY (guest_room_id) REFERENCES guest_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_ga_student FOREIGN KEY (related_student_id) REFERENCES students (id) ON DELETE SET NULL,
  CONSTRAINT fk_ga_allocated_by FOREIGN KEY (allocated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO guest_rooms (room_number, hostel_id, block_name, floor_number, room_type, is_ac, capacity, amenities, status, remarks)
VALUES
  ('G-101', 1, 'Block A', 1, 'double', 1, 2, 'AC, Attached Bath, WiFi, Desk, TV, Electric Kettle', 'available', 'Premium AC Guest Room Ground Floor'),
  ('G-102', 1, 'Block A', 1, 'double', 1, 2, 'AC, Attached Bath, WiFi, Desk, TV', 'available', 'Guest Room Block A Ground Floor'),
  ('G-201', 2, 'Block B', 2, 'double', 0, 2, 'Fan, Attached Bath, WiFi, Study Table', 'available', 'Standard Non-AC Guest Room Block B'),
  ('VIP-1', 1, 'Admin Guest Wing', 1, 'suite', 1, 2, 'Executive Lounge, AC, King Bed, Attached Bath, Mini Fridge, WiFi, TV', 'available', 'VIP Executive Suite for Visiting Dignitaries & Trustees')
ON DUPLICATE KEY UPDATE remarks = VALUES(remarks);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('guest_room_fee_policy', 'zero_fee', 'Guest room allocation fee policy: strictly zero_fee, no ledger/fee entries')
ON DUPLICATE KEY UPDATE description = VALUES(description);
