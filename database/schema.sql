-- ============================================================
-- POLARLOG - Database Schema
-- Team ByteBenders | SIH26062
-- Covers all modules described in README.md
-- Run this file first, then seed.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS polarlog;
USE polarlog;

-- ------------------------------------------------------------
-- 1. STATIONS - Bharati, Maitri, Himadri
-- ------------------------------------------------------------
CREATE TABLE stations (
    station_id  INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    code        VARCHAR(10),
    region      VARCHAR(30),
    latitude    DOUBLE,
    longitude   DOUBLE,
    capacity    INT,
    status      VARCHAR(20)  DEFAULT 'operational'
);

-- ------------------------------------------------------------
-- 2. USERS - authentication and role-based access
-- ------------------------------------------------------------
CREATE TABLE users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100),
    role          VARCHAR(30)  NOT NULL DEFAULT 'field_staff',
    station_id    INT,
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
);
-- role values: admin | coordinator | station_officer | field_staff

-- ------------------------------------------------------------
-- 3. EXPEDITIONS - the annual mission each station runs
-- ------------------------------------------------------------
CREATE TABLE expeditions (
    expedition_id INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    season        VARCHAR(30),
    station_id    INT,
    depart_date   DATE,
    return_date   DATE,
    status        VARCHAR(20)  DEFAULT 'planned',
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
);
-- status values: planned | active | completed

-- ------------------------------------------------------------
-- 4. PERSONNEL - who is deployed where
-- ------------------------------------------------------------
CREATE TABLE personnel (
    person_id     INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    role          VARCHAR(50),
    station_id    INT,
    expedition_id INT,
    contact       VARCHAR(50),
    status        VARCHAR(20)  DEFAULT 'deployed',
    FOREIGN KEY (station_id)    REFERENCES stations(station_id),
    FOREIGN KEY (expedition_id) REFERENCES expeditions(expedition_id)
);

-- ------------------------------------------------------------
-- 5. INVENTORY - what is currently AT a station
-- ------------------------------------------------------------
CREATE TABLE inventory (
    item_id       INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    category      VARCHAR(50),
    station_id    INT,
    quantity      INT          DEFAULT 0,
    unit          VARCHAR(20),
    reorder_level INT          DEFAULT 0,
    last_updated  DATE,
    status        VARCHAR(20)  DEFAULT 'ok',
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
);
-- category values: food | fuel | medical | equipment | other
-- status values:   ok | low | critical

-- ------------------------------------------------------------
-- 6. SHIPMENTS - a consignment moving toward a station
-- ------------------------------------------------------------
CREATE TABLE shipments (
    shipment_id    INT AUTO_INCREMENT PRIMARY KEY,
    reference      VARCHAR(30)  NOT NULL,
    origin         VARCHAR(100),
    destination_id INT,
    expedition_id  INT,
    dispatch_date  DATE,
    eta            DATE,
    status         VARCHAR(20)  DEFAULT 'pending',
    FOREIGN KEY (destination_id) REFERENCES stations(station_id),
    FOREIGN KEY (expedition_id)  REFERENCES expeditions(expedition_id)
);
-- status values: pending | in_transit | delivered

-- ------------------------------------------------------------
-- 7. CARGO - the individual items inside a shipment
-- ------------------------------------------------------------
CREATE TABLE cargo (
    cargo_id    INT AUTO_INCREMENT PRIMARY KEY,
    shipment_id INT,
    item_name   VARCHAR(100) NOT NULL,
    category    VARCHAR(50),
    quantity    INT,
    unit        VARCHAR(20),
    weight_kg   DOUBLE,
    priority    VARCHAR(20)  DEFAULT 'normal',
    status      VARCHAR(20)  DEFAULT 'pending',
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id)
);
-- priority values: low | normal | high | critical

-- ------------------------------------------------------------
-- 8. ALERTS - generated when something needs attention
-- ------------------------------------------------------------
CREATE TABLE alerts (
    alert_id    INT AUTO_INCREMENT PRIMARY KEY,
    alert_type  VARCHAR(30),
    severity    VARCHAR(20)  DEFAULT 'warning',
    station_id  INT,
    item_id     INT,
    shipment_id INT,
    message     VARCHAR(255),
    status      VARCHAR(20)  DEFAULT 'open',
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id)  REFERENCES stations(station_id),
    FOREIGN KEY (item_id)     REFERENCES inventory(item_id),
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id)
);
-- alert_type values: low_stock | critical_stock | shipment_delay | resupply_required
-- severity values:   info | warning | critical
-- status values:     open | acknowledged | resolved
