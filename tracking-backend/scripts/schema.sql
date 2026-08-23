-- GPSTracker schema.
--
-- Idempotent: safe to run against a fresh or an existing database. This must
-- stay in sync with createTables() in internal/db/postgres.go, which applies
-- the same statements at server startup.
--
-- Connect to the target database first; this file does not CREATE DATABASE
-- (see `make db-create`, which does).

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    phone         VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Only 'admin' and 'user' are meaningful; AdminMiddleware compares against
-- the literal 'admin'.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));

-- -------------------------------------------------------------- devices
CREATE TABLE IF NOT EXISTS devices (
    serial           VARCHAR(50) PRIMARY KEY,
    device_secret    TEXT NOT NULL,
    -- SET NULL, not CASCADE: deleting a user must not destroy the device row
    -- (and with it, via the location_history FK, all of its history).
    user_id          INT REFERENCES users(id) ON DELETE SET NULL,
    is_active        BOOLEAN NOT NULL DEFAULT FALSE,
    activated_at     TIMESTAMP WITH TIME ZONE,
    created_by       INT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ---------------------------------------------------------- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   VARCHAR(100),
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------- location_history
CREATE TABLE IF NOT EXISTS location_history (
    id            BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL,
    speed         INTEGER DEFAULT 0,
    satellites    INTEGER DEFAULT 0,
    battery       DOUBLE PRECISION DEFAULT 0,
    csq           INTEGER DEFAULT 0,
    ignition      BOOLEAN,
    -- Reported by the firmware but previously dropped; see DEVELOPMENT.md.
    heading       DOUBLE PRECISION,   -- course over ground, 0-360 degrees
    altitude      DOUBLE PRECISION,   -- metres above sea level
    hdop          DOUBLE PRECISION,   -- horizontal dilution of precision
    operator      TEXT,               -- GSM network operator name
    fix_age_ms    INTEGER,            -- age of the GPS fix when published
    recorded_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE location_history ADD COLUMN IF NOT EXISTS battery DOUBLE PRECISION DEFAULT 0;
-- The firmware reports ignition, but it was previously dropped on the floor:
-- it only ever reached Redis, so it vanished on cache expiry or restart.
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS ignition BOOLEAN;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS hdop DOUBLE PRECISION;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS fix_age_ms INTEGER;

-- --------------------------------------------- gap-free tracking (backfill)
-- recorded_at is now WHEN THE FIX HAPPENED (device GPS clock). received_at is
-- when the server got it. They differ whenever a device buffers points through
-- a coverage gap and replays them later.
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS is_backfill BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing databases may already hold duplicate (device_serial, recorded_at)
-- rows from before recorded_at meant anything; the unique index below would
-- fail on them. Keep the earliest row of each pair. No-op once clean.
DELETE FROM location_history a
USING location_history b
WHERE a.id > b.id
  AND a.device_serial = b.device_serial
  AND a.recorded_at   = b.recorded_at;

-- Makes replay idempotent: a device re-sending a buffered point after an
-- unacknowledged publish must not create a duplicate. Paired with
-- INSERT ... ON CONFLICT DO NOTHING in the subscriber.
CREATE UNIQUE INDEX IF NOT EXISTS uq_location_history_device_time
    ON location_history(device_serial, recorded_at);

-- --------------------------------------------- tamper-evident chain
-- Each stored point is hashed together with the hash before it, forming a
-- per-device chain. Altering or deleting any row breaks every hash after it,
-- which is what makes the history evidence rather than just data.
--
-- The chain is ordered by INGEST (id), not by recorded_at: backfilled points
-- legitimately arrive out of chronological order, so the claim the chain
-- supports is "received in this order and unmodified since".
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS prev_hash   TEXT;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS record_hash TEXT;

-- How the device proved it was itself for this point:
--   'hmac'   HMAC-SHA256 signature over the payload (firmware rev 3+)
--   'secret' plaintext shared secret in the payload (legacy firmware)
-- A certificate reports these separately: only 'hmac' points are
-- cryptographically attributable to the device.
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS auth_method VARCHAR(10) NOT NULL DEFAULT 'secret';

CREATE INDEX IF NOT EXISTS idx_location_history_backfill
    ON location_history(device_serial, is_backfill) WHERE is_backfill;

-- Head of each device's hash chain. Locked FOR UPDATE while appending, which
-- serialises concurrent inserts for one device so the chain cannot fork.
CREATE TABLE IF NOT EXISTS device_chain (
    device_serial VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
    head_hash     TEXT NOT NULL,
    record_count  BIGINT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------------- naming
-- A human name for a device. Every device otherwise shows only its raw
-- serial, which is exactly the complaint about cheap trackers: nobody wants
-- to read "TRACKER-004" when they mean "Dad's Car".
ALTER TABLE devices ADD COLUMN IF NOT EXISTS name VARCHAR(80);

-- ------------------------------------------------------------ geofences
-- Circular zones. A circle needs only a centre and radius to check against a
-- point, which keeps violation detection on the MQTT ingest path a single
-- comparison per fence per point - important, since that path runs on every
-- message from every device.
CREATE TABLE IF NOT EXISTS geofences (
    id            BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) NOT NULL REFERENCES devices(serial) ON DELETE CASCADE,
    name          VARCHAR(80) NOT NULL,
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL,
    radius_m      INTEGER NOT NULL CHECK (radius_m BETWEEN 20 AND 50000),
    -- 'enter', 'exit', or 'both' - which crossing direction raises an alert.
    trigger_on    VARCHAR(10) NOT NULL DEFAULT 'both'
                  CHECK (trigger_on IN ('enter', 'exit', 'both')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    INT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_device ON geofences(device_serial) WHERE is_active;

-- Last known inside/outside state per (device, geofence), so a crossing is
-- detected on the transition rather than re-alerting on every single point
-- a device reports while sitting inside a zone.
CREATE TABLE IF NOT EXISTS geofence_state (
    geofence_id BIGINT PRIMARY KEY REFERENCES geofences(id) ON DELETE CASCADE,
    is_inside   BOOLEAN NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------- alerts
-- One event log for everything a user might want to be told about:
-- geofence crossings, a battery below threshold, a device that has gone
-- silent. Unified rather than one-off push notifications, so a user can
-- come back a day later and see what happened while they were away - most
-- consumer trackers only ever push, they never let you review the history.
CREATE TABLE IF NOT EXISTS alerts (
    id            BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) NOT NULL REFERENCES devices(serial) ON DELETE CASCADE,
    user_id       INT REFERENCES users(id) ON DELETE CASCADE,
    kind          VARCHAR(20) NOT NULL
                  CHECK (kind IN ('geofence_enter', 'geofence_exit', 'low_battery', 'offline', 'back_online')),
    title         VARCHAR(120) NOT NULL,
    detail        VARCHAR(400),
    lat           DOUBLE PRECISION,
    lng           DOUBLE PRECISION,
    geofence_id   BIGINT REFERENCES geofences(id) ON DELETE SET NULL,
    is_read       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_time ON alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON alerts(user_id) WHERE NOT is_read;

-- Debounces "device offline" alerts: without a last-fired timestamp, a
-- device that flaps between online/offline near the timeout would generate
-- one alert per flap.
CREATE TABLE IF NOT EXISTS device_alert_state (
    device_serial      VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
    last_battery_alert TIMESTAMP WITH TIME ZONE,
    last_offline_alert TIMESTAMP WITH TIME ZONE,
    was_online         BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------- indexes
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_serial_active ON devices(serial, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_history_device_time
    ON location_history(device_serial, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_history_recorded_at
    ON location_history(recorded_at DESC);

-- ------------------------------------------------------------ triggers
CREATE OR REPLACE FUNCTION update_last_modified_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_devices_last_modified_at ON devices;
CREATE TRIGGER update_devices_last_modified_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_last_modified_at_column();

-- --------------------------------------------------------------- views
-- Dropped rather than replaced: CREATE OR REPLACE cannot change a view's
-- column list, and the earlier definition exposed device_secret.
DROP VIEW IF EXISTS device_overview;
CREATE VIEW device_overview AS
SELECT
    d.serial,
    d.is_active,
    d.activated_at,
    d.created_at,
    d.last_modified_at,
    u.id    AS user_id,
    u.phone AS user_phone,
    u.role  AS user_role,
    COUNT(lh.id)         AS location_count,
    MAX(lh.recorded_at)  AS last_location_time
FROM devices d
LEFT JOIN users u ON d.user_id = u.id
LEFT JOIN location_history lh ON d.serial = lh.device_serial
GROUP BY d.serial, u.id, u.phone, u.role;
