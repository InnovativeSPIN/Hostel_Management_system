-- Migration 005: Student Dashboard Additions
-- Tables: mess_menu_weekly, mess_menu_overrides
-- Column updates: leave_requests (on_duty), visitor_entries (visit_date, from_time, to_time, approval_status, rejection_remarks, overstay_flagged)

CREATE TABLE IF NOT EXISTS mess_menu_weekly (
  id INT(11) NOT NULL AUTO_INCREMENT,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  meal_type ENUM('Breakfast','Lunch','Snacks','Dinner') NOT NULL,
  items TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_day_meal (day_of_week, meal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mess_menu_overrides (
  id INT(11) NOT NULL AUTO_INCREMENT,
  override_date DATE NOT NULL,
  meal_type ENUM('Breakfast','Lunch','Snacks','Dinner') NOT NULL,
  items TEXT NOT NULL,
  reason VARCHAR(255) NULL DEFAULT NULL,
  created_by INT(10) UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_date_meal (override_date, meal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default weekly menu (NSCET Hostel Master Menu)
INSERT INTO mess_menu_weekly (day_of_week, meal_type, items) VALUES
('Monday', 'Breakfast', 'Idli (3 pcs), Medu Vada (1 pc), Sambar, Coconut Chutney, Tea / Coffee'),
('Monday', 'Lunch', 'Steamed Rice, Drumstick Sambar, Tomato Rasam, Cabbage Poriyal, Appalam, Curd'),
('Monday', 'Snacks', 'Sundal / Samosa, Tea / Coffee'),
('Monday', 'Dinner', 'Chapati (3 pcs), Vegetable Kurma, Steamed Rice, Pepper Rasam, Buttermilk'),

('Tuesday', 'Breakfast', 'Ven Pongal, Getti Chutney, Sambar, Medu Vada (1 pc), Tea / Coffee'),
('Tuesday', 'Lunch', 'Steamed Rice, Mor Kuzhambu, Beetroot Poriyal, Rasam, Appalam, Pickle'),
('Tuesday', 'Snacks', 'Veg Puff / Bajji, Tea / Coffee'),
('Tuesday', 'Dinner', 'Kal Dosa (3 pcs), Tomato Chutney, Sambar, Hot Milk'),

('Wednesday', 'Breakfast', 'Rava Kichadi, Coconut Chutney, Sambar, Boiled Egg / Banana, Tea / Coffee'),
('Wednesday', 'Lunch', 'Steamed Rice, Chettinad Veg Curry, Potato Fry, Rasam, Curd, Appalam'),
('Wednesday', 'Snacks', 'Paniaram / Sweet Boli, Tea / Coffee'),
('Wednesday', 'Dinner', 'Parotta (2 pcs), Paneer Butter Masala / Veg Salna, Steamed Rice, Rasam'),

('Thursday', 'Breakfast', 'Poori (3 pcs), Potato Masala, Coconut Chutney, Tea / Coffee'),
('Thursday', 'Lunch', 'Steamed Rice, Kathirikai Kara Kuzhambu, Kootu, Tomato Rasam, Curd, Appalam'),
('Thursday', 'Snacks', 'Onion Pakoda, Tea / Coffee'),
('Thursday', 'Dinner', 'Idiyappam (4 pcs), Coconut Milk / Veg Kurma, Steamed Rice, Rasam'),

('Friday', 'Breakfast', 'Ghee Roast / Podi Dosa, Sambar, Chutney Trio, Tea / Coffee'),
('Friday', 'Lunch', 'Steamed Rice, Keerai Paruppu Kuzhambu, Urulai Roast, Mysore Rasam, Curd, Payasam'),
('Friday', 'Snacks', 'Sweet Corn / Vada, Tea / Coffee'),
('Friday', 'Dinner', 'Chapati (3 pcs), Dal Tadka, Jeera Rice, Curd Rice, Pickle'),

('Saturday', 'Breakfast', 'Semiya Upma, Coconut Chutney, Sambar, Vada, Tea / Coffee'),
('Saturday', 'Lunch', 'Variety Rice (Lemon Rice / Tomato Rice), Curd Rice, Potato Chips, Pickle'),
('Saturday', 'Snacks', 'Biscuits, Tea / Coffee'),
('Saturday', 'Dinner', 'Poori (3 pcs), Chana Masala, Steamed Rice, Rasam, Hot Milk'),

('Sunday', 'Breakfast', 'Masala Dosa, Sambar, Mint Chutney, Tea / Coffee'),
('Sunday', 'Lunch', 'NSCET Special Veg / Chicken Biryani, Onion Raita, Brinjal Curry, Boiled Egg, Sweet Kesari'),
('Sunday', 'Snacks', 'Cake / Veg Roll, Tea / Coffee'),
('Sunday', 'Dinner', 'Chapati (3 pcs), Paneer Masala, Fried Rice, Tomato Sauce, Hot Milk')
ON DUPLICATE KEY UPDATE items = VALUES(items);

-- Add On Duty (on_duty) to leave_requests
ALTER TABLE leave_requests
  MODIFY COLUMN leave_type ENUM('home','medical','personal','academic','emergency','on_duty') NOT NULL;

-- Add time-based visitor fields to visitor_entries
ALTER TABLE visitor_entries
  ADD COLUMN visit_date DATE NULL DEFAULT NULL AFTER expected_at,
  ADD COLUMN from_time TIME NULL DEFAULT NULL AFTER visit_date,
  ADD COLUMN to_time TIME NULL DEFAULT NULL AFTER from_time,
  ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER status,
  ADD COLUMN rejection_remarks VARCHAR(255) NULL DEFAULT NULL AFTER remarks,
  ADD COLUMN overstay_flagged TINYINT(1) NOT NULL DEFAULT 0 AFTER inside_visitor_id;

-- Add feature flag for dashboard v2
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('feature_student_dashboard_v2', 'true', 'Enable Student Dashboard Additions: Today Mess Menu, Leave/OD, Time-based Visitors')
ON DUPLICATE KEY UPDATE description = VALUES(description);
