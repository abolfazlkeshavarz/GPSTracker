-- Create database
CREATE DATABASE tracking_db;
-- Connect to database
\c tracking_db;

-- Create tables
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE devices (
    serial VARCHAR(50) PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE location_history (
    id BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,

    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,

    speed INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    csq INTEGER DEFAULT 0,

    battery DOUBLE PRECISION DEFAULT 0,

    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_location_device_time
ON location_history(device_serial, recorded_at DESC);


