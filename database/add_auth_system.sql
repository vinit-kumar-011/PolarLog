-- ============================================================
-- POLARLOG - Registration, roles and password reset
--
-- Adds to users:
--   email          - for password reset (UNIQUE; existing users stay NULL)
--   phone          - contact only, not used for OTP
--   status         - pending / active / rejected (default 'active')
--   requested_role - what the applicant ASKED for (advisory only)
--
-- Creates password_resets - one row per OTP issued.
--
-- SAFE TO RE-RUN: every step checks information_schema / uses
-- IF NOT EXISTS first, and nothing here touches existing rows'
-- status (so re-running never re-approves a pending/rejected user).
-- Existing users get status = 'active' automatically, because the
-- new column's DEFAULT is 'active'.
--
-- Run after schema.sql/seed.sql (and add_user_settings.sql).
-- Requires MySQL 5.7+ / 8.x.
-- ============================================================

USE polarlog;

-- ---------- new columns on users ----------
SET @ddl = (
  SELECT IF(COUNT(*) = 0,
            'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL UNIQUE',
            'SELECT ''users.email already exists'' AS note')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
            'ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL',
            'SELECT ''users.phone already exists'' AS note')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
            'ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''active''',
            'SELECT ''users.status already exists'' AS note')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
            'ALTER TABLE users ADD COLUMN requested_role VARCHAR(50) NULL',
            'SELECT ''users.requested_role already exists'' AS note')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'requested_role'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Belt and braces: anything that somehow has no status counts as approved.
UPDATE users SET status = 'active' WHERE status IS NULL OR status = '';

-- ---------- OTP storage ----------
CREATE TABLE IF NOT EXISTS password_resets (
    reset_id   INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    otp_hash   VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    used       TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_created (user_id, created_at)
);
