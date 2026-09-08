package services

import (
	"database/sql"
	"time"
)

/*
Odometer: a monotonic lifetime distance counter per device.

It is folded in one fix at a time on the MQTT ingest path rather than derived
on demand from location_history, because a "total distance since fitted"
figure spanning months of history would be far too much to re-sum on every
dashboard load. BuildTrack still computes per-range trip distance from the
stored points; the odometer is the running lifetime total.

Only live points feed it (see the isBackfill guard at the call site). A
backfilled point arrives out of chronological order, so measuring its hop
from the last-counted position would zig-zag the total. The kilometres driven
through a coverage gap are still recovered by BuildTrack over the replayed
history — they are just not reflected in the live odometer.
*/

const (
	// odometerNoiseFloorMeters ignores sub-GPS-precision jitter, so a parked
	// vehicle does not tick the counter up one 3 m step at a time. Matches the
	// noise floor BuildTrack uses for trip distance.
	odometerNoiseFloorMeters = 8.0

	// odometerMaxHopMeters rejects a single implausible jump between two
	// consecutive live points: a GPS glitch, or the first fix after the device
	// was powered up somewhere new. At the 30 s reporting interval this is
	// still well over 1000 km/h, far beyond any vehicle, so a legitimate hop
	// is never discarded.
	odometerMaxHopMeters = 10000.0
)

// OdometerIncrement decides how far, if at all, the odometer advances between
// the last counted position and a new one.
//
//   - below the noise floor: no real movement. The anchor is left in place so
//     drift cannot accumulate one sub-threshold step at a time.
//   - above the max hop: treated as a teleport (GPS glitch, or a cold start in
//     a new place). The anchor jumps to the new position but the distance is
//     not counted.
//   - otherwise: the great-circle distance is added and the anchor advances.
func OdometerIncrement(prevLat, prevLng, curLat, curLng float64) (meters float64, advanceAnchor bool) {
	d := HaversineMeters(prevLat, prevLng, curLat, curLng)
	switch {
	case d < odometerNoiseFloorMeters:
		return 0, false
	case d > odometerMaxHopMeters:
		return 0, true
	default:
		return d, true
	}
}

// UpdateOdometer folds one live fix into the device's running distance total.
//
// The INSERT ... ON CONFLICT DO UPDATE takes a row lock on the device's
// odometer row for the duration of the transaction, so two messages for the
// same device cannot both read the same anchor and lose an increment — the
// same locking trick storePoint uses for the hash chain.
func UpdateOdometer(pg *sql.DB, serial string, lat, lng float64, recordedAt time.Time) error {
	tx, err := pg.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	// Seed the row on first sighting; on conflict, lock it and read back the
	// current anchor without changing anything.
	var totalMeters float64
	var lastLat, lastLng sql.NullFloat64
	err = tx.QueryRow(`
        INSERT INTO device_odometer (device_serial, total_meters, last_lat, last_lng, last_recorded_at)
        VALUES ($1, 0, $2, $3, $4)
        ON CONFLICT (device_serial) DO UPDATE
            SET device_serial = EXCLUDED.device_serial
        RETURNING total_meters, last_lat, last_lng`,
		serial, lat, lng, recordedAt,
	).Scan(&totalMeters, &lastLat, &lastLng)
	if err != nil {
		return err
	}

	// No anchor yet — either the row was just inserted, or the odometer was
	// set manually before the device had ever reported. Seed the anchor and
	// wait for the next fix to measure a hop.
	if !lastLat.Valid || !lastLng.Valid {
		if _, err = tx.Exec(`
            UPDATE device_odometer
            SET last_lat = $2, last_lng = $3, last_recorded_at = $4, updated_at = NOW()
            WHERE device_serial = $1`,
			serial, lat, lng, recordedAt,
		); err != nil {
			return err
		}
		return tx.Commit()
	}

	meters, advance := OdometerIncrement(lastLat.Float64, lastLng.Float64, lat, lng)
	if !advance {
		// Sub-noise-floor hop: leave the anchor where it is so the next fix
		// still measures from the last real position.
		return tx.Commit()
	}

	if _, err = tx.Exec(`
        UPDATE device_odometer
        SET total_meters = total_meters + $2,
            last_lat = $3, last_lng = $4, last_recorded_at = $5, updated_at = NOW()
        WHERE device_serial = $1`,
		serial, meters, lat, lng, recordedAt,
	); err != nil {
		return err
	}

	return tx.Commit()
}
