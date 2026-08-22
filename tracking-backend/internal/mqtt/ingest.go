package mqtt

import (
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"tracking-backend/internal/integrity"
)

/*
Ingest rules for gap-free tracking and tamper-evident storage.

Two changes from the original behaviour, both load-bearing:

 1. recorded_at comes from the DEVICE clock, not the server clock. A point
    buffered through a coverage gap and replayed twenty minutes later must land
    at the moment it happened, or the vehicle appears to teleport.

 2. Every stored point is appended to a per-device hash chain inside the same
    transaction as the insert, so a row cannot exist without a hash.
*/

const (
	// maxBackfillAge bounds how far into the past a device may place a point.
	// Generous enough for a long outage, tight enough that a device with a
	// broken clock cannot rewrite last year.
	maxBackfillAge = 30 * 24 * time.Hour

	// maxClockSkew bounds the future. GPS time should never be ahead of the
	// server by more than network delay plus a little clock drift.
	maxClockSkew = 5 * time.Minute

	// backfillThreshold is the lag above which a point is flagged as arriving
	// late. Comfortably above the normal 30s reporting interval plus jitter,
	// so ordinary traffic is not mislabelled.
	backfillThreshold = 3 * time.Minute

	// earliestPlausible rejects the 1970 timestamps produced by firmware that
	// falls back to uptime when it has no GPS fix.
	earliestPlausibleYear = 2020
)

// resolveTimestamp decides when a fix actually happened, and whether it
// arrived late enough to count as backfill.
//
// Anything the device cannot be trusted about — no clock, a 1970 date, a time
// in the future, or older than the backfill window — falls back to the server
// clock and is treated as live.
func resolveTimestamp(deviceUnix int64, now time.Time) (recordedAt time.Time, isBackfill bool) {
	if deviceUnix <= 0 {
		return now, false
	}

	t := time.Unix(deviceUnix, 0).UTC()

	// Firmware without a GPS fix used to send millis()/1000, which decodes to
	// 1970. Reject rather than storing a 55-year-old point.
	if t.Year() < earliestPlausibleYear {
		return now, false
	}

	// A device clock running ahead would pin future-dated points permanently
	// at the end of every track.
	if t.After(now.Add(maxClockSkew)) {
		return now, false
	}

	if t.Before(now.Add(-maxBackfillAge)) {
		return now, false
	}

	return t, now.Sub(t) > backfillThreshold
}

// authenticate verifies a device payload, preferring the HMAC signature and
// falling back to the legacy plaintext secret.
//
// Returning the method used matters: a certificate must be able to say which
// points were cryptographically attributable to the device and which merely
// carried a secret that travels in the clear.
func authenticate(storedSecret string, msg LocationMessageWithCSQ) (integrity.AuthMethod, error) {
	if msg.Signature != "" {
		if !integrity.VerifyPayload(
			storedSecret, msg.Device, msg.Timestamp, msg.Lat, msg.Lng, msg.Signature,
		) {
			return "", errors.New("invalid HMAC signature")
		}
		return integrity.AuthHMAC, nil
	}

	// Legacy firmware. Constant-time so timing cannot leak the secret.
	if subtle.ConstantTimeCompare([]byte(storedSecret), []byte(msg.Secret)) != 1 {
		return "", errors.New("invalid device secret")
	}

	return integrity.AuthSecret, nil
}

// storeResult reports what happened to one point.
type storeResult struct {
	// Stored is false when the point was a duplicate replay, which is normal
	// and not an error.
	Stored     bool
	IsBackfill bool
	RecordedAt time.Time
	RecordHash string
}

// storePoint writes a fix and extends the device chain atomically.
//
// The chain head is locked FOR UPDATE, which serialises concurrent inserts for
// a single device. Without it two goroutines could read the same head and
// write a forked chain that can never verify.
func storePoint(
	pg *sql.DB,
	msg LocationMessageWithCSQ,
	recordedAt time.Time,
	isBackfill bool,
	method integrity.AuthMethod,
) (storeResult, error) {

	tx, err := pg.Begin()
	if err != nil {
		return storeResult{}, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	// Take the per-device chain lock. The insert seeds a genesis row the first
	// time a device reports.
	var prevHash string
	err = tx.QueryRow(`
        INSERT INTO device_chain (device_serial, head_hash, record_count)
        VALUES ($1, $2, 0)
        ON CONFLICT (device_serial) DO UPDATE
            SET device_serial = EXCLUDED.device_serial
        RETURNING head_hash`,
		msg.Device, integrity.GenesisHash,
	).Scan(&prevHash)
	if err != nil {
		return storeResult{}, fmt.Errorf("locking device chain: %w", err)
	}

	var ignition *bool
	ign := msg.Ignition
	ignition = &ign

	var heading *float64
	if msg.Heading != 0 {
		h := msg.Heading
		heading = &h
	}

	record := integrity.Record{
		DeviceSerial: msg.Device,
		RecordedAt:   recordedAt,
		Lat:          msg.Lat,
		Lng:          msg.Lng,
		Speed:        msg.Speed,
		Satellites:   msg.Satellites,
		CSQ:          msg.CSQ,
		Battery:      msg.Battery,
		Ignition:     ignition,
		Heading:      heading,
		IsBackfill:   isBackfill,
		AuthMethod:   method,
	}

	recordHash := integrity.HashRecord(record, prevHash)

	// ON CONFLICT DO NOTHING makes replay idempotent: a device that re-sends a
	// buffered point after an unacknowledged publish must not duplicate it.
	var insertedID int64
	err = tx.QueryRow(`
        INSERT INTO location_history
            (device_serial, lat, lng, speed, satellites, csq, battery, ignition,
             heading, altitude, hdop, operator, fix_age_ms,
             recorded_at, received_at, is_backfill,
             prev_hash, record_hash, auth_method)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15,$16,$17,$18)
        ON CONFLICT (device_serial, recorded_at) DO NOTHING
        RETURNING id`,
		msg.Device, msg.Lat, msg.Lng, msg.Speed, msg.Satellites, msg.CSQ,
		msg.Battery, ign,
		nullFloat(msg.Heading), nullFloat(msg.Altitude), nullFloat(msg.HDOP),
		nullString(msg.Operator), nullInt(msg.FixAgeMs),
		recordedAt, isBackfill,
		prevHash, recordHash, string(method),
	).Scan(&insertedID)

	if errors.Is(err, sql.ErrNoRows) {
		// Duplicate replay. Commit nothing and leave the chain untouched — a
		// point that was not stored must not advance the head.
		return storeResult{Stored: false, RecordedAt: recordedAt}, nil
	}
	if err != nil {
		return storeResult{}, fmt.Errorf("inserting location: %w", err)
	}

	if _, err := tx.Exec(`
        UPDATE device_chain
        SET head_hash = $2, record_count = record_count + 1, updated_at = NOW()
        WHERE device_serial = $1`,
		msg.Device, recordHash,
	); err != nil {
		return storeResult{}, fmt.Errorf("advancing device chain: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return storeResult{}, err
	}

	return storeResult{
		Stored:     true,
		IsBackfill: isBackfill,
		RecordedAt: recordedAt,
		RecordHash: recordHash,
	}, nil
}
