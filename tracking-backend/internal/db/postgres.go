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
