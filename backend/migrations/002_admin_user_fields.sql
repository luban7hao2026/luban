ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user',
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN last_login_at DATETIME NULL;

UPDATE users
SET role = 'user'
WHERE role IS NULL OR role = '';
