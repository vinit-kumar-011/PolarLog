-- ============================================================
-- POLARLOG - Migration: user_settings
-- Stores per-user preferences for the Settings page
-- (currently: notification preferences).
--
-- Run this ONCE against your existing database, after
-- schema.sql/seed.sql have already been applied.
-- ============================================================

USE polarlog;

CREATE TABLE IF NOT EXISTS user_settings (
    user_id       INT PRIMARY KEY,
    notifications TEXT,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
-- notifications holds a JSON object, e.g.
-- {"critical_alerts": true, "shipment_updates": true, ...}
-- A missing row means "all defaults" (see routes/settings.py).
