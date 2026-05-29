-- Create database
CREATE DATABASE tracking_db;
\c tracking_db;

-- Create users table (with role)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'admin' or 'user'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create devices table (with secret and pre-activation status)
CREATE TABLE devices (
    serial VARCHAR(50) PRIMARY KEY,
    device_secret TEXT NOT NULL, -- Added secret field
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT FALSE, -- Can be pre-registered but not active
    activated_at TIMESTAMP WITH TIME ZONE,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit logs table
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'CREATE_DEVICE', 'ACTIVATE_DEVICE', 'DELETE_DEVICE', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'device', 'user'
    entity_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create location_history table
CREATE TABLE location_history (
    id BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    battery DOUBLE PRECISION DEFAULT 0,
    csq INTEGER DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_serial_active ON devices(serial, is_active);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_location_history_device_time ON location_history(device_serial, recorded_at DESC);

-- Insert default admin (password: admin123 - you should change this)
-- Password hash for 'admin123'
INSERT INTO users (phone, password_hash, role) 
VALUES ('admin', '$2a$10$rQKZ5xqWyQxWYqUxYqUxYuYxYxYxYxYxYxYxYxYxYxYxYxYxYxYxY', 'admin');