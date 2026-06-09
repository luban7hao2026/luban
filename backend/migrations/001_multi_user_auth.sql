-- Run this once before starting the new auth-enabled backend against old data.
-- Existing foods become the default template copied into each new real user.

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO users (id, username, password_hash)
VALUES (1, 'default-template', 'disabled');

SET @default_user_id = 1;

ALTER TABLE foods
  ADD COLUMN user_id INT NULL;

ALTER TABLE pick_logs
  ADD COLUMN user_id INT NULL;

UPDATE foods
SET user_id = @default_user_id
WHERE user_id IS NULL;

UPDATE pick_logs pl
JOIN foods f ON pl.food_id = f.id
SET pl.user_id = f.user_id
WHERE pl.user_id IS NULL;

UPDATE pick_logs
SET user_id = @default_user_id
WHERE user_id IS NULL;

ALTER TABLE foods
  MODIFY COLUMN user_id INT NOT NULL;

ALTER TABLE pick_logs
  MODIFY COLUMN user_id INT NOT NULL;

ALTER TABLE foods
  ADD INDEX ix_foods_user_id (user_id),
  ADD CONSTRAINT fk_foods_user
    FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE pick_logs
  ADD INDEX ix_pick_logs_user_id (user_id),
  ADD CONSTRAINT fk_pick_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id);
