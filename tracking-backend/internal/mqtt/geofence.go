package mqtt

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"tracking-backend/internal/db"
	"tracking-backend/internal/services"

	"github.com/redis/go-redis/v9"
)

// batteryLowThreshold is a 12V lead-acid pack under load. Below this the
// vehicle battery is at risk of not starting, which is the thing an owner
// actually wants to be told about — not a raw voltage number.
const batteryLowThreshold = 11.6

// batteryAlertCooldown stops one low-voltage reading from generating an
// alert on every single point until the battery recovers. Without it, a
// device idling at 11.5V for an hour would page the user 120 times.
const batteryAlertCooldown = 6 * time.Hour

// alertPayload is what gets published to Redis for the WebSocket layer to
// relay live, mirroring the shape of a location update so the frontend can
// reuse the same connection.
type alertPayload struct {
	Type         string    `json:"type"`
	ID           int64     `json:"id"`
	DeviceSerial string    `json:"device_serial"`
	Kind         string    `json:"kind"`
	Title        string    `json:"title"`
	Detail       string    `json:"detail,omitempty"`
	Lat          *float64  `json:"lat,omitempty"`
	Lng          *float64  `json:"lng,omitempty"`
	UserID       int64     `json:"-"` // routing only, not sent to the client
	CreatedAt    time.Time `json:"created_at"`
}

// evaluateAlerts runs every alert rule against one live point.
//
// Called only for points that are current (see the isBackfill guard at the
// call site) — a geofence crossing or low-battery reading from forty minutes
// ago is history, not something to page a user about right now.
func evaluateAlerts(pg *sql.DB, rdb *redis.Client, userID int64, serial string, lat, lng, battery float64) {
	evaluateGeofences(pg, rdb, userID, serial, lat, lng)
	evaluateBattery(pg, rdb, userID, serial, battery, lat, lng)
}

func evaluateGeofences(pg *sql.DB, rdb *redis.Client, userID int64, serial string, lat, lng float64) {
	rows, err := pg.Query(`
        SELECT g.id, g.name, g.lat, g.lng, g.radius_m, g.trigger_on, s.is_inside
        FROM geofences g
        LEFT JOIN geofence_state s ON s.geofence_id = g.id
        WHERE g.device_serial = $1 AND g.is_active`,
		serial,
	)
	if err != nil {
		log.Println("geofence query error:", err)
		return
	}
	defer rows.Close()

	type fence struct {
		id        int64
		name      string
		centerLat float64
		centerLng float64
		radiusM   int
		triggerOn string
		wasInside sql.NullBool
	}

	var fences []fence
	for rows.Next() {
		var f fence
		if err := rows.Scan(&f.id, &f.name, &f.centerLat, &f.centerLng,
			&f.radiusM, &f.triggerOn, &f.wasInside); err != nil {
			continue
		}
		fences = append(fences, f)
	}

	for _, f := range fences {
		isInside := services.PointInCircle(lat, lng, f.centerLat, f.centerLng, float64(f.radiusM))

		var priorPtr *bool
		if f.wasInside.Valid {
			v := f.wasInside.Bool
			priorPtr = &v
		}

		crossing, hasPrior := services.EvaluateCrossing(priorPtr, isInside)

		// Always persist the current state, whether or not this is the first
		// observation — otherwise the fence never establishes a baseline and
		// can never fire.
		if _, err := pg.Exec(`
            INSERT INTO geofence_state (geofence_id, is_inside, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (geofence_id) DO UPDATE
                SET is_inside = EXCLUDED.is_inside, updated_at = NOW()`,
			f.id, isInside,
		); err != nil {
			log.Println("geofence_state upsert error:", err)
		}

		if !hasPrior {
			continue
		}

		var kind, title string
		switch {
		case crossing.Entered && (f.triggerOn == "enter" || f.triggerOn == "both"):
			kind, title = "geofence_enter", serial+" entered "+f.name
		case crossing.Exited && (f.triggerOn == "exit" || f.triggerOn == "both"):
			kind, title = "geofence_exit", serial+" left "+f.name
		default:
			continue
		}

		geofenceID := f.id
		insertAlert(pg, rdb, userID, serial, kind, title, "", &lat, &lng, &geofenceID)
	}
}

func evaluateBattery(pg *sql.DB, rdb *redis.Client, userID int64, serial string, battery float64, lat, lng float64) {
	if battery <= 0 || battery >= batteryLowThreshold {
		return
	}

	var lastAlert sql.NullTime
	err := pg.QueryRow(`
        INSERT INTO device_alert_state (device_serial, last_battery_alert)
        VALUES ($1, NULL)
        ON CONFLICT (device_serial) DO UPDATE SET device_serial = EXCLUDED.device_serial
        RETURNING last_battery_alert`,
		serial,
	).Scan(&lastAlert)
	if err != nil {
		log.Println("device_alert_state query error:", err)
		return
	}

	if lastAlert.Valid && time.Since(lastAlert.Time) < batteryAlertCooldown {
		return
	}

	if _, err := pg.Exec(
		"UPDATE device_alert_state SET last_battery_alert = NOW() WHERE device_serial = $1", serial,
	); err != nil {
		log.Println("device_alert_state update error:", err)
	}

	title := serial + " battery is low"
	detail := formatVoltage(battery) + "V — vehicle may not start"
	insertAlert(pg, rdb, userID, serial, "low_battery", title, detail, &lat, &lng, nil)
}

// EvaluateOffline is called by a periodic sweep (see StartOfflineSweeper) —
// unlike a geofence or battery reading, "device stopped reporting" has no
// triggering message to hang off of; it is the absence of one.
func EvaluateOffline(pg *sql.DB, rdb *redis.Client) {
	rows, err := pg.Query(`
        SELECT d.serial, d.user_id, s.was_online, s.last_offline_alert
        FROM devices d
        LEFT JOIN device_alert_state s ON s.device_serial = d.serial
        WHERE d.user_id IS NOT NULL AND d.is_active`)
	if err != nil {
		log.Println("offline sweep query error:", err)
		return
	}

	type row struct {
		serial    string
		userID    sql.NullInt64
		wasOnline sql.NullBool
		lastAlert sql.NullTime
	}

	var devices []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.serial, &r.userID, &r.wasOnline, &r.lastAlert); err != nil {
			continue
		}
		devices = append(devices, r)
	}
	rows.Close()

	for _, d := range devices {
		if !d.userID.Valid {
			continue
		}

		online := services.IsDeviceOnline(d.serial)
		// Default true: a device never seen before should not immediately
		// fire "back online" the first time it ever reports.
		wasOnline := !d.wasOnline.Valid || d.wasOnline.Bool

		if online == wasOnline {
			continue
		}

		if _, err := pg.Exec(`
            INSERT INTO device_alert_state (device_serial, was_online)
            VALUES ($1, $2)
            ON CONFLICT (device_serial) DO UPDATE SET was_online = EXCLUDED.was_online`,
			d.serial, online,
		); err != nil {
			log.Println("device_alert_state was_online update error:", err)
			continue
		}

		if online {
			insertAlert(pg, rdb, d.userID.Int64, d.serial, "back_online",
				d.serial+" is back online", "", nil, nil, nil)
		} else {
			insertAlert(pg, rdb, d.userID.Int64, d.serial, "offline",
				d.serial+" stopped reporting", "No data received recently", nil, nil, nil)
		}
	}
}

// insertAlert writes the alert row and publishes it for the live WebSocket
// feed. DB write and publish are deliberately not in one transaction with
// the caller's other work: an alert is best-effort telemetry, not something
// that should roll back a location insert if Redis happens to be down.
func insertAlert(pg *sql.DB, rdb *redis.Client, userID int64, serial, kind, title, detail string,
	lat, lng *float64, geofenceID *int64) {

	var id int64
	var createdAt time.Time

	err := pg.QueryRow(`
        INSERT INTO alerts (device_serial, user_id, kind, title, detail, lat, lng, geofence_id)
        VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8)
        RETURNING id, created_at`,
		serial, userID, kind, title, detail, lat, lng, geofenceID,
	).Scan(&id, &createdAt)
	if err != nil {
		log.Println("alert insert error:", err)
		return
	}

	log.Printf("Alert [%s] %s", kind, title)

	payload := alertPayload{
		Type: "alert", ID: id, DeviceSerial: serial, Kind: kind,
		Title: title, Detail: detail, Lat: lat, Lng: lng, CreatedAt: createdAt,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return
	}

	// Channel is per-user, not per-device: alerts must reach only that
	// user's own connections, mirroring the access control on every other
	// alert endpoint.
	rdb.Publish(db.Ctx, alertChannel(userID), string(body))
}

// alertChannel names the Redis pubsub channel for one user's live alerts.
func alertChannel(userID int64) string {
	return "user_alerts:" + strconv.FormatInt(userID, 10)
}

func formatVoltage(v float64) string {
	return fmt.Sprintf("%.1f", v)
}

// -------------------------------------------------------- offline sweeper

var offlineSweepStop chan struct{}

// StartOfflineSweeper periodically checks every active device against
// Redis's online/offline state and raises offline / back_online alerts on
// the transitions. Unlike every other alert rule, "went silent" has no
// message to trigger off of — it is the absence of one — so it has to be
// polled rather than evaluated inline in handleMessage.
func StartOfflineSweeper(pg *sql.DB, rdb *redis.Client, interval time.Duration) {
	offlineSweepStop = make(chan struct{})
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			EvaluateOffline(pg, rdb)
		case <-offlineSweepStop:
			return
		}
	}
}

// StopOfflineSweeper stops the sweep goroutine started by
// StartOfflineSweeper. Safe to call even if it was never started.
func StopOfflineSweeper() {
	if offlineSweepStop != nil {
		close(offlineSweepStop)
	}
}
