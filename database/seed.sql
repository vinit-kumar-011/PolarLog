-- ============================================================
-- POLARLOG - Sample Data
-- Run this AFTER schema.sql
--
-- This data deliberately stages the demo scenario from the
-- README: fuel running critically low at Himadri, an open
-- alert, and a resupply shipment already in transit.
-- ============================================================

USE polarlog;

-- ------------------------------------------------------------
-- STATIONS
-- ------------------------------------------------------------
INSERT INTO stations (name, code, region, latitude, longitude, capacity, status) VALUES
('Bharati', 'BHR', 'Antarctica',  -69.404722,  76.189722, 72, 'operational'),
('Maitri',  'MTR', 'Antarctica',  -70.766667,  11.733333, 65, 'operational'),
('Himadri', 'HMD', 'Arctic',       78.923611,  11.921389, 24, 'operational');

-- ------------------------------------------------------------
-- USERS
-- NOTE: these password_hash values are placeholders only.
-- Real hashes get generated in Python with werkzeug.
-- Never store a plain password here.
-- ------------------------------------------------------------
-- Demo passwords (same as username's station, for convenience):
--   admin        / admin2026
--   coord        / coord2026
--   bhr_office   / bharati2026
--   mtr_office   / maitri2026
--   hmd_office   / himadri2026
INSERT INTO users (username, password_hash, full_name, role, station_id) VALUES
('admin', 'scrypt:32768:8:1$qD0UzIG91lEYBoUD$96aa5eb908807c7d27cbe61b627781a879cebea63822b9e6b49d09134d9fe31ddf1a3434e2fe29e2e265fbd9ecf839cc3a220bec85b390e1e2d81e7b5947bee3', 'System Administrator', 'admin', NULL),
('coord', 'scrypt:32768:8:1$Xr3fQCoxVCaBXWpw$71f1658646fedb0034081d72b3749c269cb318a19f06465a36984a0fde4d2ba955603280d5ef239101327f3397d7b58b7c44a0badb68ecf15d286e1788bf5d5c', 'R. Nair', 'coordinator', NULL),
('bhr_office', 'scrypt:32768:8:1$mffBfWCHVtWxxLHT$cbadfdca0de60ebf397708b614464557bc8ed2c4b17f71753884989e51f0f7bb9b20b1e8bb77e92be30d8e41caec28f2f5b72d89f869738ea332425ac91f5bbd', 'S. Patnaik', 'station_officer', 1),
('mtr_office', 'scrypt:32768:8:1$clL6efQGO2OKriBh$bbe6bb9ba5f746ef9ba52e8d3485e1f9df72a4661ec3d9aa0ac940a34800a62f3cb3c4e3c47f13ad92bea91c4d6f6af50345c36860c0ca41fa0cc0eb6400ede5', 'A. Mishra', 'station_officer', 2),
('hmd_office', 'scrypt:32768:8:1$8PeYV2fvVXzAbj81$46ee6872c5fe126d2f61a72c470b7b8816dc62b37ca55b16a6e9a7941c9af76cc85466569e284c317b16aa59ed9220939ce1d98eb2c8c9f22be0b199724053d4', 'K. Verma', 'station_officer', 3);

-- ------------------------------------------------------------
-- EXPEDITIONS
-- ------------------------------------------------------------
INSERT INTO expeditions (name, season, station_id, depart_date, return_date, status) VALUES
('45th Indian Scientific Expedition to Antarctica', 'Summer 2026-27', 1, '2026-11-15', '2027-03-20', 'active'),
('45th Indian Scientific Expedition to Antarctica', 'Summer 2026-27', 2, '2026-11-15', '2027-03-20', 'active'),
('Indian Arctic Expedition 2026',                   'Arctic 2026',    3, '2026-06-01', '2026-09-30', 'active');

-- ------------------------------------------------------------
-- PERSONNEL
-- ------------------------------------------------------------
INSERT INTO personnel (name, role, station_id, expedition_id, contact, status) VALUES
('S. Patnaik',  'Station Leader',      1, 1, 'bhr-01', 'deployed'),
('D. Sahoo',    'Glaciologist',        1, 1, 'bhr-02', 'deployed'),
('M. Rout',     'Communications',      1, 1, 'bhr-03', 'deployed'),
('A. Mishra',   'Station Leader',      2, 2, 'mtr-01', 'deployed'),
('P. Behera',   'Logistics Officer',   2, 2, 'mtr-02', 'deployed'),
('T. Jena',     'Medical Officer',     2, 2, 'mtr-03', 'deployed'),
('K. Verma',    'Station Leader',      3, 3, 'hmd-01', 'deployed'),
('R. Das',      'Atmospheric Science', 3, 3, 'hmd-02', 'deployed');

-- ------------------------------------------------------------
-- INVENTORY
-- Himadri fuel is deliberately critical - this drives the demo
-- ------------------------------------------------------------
INSERT INTO inventory (name, category, station_id, quantity, unit, reorder_level, last_updated, status) VALUES
-- Bharati (healthy)
('Diesel',              'fuel',      1, 4200, 'litres', 1200, '2026-08-25', 'ok'),
('Dry rations',         'food',      1,  860, 'packs',   300, '2026-08-25', 'ok'),
('Medical kits',        'medical',   1,   34, 'units',    12, '2026-08-20', 'ok'),
('Generator spares',    'equipment', 1,   18, 'units',     6, '2026-08-18', 'ok'),

-- Maitri (one item low)
('Diesel',              'fuel',      2, 3100, 'litres', 1200, '2026-08-26', 'ok'),
('Dry rations',         'food',      2,  640, 'packs',   300, '2026-08-26', 'ok'),
('Medical kits',        'medical',   2,    9, 'units',    12, '2026-08-22', 'low'),
('Snow vehicle spares', 'equipment', 2,   14, 'units',     6, '2026-08-19', 'ok'),

-- Himadri (fuel critical - the demo scenario)
('Diesel',              'fuel',      3,  340, 'litres',  900, '2026-08-28', 'critical'),
('Aviation fuel',       'fuel',      3,   80, 'litres',  250, '2026-08-28', 'critical'),
('Dry rations',         'food',      3,  210, 'packs',   150, '2026-08-27', 'ok'),
('Medical kits',        'medical',   3,    7, 'units',    10, '2026-08-24', 'low'),
('Weather mast parts',  'equipment', 3,    4, 'units',     2, '2026-08-15', 'ok');

-- ------------------------------------------------------------
-- SHIPMENTS
-- ------------------------------------------------------------
INSERT INTO shipments (reference, origin, destination_id, expedition_id, dispatch_date, eta, status) VALUES
('SHP-2026-001', 'Goa, India',      1, 1, '2026-08-10', '2026-09-12', 'in_transit'),
('SHP-2026-002', 'Cape Town',       2, 2, '2026-08-14', '2026-09-05', 'in_transit'),
('SHP-2026-003', 'Tromso, Norway',  3, 3, '2026-08-29', '2026-09-08', 'in_transit'),
('SHP-2026-004', 'Goa, India',      1, 1, '2026-07-02', '2026-08-01', 'delivered'),
('SHP-2026-005', 'Tromso, Norway',  3, 3, NULL,         '2026-09-25', 'pending');

-- ------------------------------------------------------------
-- CARGO
-- ------------------------------------------------------------
INSERT INTO cargo (shipment_id, item_name, category, quantity, unit, weight_kg, priority, status) VALUES
(1, 'Diesel drums',        'fuel',      220, 'drums',  44000.00, 'high',     'in_transit'),
(1, 'Dry rations',         'food',      400, 'packs',   6800.00, 'normal',   'in_transit'),
(2, 'Medical kits',        'medical',    30, 'units',    420.00, 'high',     'in_transit'),
(2, 'Snow vehicle spares', 'equipment',  12, 'units',    960.00, 'normal',   'in_transit'),
(3, 'Diesel drums',        'fuel',       60, 'drums',  12000.00, 'critical', 'in_transit'),
(3, 'Aviation fuel',       'fuel',       20, 'drums',   4000.00, 'critical', 'in_transit'),
(4, 'Generator spares',    'equipment',  10, 'units',    780.00, 'normal',   'delivered'),
(5, 'Medical kits',        'medical',    15, 'units',    210.00, 'high',     'pending');

-- ------------------------------------------------------------
-- ALERTS
-- ------------------------------------------------------------
INSERT INTO alerts (alert_type, severity, station_id, item_id, shipment_id, message, status) VALUES
('critical_stock',    'critical', 3, 9,  NULL, 'Diesel at Himadri below critical threshold (340 of 900 litres)',   'open'),
('critical_stock',    'critical', 3, 10, NULL, 'Aviation fuel at Himadri below critical threshold (80 of 250 L)',  'open'),
('low_stock',         'warning',  3, 12, NULL, 'Medical kits at Himadri below reorder level',                      'open'),
('low_stock',         'warning',  2, 7,  NULL, 'Medical kits at Maitri below reorder level',                       'acknowledged'),
('resupply_required', 'critical', 3, 9,  3,    'Emergency fuel resupply dispatched to Himadri',                    'acknowledged');
