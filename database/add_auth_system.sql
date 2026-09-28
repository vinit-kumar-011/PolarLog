-- ============================================================
-- POLARLOG - Registration, roles and password reset
--
-- Adds to users:
--   email          - for login identity and password reset
--   phone          - contact only, not used for OTP
--   status         - pending / active / rejected
--   requested_role - what the applicant ASKED for (advisory)
--
-- Creates password_resets - one row per OTP issued.
--
-- Run once.
-- ============================================================

USE polarlog;

-- ---------- new columns on users ----------
ALTER TABLE users ADD COLUMN email          VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN phone          VARCHAR(20);
ALTER TABLE users ADD COLUMN status         VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN requested_role VARCHAR(50);

-- Everyone who already exists was created by hand - they're approved
UPDATE users SET status = 'active';

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