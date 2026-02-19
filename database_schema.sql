-- Database Schema for Fleet Management Application
-- Use this script to replicate the database structure in Supabase or any PostgreSQL instance.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Master Data Tables (Enumerations and Lookups)
-- These tables store dropdown values and configuration data.

CREATE TABLE material_types (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE operational_sites (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE carting_agents (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE loaders (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE royalty_names (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE tire_suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE tire_brands (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE coal_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    site_type TEXT CHECK (site_type IN ('LOADING', 'UNLOADING'))
);

CREATE TABLE fuel_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    location TEXT
);

CREATE TABLE system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- 2. Core Entity Tables

CREATE TABLE trucks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_number TEXT UNIQUE NOT NULL,
    transporter_name TEXT,
    model TEXT,
    wheel_config TEXT CHECK (wheel_config IN ('10 WHEEL', '12 WHEEL', '14 WHEEL', '16 WHEEL')),
    current_odometer NUMERIC DEFAULT 0,
    status TEXT CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'IDLE', 'BREAKDOWN')),
    remarks TEXT,
    fleet_type TEXT CHECK (fleet_type IN ('MINING', 'COAL')),
    
    -- Expiry Dates
    rc_expiry DATE,
    fitness_expiry DATE,
    insurance_expiry DATE,
    pucc_expiry DATE,
    tax_expiry DATE,
    permit_expiry DATE,
    
    -- JSONB for flexible storage
    documents JSONB DEFAULT '{}'::jsonb, -- Stores URLs to uploaded docs
    status_history JSONB DEFAULT '[]'::jsonb -- Stores array of status changes
);

CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    license_number TEXT,
    phone TEXT,
    status TEXT CHECK (status IN ('ON Duty', 'OFF Duty', 'Suspended')),
    driver_type TEXT CHECK (driver_type IN ('Permanent', 'Temporary'))
);

CREATE TABLE tire_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number TEXT UNIQUE NOT NULL,
    brand TEXT NOT NULL,
    size TEXT NOT NULL,
    mileage NUMERIC DEFAULT 0,
    expected_lifespan NUMERIC DEFAULT 50000,
    status TEXT CHECK (status IN ('NEW', 'MOUNTED', 'SPARE', 'SCRAPPED', 'REPAIR')),
    last_inspection_date DATE,
    scrapped_reason TEXT,
    
    -- Foreign Keys
    truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL, -- Null if Spare
    position TEXT, -- e.g., "L1", "R2"
    
    manufacturer TEXT,
    supplier TEXT,
    bill_number TEXT,
    mounted_at_odometer NUMERIC,
    
    history JSONB DEFAULT '[]'::jsonb -- Lifecycle history
);

-- 3. Operational Log Tables

CREATE TABLE fuel_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    attribution_date DATE, -- For "Previous Day" logic
    
    truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    station_id UUID REFERENCES fuel_stations(id) ON DELETE SET NULL,
    agent_id UUID, -- User ID of the fuel agent

    entry_type TEXT CHECK (entry_type IN ('PER_TRIP', 'FULL_TANK')),
    odometer NUMERIC NOT NULL,
    previous_odometer NUMERIC,
    fuel_liters NUMERIC NOT NULL,
    diesel_price NUMERIC DEFAULT 0,
    
    status TEXT CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    verification_photos JSONB DEFAULT '{}'::jsonb, -- URL to photos
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE coal_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    
    truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    
    pass_no TEXT,
    origin_site TEXT,
    destination_site TEXT,
    
    gross_weight NUMERIC,
    tare_weight NUMERIC,
    net_weight NUMERIC,
    
    diesel_liters NUMERIC,
    diesel_rate NUMERIC,
    
    -- Adjustments
    diesel_adjustment NUMERIC DEFAULT 0,
    air_adjustment NUMERIC DEFAULT 0,
    diesel_adj_type TEXT CHECK (diesel_adj_type IN ('STOCK', 'OTHER')),
    trip_adjustment NUMERIC DEFAULT 0, -- Manual trip count correction
    
    trip_remarks TEXT,
    diesel_remarks TEXT,
    air_remarks TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE mining_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    time TIME,
    type TEXT CHECK (type IN ('DISPATCH', 'PURCHASE')),
    
    chalan_no TEXT,
    customer_name TEXT,
    site TEXT,
    royalty_name TEXT,
    royalty_pass_no TEXT,
    
    truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    
    carting_agent TEXT,
    loader TEXT,
    material TEXT,
    
    gross NUMERIC,
    tare NUMERIC,
    -- Net is calculated in code or via generated column
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE daily_odo_registry (
    truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    opening_odometer NUMERIC,
    closing_odometer NUMERIC,
    PRIMARY KEY (truck_id, date)
);

CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, -- Suggest hashing this in production
    role TEXT CHECK (role IN ('ADMIN', 'FUEL_AGENT'))
);

-- 4. Common Analytical Queries
-- Useful queries for reporting and analysis.

-- A. Fuel Efficiency by Truck (Last 30 Days)
/*
SELECT 
    t.plate_number, 
    SUM((l.odometer - l.previous_odometer)) as distance,
    SUM(l.fuel_liters) as total_fuel,
    CASE WHEN SUM(l.fuel_liters) > 0 THEN 
        SUM((l.odometer - l.previous_odometer)) / SUM(l.fuel_liters) 
    ELSE 0 END as km_per_liter
FROM fuel_logs l
JOIN trucks t ON l.truck_id = t.id
WHERE l.date >= NOW() - INTERVAL '30 days'
GROUP BY t.plate_number;
*/

-- B. Coal Transport Summary (Per Trip)
/*
SELECT 
    t.plate_number,
    COUNT(c.id) as total_trips,
    SUM(c.net_weight) as total_tonnage,
    SUM(c.diesel_liters) as total_diesel_consumed
FROM coal_logs c
JOIN trucks t ON c.truck_id = t.id
GROUP BY t.plate_number;
*/

-- C. Tire Lifespan Analysis
/*
SELECT 
    brand,
    AVG(mileage) as avg_current_mileage,
    COUNT(*) as active_tires
FROM tire_inventory
WHERE status = 'MOUNTED'
GROUP BY brand;
*/
