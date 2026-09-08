package db

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func InitPostgres(dsn string) error {
	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("error opening postgres: %w", err)
	}

	// Without these the pool is unbounded and a traffic spike can exhaust
	// Postgres' max_connections.
	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(30 * time.Minute)

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to postgres: %w", err)
	}

	log.Println("Connected to PostgreSQL")
	return createTables()
}

// createTables brings the schema up to date. It must stay in sync with
// scripts/init.sql: CREATE TABLE IF NOT EXISTS silently does nothing on an
// existing database, so every column added after the initial release also
// needs an ADD COLUMN IF NOT EXISTS below.
func createTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		// Patch databases created before role existed.
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`,

		`CREATE TABLE IF NOT EXISTS devices (
            serial VARCHAR(50) PRIMARY KEY,
            device_secret TEXT NOT NULL,
            user_id INT REFERENCES users(id) ON DELETE SET NULL,
            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            activated_at TIMESTAMP WITH TIME ZONE,
            created_by INT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		// Patch databases created before the admin/activation columns existed.
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_secret TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,

		`CREATE TABLE IF NOT EXISTS audit_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(50) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id VARCHAR(100),
            details JSONB,
            ip_address INET,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_devices_serial_active ON devices(serial, is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`,

		`CREATE TABLE IF NOT EXISTS location_history (
            id BIGSERIAL PRIMARY KEY,
            device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            speed INTEGER DEFAULT 0,
            satellites INTEGER DEFAULT 0,
            battery DOUBLE PRECISION DEFAULT 0,
            csq INTEGER DEFAULT 0,
            ignition BOOLEAN,
            heading DOUBLE PRECISION,
            altitude DOUBLE PRECISION,
            hdop DOUBLE PRECISION,
            operator TEXT,
            fix_age_ms INTEGER,
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS battery DOUBLE PRECISION DEFAULT 0`,
		// The firmware reports ignition but it was only ever cached in Redis,
		// so it was lost on expiry or restart.
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS ignition BOOLEAN`,
		// Telemetry the firmware can report but that had nowhere to land.
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS hdop DOUBLE PRECISION`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS operator TEXT`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS fix_age_ms INTEGER`,

		// Anti-theft telemetry. ext_power is the vehicle supply: losing it
		// while the device keeps reporting on its backup cell is a cut
		// battery, not a shutdown. jamming is the modem's interference flag.
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS ext_power BOOLEAN`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS jamming BOOLEAN`,

		// --- gap-free tracking -------------------------------------------
		// recorded_at now means "when the fix happened" (device clock);
		// received_at is when the server got it. They diverge whenever a
		// device replays points buffered through a coverage gap.
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS is_backfill BOOLEAN NOT NULL DEFAULT FALSE`,

		// Older rows may collide on (device_serial, recorded_at); the unique
		// index below cannot be created until they are gone.
		`DELETE FROM location_history a USING location_history b
         WHERE a.id > b.id
           AND a.device_serial = b.device_serial
           AND a.recorded_at   = b.recorded_at`,

		// Makes replay idempotent, with ON CONFLICT DO NOTHING on insert.
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_location_history_device_time
            ON location_history(device_serial, recorded_at)`,

		// --- tamper-evident chain ----------------------------------------
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS prev_hash TEXT`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS record_hash TEXT`,
		`ALTER TABLE location_history ADD COLUMN IF NOT EXISTS auth_method VARCHAR(10) NOT NULL DEFAULT 'secret'`,

		`CREATE INDEX IF NOT EXISTS idx_location_history_backfill
            ON location_history(device_serial, is_backfill) WHERE is_backfill`,

		`CREATE TABLE IF NOT EXISTS device_chain (
            device_serial VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
            head_hash     TEXT NOT NULL,
            record_count  BIGINT NOT NULL DEFAULT 0,
            updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		// --- naming --------------------------------------------------------
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS name VARCHAR(80)`,

		// --- geofences -------------------------------------------------------
		`CREATE TABLE IF NOT EXISTS geofences (
            id BIGSERIAL PRIMARY KEY,
            device_serial VARCHAR(50) NOT NULL REFERENCES devices(serial) ON DELETE CASCADE,
            name VARCHAR(80) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            radius_m INTEGER NOT NULL CHECK (radius_m BETWEEN 20 AND 50000),
            trigger_on VARCHAR(10) NOT NULL DEFAULT 'both'
                CHECK (trigger_on IN ('enter', 'exit', 'both')),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by INT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`CREATE INDEX IF NOT EXISTS idx_geofences_device ON geofences(device_serial) WHERE is_active`,

		`CREATE TABLE IF NOT EXISTS geofence_state (
            geofence_id BIGINT PRIMARY KEY REFERENCES geofences(id) ON DELETE CASCADE,
            is_inside BOOLEAN NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		// --- alerts ----------------------------------------------------------
		`CREATE TABLE IF NOT EXISTS alerts (
            id BIGSERIAL PRIMARY KEY,
            device_serial VARCHAR(50) NOT NULL REFERENCES devices(serial) ON DELETE CASCADE,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            kind VARCHAR(20) NOT NULL
                CHECK (kind IN ('geofence_enter', 'geofence_exit', 'low_battery', 'offline', 'back_online')),
            title VARCHAR(120) NOT NULL,
            detail VARCHAR(400),
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            geofence_id BIGINT REFERENCES geofences(id) ON DELETE SET NULL,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		// The rule set grew past the original five kinds. CREATE TABLE IF NOT
		// EXISTS does nothing on an existing database, so the old CHECK would
		// still be in force and every new kind would fail to insert.
		`ALTER TABLE alerts ALTER COLUMN kind TYPE VARCHAR(32)`,
		`ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_kind_check`,
		`ALTER TABLE alerts ADD CONSTRAINT alerts_kind_check CHECK (kind IN (
            'geofence_enter', 'geofence_exit', 'low_battery', 'offline', 'back_online',
            'overspeed', 'ignition_on', 'ignition_off', 'tow', 'impact',
            'harsh_accel', 'harsh_brake', 'harsh_corner',
            'power_cut', 'power_restored', 'jamming', 'sos',
            'subscription_expiring', 'subscription_expired'
        ))`,

		`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS severity VARCHAR(10) NOT NULL DEFAULT 'info'
            CHECK (severity IN ('info', 'warning', 'critical'))`,

		`CREATE INDEX IF NOT EXISTS idx_alerts_user_time ON alerts(user_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON alerts(user_id) WHERE NOT is_read`,

		`CREATE TABLE IF NOT EXISTS device_alert_state (
            device_serial VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
            last_battery_alert TIMESTAMP WITH TIME ZONE,
            last_offline_alert TIMESTAMP WITH TIME ZONE,
            was_online BOOLEAN NOT NULL DEFAULT TRUE
        )`,

		// Debounce markers and last-observed states for the rules added with
		// the expanded alert engine, so each fires on a transition rather than
		// on every point reporting the same condition.
		`ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_overspeed_alert TIMESTAMP WITH TIME ZONE`,
		`ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_tow_alert TIMESTAMP WITH TIME ZONE`,
		`ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_jamming_alert TIMESTAMP WITH TIME ZONE`,
		`ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_ignition BOOLEAN`,
		`ALTER TABLE device_alert_state ADD COLUMN IF NOT EXISTS last_ext_power BOOLEAN`,

		// --- commercial / inventory ------------------------------------------
		// What a unit needs to be sold, warrantied and supported.
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS imei VARCHAR(20)`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS model VARCHAR(40)`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS sim_msisdn VARCHAR(20)`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS purchase_date DATE`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS warranty_months INT NOT NULL DEFAULT 18`,
		`ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes VARCHAR(400)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_imei ON devices(imei) WHERE imei IS NOT NULL`,

		// --- subscriptions ----------------------------------------------------
		// Platform access is sold separately from the hardware: every unit
		// ships with a free trial and must be renewed after it.
		`CREATE TABLE IF NOT EXISTS device_subscription (
            device_serial VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
            plan          VARCHAR(20) NOT NULL DEFAULT 'trial'
                          CHECK (plan IN ('trial', 'basic', 'pro')),
            started_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            expires_at    TIMESTAMP WITH TIME ZONE NOT NULL,
            warned_at     TIMESTAMP WITH TIME ZONE,
            expired_at    TIMESTAMP WITH TIME ZONE,
            updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_expires ON device_subscription(expires_at)`,

		// --- device settings (the configurator) -------------------------------
		`CREATE TABLE IF NOT EXISTS device_settings (
            device_serial       VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
            speed_limit_kmh     INT NOT NULL DEFAULT 0 CHECK (speed_limit_kmh BETWEEN 0 AND 300),
            report_interval_s   INT NOT NULL DEFAULT 30 CHECK (report_interval_s BETWEEN 10 AND 3600),
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
            silent_mode         BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )`,

		// --- device commands --------------------------------------------------
		// Queued rather than fire-and-forget: a device on GPRS is regularly
		// unreachable for a minute, and "did the engine actually cut?" is the
		// one question this feature has to answer honestly.
		`CREATE TABLE IF NOT EXISTS device_commands (
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
        )`,
		`CREATE INDEX IF NOT EXISTS idx_commands_device_time ON device_commands(device_serial, issued_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_commands_pending ON device_commands(device_serial) WHERE status IN ('pending', 'sent')`,

		// --- web push subscriptions -------------------------------------------
		// The keys are the browser's, not ours: they are what the payload is
		// encrypted to, so a leaked row cannot be used to read anything.
		`CREATE TABLE IF NOT EXISTS push_subscriptions (
            id         BIGSERIAL PRIMARY KEY,
            user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint   TEXT NOT NULL UNIQUE,
            p256dh     TEXT NOT NULL,
            auth       TEXT NOT NULL,
            user_agent VARCHAR(200),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMP WITH TIME ZONE
        )`,
		`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`,

		// --- odometer ------------------------------------------------------
		// A monotonic lifetime distance counter per device, accumulated one
		// fix at a time on the MQTT ingest path. last_lat/last_lng is the last
		// position that advanced the counter; sub-noise-floor jitter never
		// moves it, so a parked vehicle does not drift up kilometres.
		`CREATE TABLE IF NOT EXISTS device_odometer (
            device_serial    VARCHAR(50) PRIMARY KEY REFERENCES devices(serial) ON DELETE CASCADE,
            total_meters     DOUBLE PRECISION NOT NULL DEFAULT 0,
            last_lat         DOUBLE PRECISION,
            last_lng         DOUBLE PRECISION,
            last_recorded_at TIMESTAMP WITH TIME ZONE,
            updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`CREATE INDEX IF NOT EXISTS idx_location_history_device_time
            ON location_history(device_serial, recorded_at DESC)`,

		`CREATE INDEX IF NOT EXISTS idx_location_history_recorded_at
            ON location_history(recorded_at DESC)`,

		// Keep devices.last_modified_at current without every UPDATE having to set it.
		`CREATE OR REPLACE FUNCTION update_last_modified_at_column()
         RETURNS TRIGGER AS $$
         BEGIN
             NEW.last_modified_at = NOW();
             RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,

		`DROP TRIGGER IF EXISTS update_devices_last_modified_at ON devices`,

		`CREATE TRIGGER update_devices_last_modified_at
             BEFORE UPDATE ON devices
             FOR EACH ROW
             EXECUTE FUNCTION update_last_modified_at_column()`,
	}

	for _, query := range queries {
		if _, err := DB.Exec(query); err != nil {
			return fmt.Errorf("error applying schema statement %q: %w", firstLine(query), err)
		}
	}

	log.Println("Database tables created/verified")
	return nil
}

// firstLine trims a SQL statement down to something readable in an error.
func firstLine(query string) string {
	trimmed := strings.TrimSpace(query)
	if idx := strings.IndexByte(trimmed, '\n'); idx >= 0 {
		return trimmed[:idx]
	}
	return trimmed
}

func ClosePostgres() {
	if DB != nil {
		DB.Close()
	}
}
