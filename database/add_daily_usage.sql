-- ============================================================
-- POLARLOG - Migration: inventory.daily_usage
-- Adds a consumption-rate column so "days remaining" can be
-- computed as quantity / daily_usage, and links inbound
-- shipments to inventory for the resupply-status view.
--
-- Run this ONCE against your existing database, after
-- schema.sql/seed.sql have already been applied.
-- ============================================================

USE polarlog;

ALTER TABLE inventory
  ADD COLUMN daily_usage DOUBLE DEFAULT 0 AFTER reorder_level;

SET SQL_SAFE_UPDATES = 0;

-- ------------------------------------------------------------
-- Seed realistic consumption rates for the demo data from
-- seed.sql. Numbers are rough but plausible for a small polar
-- station; the goal is a believable "days remaining" figure,
-- not a precise logistics model.
--
-- Himadri's Diesel/Aviation fuel rates are set so they land
-- around ~5 days remaining, matching the deliberate "fuel
-- running critical" demo scenario already staged in seed.sql.
-- ------------------------------------------------------------

-- Bharati (station_id = 1)
UPDATE inventory SET daily_usage = 45   WHERE station_id = 1 AND name = 'Diesel';
UPDATE inventory SET daily_usage = 8    WHERE station_id = 1 AND name = 'Dry rations';
UPDATE inventory SET daily_usage = 0.15 WHERE station_id = 1 AND name = 'Medical kits';
UPDATE inventory SET daily_usage = 0.05 WHERE station_id = 1 AND name = 'Generator spares';

-- Maitri (station_id = 2)
UPDATE inventory SET daily_usage = 35   WHERE station_id = 2 AND name = 'Diesel';
UPDATE inventory SET daily_usage = 6    WHERE station_id = 2 AND name = 'Dry rations';
UPDATE inventory SET daily_usage = 0.2  WHERE station_id = 2 AND name = 'Medical kits';
UPDATE inventory SET daily_usage = 0.05 WHERE station_id = 2 AND name = 'Snow vehicle spares';

-- Himadri (station_id = 3) - the critical-fuel demo scenario
UPDATE inventory SET daily_usage = 65   WHERE station_id = 3 AND name = 'Diesel';
UPDATE inventory SET daily_usage = 15   WHERE station_id = 3 AND name = 'Aviation fuel';
UPDATE inventory SET daily_usage = 5    WHERE station_id = 3 AND name = 'Dry rations';
UPDATE inventory SET daily_usage = 0.15 WHERE station_id = 3 AND name = 'Medical kits';
UPDATE inventory SET daily_usage = 0.02 WHERE station_id = 3 AND name = 'Weather mast parts';

SET SQL_SAFE_UPDATES = 1;

-- Sanity check - every row should now show a computed days-remaining.
-- Rows with daily_usage = 0 (anything added later without a rate set)
-- will show NULL, which the frontend treats as "no usage data".
SELECT name, station_id, quantity, daily_usage,
       ROUND(quantity / NULLIF(daily_usage, 0), 1) AS days_remaining
FROM inventory
ORDER BY days_remaining IS NULL, days_remaining ASC;
