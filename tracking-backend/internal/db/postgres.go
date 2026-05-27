package db

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func InitPostgres(dsn string) error {
	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("error opening postgres: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to postgres: %w", err)
	}

	log.Println("Connected to PostgreSQL")
	return createTables()
}

func createTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`CREATE TABLE IF NOT EXISTS devices (
            serial VARCHAR(50) PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)`,

		`CREATE TABLE IF NOT EXISTS location_history (
            id BIGSERIAL PRIMARY KEY,
            device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            speed INTEGER DEFAULT 0,
            satellites INTEGER DEFAULT 0,
            battery DOUBLE PRECISION DEFAULT 0,
            csq INTEGER DEFAULT 0,
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,

		`CREATE INDEX IF NOT EXISTS idx_location_history_device_time 
            ON location_history(device_serial, recorded_at DESC)`,

		`CREATE INDEX IF NOT EXISTS idx_location_history_recorded_at 
            ON location_history(recorded_at DESC)`,
	}

	for _, query := range queries {
		if _, err := DB.Exec(query); err != nil {
			return fmt.Errorf("error creating table: %w", err)
		}
	}

	log.Println("Database tables created/verified")
	return nil
}

func ClosePostgres() {
	if DB != nil {
		DB.Close()
	}
}
