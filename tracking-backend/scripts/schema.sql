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

-- Anti-theft telemetry. ext_power is the vehicle supply: losing it while the
-- device keeps reporting on its backup cell is a cut battery, not a shutdown.
-- jamming is the modem's own interference flag.
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS ext_power BOOLEAN;
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS jamming   BOOLEAN;

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

-- The rule set grew well past the original five kinds. Widen the column and
-- restate the constraint: CREATE TABLE IF NOT EXISTS does nothing on an
-- existing database, so the original CHECK would otherwise still be in force
-- and every new alert kind would fail to insert.
ALTER TABLE alerts ALTER COLUMN kind TYPE VARCHAR(32);
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_kind_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_kind_check CHECK (kind IN (
    'geofence_enter', 'geofence_exit', 'low_battery', 'offline', 'back_online',
    'overspeed', 'ignition_on', 'ignition_off', 'tow', 'impact',
    'harsh_accel', 'harsh_brake', 'harsh_corner',
    'power_cut', 'power_restored', 'jamming', 'sos',
    'subscription_expiring', 'subscription_expired'
));

-- Severity drives how loudly a client presents an alert. Derived from the
-- kind rather than stored per rule, so it cannot drift between them.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS severity VARCHAR(10) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical'));

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

-- Debounce markers for the rules added alongside the expanded alert engine.
-- Kept on the existing per-device state row rather than in a new table.
ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_overspeed_alert TIMESTAMP WITH TIME ZONE;
ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_tow_alert       TIMESTAMP WITH TIME ZONE;
ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_jamming_alert   TIMESTAMP WITH TIME ZONE;

-- Last observed states, so a rule fires on the transition rather than on
-- every point that happens to report the same condition.
ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_ignition   BOOLEAN;
ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_ext_power  BOOLEAN;

-- ------------------------------------------------- commercial / inventory
-- What a unit needs to be sold, warrantied and supported. The serial is the
-- tracking identity; the IMEI is what the carrier and the regulator know it
-- by, so support cases and SIM records key off that instead.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS imei           VARCHAR(20);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS model          VARCHAR(40);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sim_msisdn     VARCHAR(20);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS purchase_date  DATE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS warranty_months INT NOT NULL DEFAULT 18;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes          VARCHAR(400);

CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_imei ON devices(imei) WHERE imei IS NOT NULL;

-- ------------------------------------------------------- subscriptions
-- Platform access is sold separately from the hardware: every unit ships with
-- a free trial and must be renewed after that. Stored per device rather than
-- per user because that is how it is sold - one unit, one plan.
CREATE TABLE IF NOT EXISTS device_subscription (
    device_serial VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
    plan          VARCHAR(20) NOT NULL DEFAULT 'trial'
                  CHECK (plan IN ('trial', 'basic', 'pro')),
    started_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Notified-at markers keep the expiry sweep from re-alerting every pass.
    warned_at     TIMESTAMP WITH TIME ZONE,
    expired_at    TIMESTAMP WITH TIME ZONE,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_expires ON device_subscription(expires_at);

-- ---------------------------------------------------------- device settings
-- The "configurator": everything an owner can tune per unit. Defaults match
-- the firmware's own defaults so a device with no row behaves identically to
-- one with a freshly created row.
CREATE TABLE IF NOT EXISTS device_settings (
    device_serial       VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
    -- 0 disables the overspeed rule entirely rather than meaning "0 km/h".
    speed_limit_kmh     INT NOT NULL DEFAULT 0 CHECK (speed_limit_kmh BETWEEN 0 AND 300),
    report_interval_s   INT NOT NULL DEFAULT 30 CHECK (report_interval_s BETWEEN 10 AND 3600),
    -- Per-rule switches. An owner who parks in a bad GSM area should be able
    -- to silence jamming alerts without losing theft alerts.
    alert_overspeed     BOOLEAN NOT NULL DEFAULT TRUE,
    alert_ignition      BOOLEAN NOT NULL DEFAULT TRUE,
    alert_tow           BOOLEAN NOT NULL DEFAULT TRUE,
    alert_impact        BOOLEAN NOT NULL DEFAULT TRUE,
    alert_harsh_driving BOOLEAN NOT NULL DEFAULT TRUE,
    alert_power_cut     BOOLEAN NOT NULL DEFAULT TRUE,
    alert_jamming       BOOLEAN NOT NULL DEFAULT TRUE,
    alert_low_battery   BOOLEAN NOT NULL DEFAULT TRUE,
    alert_geofence      BOOLEAN NOT NULL DEFAULT TRUE,
    alert_offline       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Silent mode suppresses the phone's notification sound but still records
    -- the alert - the "silent alarm" case, where noise would tip off a thief.
    silent_mode         BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------- device commands
-- Outbound control: engine cut-off, central locking, locate, reboot. Queued
-- rather than fire-and-forget because a device on GPRS is frequently
-- unreachable for a minute at a time, and "did the engine actually cut?" is
-- the one question this feature must be able to answer honestly.
CREATE TABLE IF NOT EXISTS device_commands (
    id            BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) NOT NULL REFERENCES devices(serial) ON DELETE CASCADE,
    command       VARCHAR(32) NOT NULL
                  CHECK (command IN ('engine_cut', 'engine_restore', 'door_lock',
                                     'door_unlock', 'locate', 'reboot', 'set_interval')),
    params        JSONB,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'acked', 'failed', 'expired')),
    issued_by     INT REFERENCES users(id) ON DELETE SET NULL,
    issued_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at       TIMESTAMP WITH TIME ZONE,
    acked_at      TIMESTAMP WITH TIME ZONE,
    result        VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_commands_device_time ON device_commands(device_serial, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_pending ON device_commands(device_serial) WHERE status IN ('pending', 'sent');

-- ------------------------------------------------------ push subscriptions
-- Web Push endpoints, one row per browser/device the user has granted
-- permission on. The keys are the browser's, not ours: they are what the
-- payload is encrypted to, so a leaked row cannot be used to read anything.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    user_agent VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- ------------------------------------------------------------- odometer
-- A monotonic lifetime distance counter per device, folded in one fix at a
-- time on the MQTT ingest path (see UpdateOdometer in
-- internal/services/odometer.go). Kept out of location_history because it is
-- derived running state, not a recorded fact - the same reasoning that puts
-- the hash-chain head and the geofence in/out state in their own tables.
--
-- last_lat/last_lng is the last position that actually advanced the counter,
-- so the next fix measures its hop from there. Sub-8 m jitter never moves the
-- anchor, which is what stops a parked vehicle accruing kilometres of drift.
CREATE TABLE IF NOT EXISTS device_odometer (
    device_serial    VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
    total_meters     DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_lat         DOUBLE PRECISION,
    last_lng         DOUBLE PRECISION,
    last_recorded_at TIMESTAMP WITH TIME ZONE,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
