package mqtt

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

/*
The alert engine.

Every rule here answers one question an owner actually asks — "is someone
towing my car?", "did the battery get cut?", "is my driver speeding?" — and
each is evaluated against a single live point on the MQTT ingest path.

Three properties are load-bearing across all of them:

  1. Rules fire on TRANSITIONS, not on states. A device sitting with the
     ignition on reports that fact every 30 seconds; alerting on the state
     would produce 120 notifications an hour. What matters is the moment it
     changed.

  2. Rules that cannot be expressed as a transition are DEBOUNCED with a
     per-rule cooldown, for the same reason.

  3. Every rule except SOS is switchable per device. An owner who parks in a
     basement with no GSM should be able to silence jamming alerts without
     also losing theft alerts. SOS is deliberately not switchable — a panic
     button that can be turned off in a settings screen is a liability.
*/

const (
	// towSpeedKmh is the speed above which movement with the ignition off is
	// treated as the vehicle being moved rather than GPS drift. A stationary
	// consumer receiver rarely fabricates more than 5 km/h; a tow truck pulling
	// away comfortably exceeds this.
	towSpeedKmh = 8

	// overspeedCooldown stops a sustained motorway run from alerting on every
	// single point. One alert, then quiet until the driver has had a chance to
	// slow down and speed up again.
	overspeedCooldown = 10 * time.Minute

	// towCooldown covers the length of a realistic tow: the first alert is the
	// one that matters, and repeats during the same event add nothing.
	towCooldown = 15 * time.Minute

	// jammingCooldown matches: a jammer stays on for the duration of a theft.
	jammingCooldown = 15 * time.Minute
)

// alertSettings is the per-device rule configuration, resolved once per point.
type alertSettings struct {
	speedLimitKmh int

	overspeed    bool
	ignition     bool
	tow          bool
	impact       bool
	harshDriving bool
	powerCut     bool
	jamming      bool
	lowBattery   bool
	geofence     bool
	offline      bool

	silent bool
}

// defaultAlertSettings matches the column defaults in device_settings, so a
// device with no row behaves exactly like one with a freshly created row.
func defaultAlertSettings() alertSettings {
	return alertSettings{
		speedLimitKmh: 0, // 0 disables the rule rather than meaning 0 km/h
		overspeed:     true,
		ignition:      true,
		tow:           true,
		impact:        true,
		harshDriving:  true,
		powerCut:      true,
		jamming:       true,
		lowBattery:    true,
		geofence:      true,
		offline:       true,
		silent:        false,
	}
}

func loadAlertSettings(pg *sql.DB, serial string) alertSettings {
	s := defaultAlertSettings()

	err := pg.QueryRow(`
        SELECT speed_limit_kmh, alert_overspeed, alert_ignition, alert_tow,
               alert_impact, alert_harsh_driving, alert_power_cut, alert_jamming,
               alert_low_battery, alert_geofence, alert_offline, silent_mode
        FROM device_settings
        WHERE device_serial = $1`,
		serial,
	).Scan(&s.speedLimitKmh, &s.overspeed, &s.ignition, &s.tow,
		&s.impact, &s.harshDriving, &s.powerCut, &s.jamming,
		&s.lowBattery, &s.geofence, &s.offline, &s.silent)

	if err != nil && err != sql.ErrNoRows {
		log.Println("device_settings load error:", err)
	}

	return s
}

// severityFor maps a rule to how loudly clients should present it.
//
// Derived from the kind rather than stored alongside each rule so the two can
// never disagree, and so a client that sees an unknown kind still gets a
// sensible default.
func severityFor(kind string) string {
	switch kind {
	case "impact", "sos", "power_cut", "tow", "jamming", "subscription_expired":
		return "critical"
	case "overspeed", "low_battery", "offline", "geofence_exit",
		"harsh_accel", "harsh_brake", "harsh_corner", "subscription_expiring":
		return "warning"
	default:
		// ignition_on/off, back_online, geofence_enter, power_restored.
		return "info"
	}
}

// evaluateAlerts runs every rule against one live point.
//
// Called only for points that are current (see the isBackfill guard at the
// call site): a geofence crossing or a low-battery reading from forty minutes
// ago is history, not something to page a user about right now.
func evaluateAlerts(pg *sql.DB, rdb *redis.Client, userID int64, serial string, msg LocationMessageWithCSQ) {
	s := loadAlertSettings(pg, serial)

	// Ensure the state row exists before any rule reads it, so each rule below
	// can assume a row and only worry about NULL columns.
	if _, err := pg.Exec(`
        INSERT INTO device_alert_state (device_serial) VALUES ($1)
        ON CONFLICT (device_serial) DO NOTHING`, serial,
	); err != nil {
		log.Println("device_alert_state ensure error:", err)
	}

	if s.geofence {
		evaluateGeofences(pg, rdb, userID, serial, msg.Lat, msg.Lng)
	}
	if s.lowBattery {
		evaluateBattery(pg, rdb, userID, serial, msg.Battery, msg.Lat, msg.Lng, s)
	}

	evaluateOverspeed(pg, rdb, userID, serial, msg, s)
	evaluateIgnition(pg, rdb, userID, serial, msg, s)
	evaluateTow(pg, rdb, userID, serial, msg, s)
	evaluatePower(pg, rdb, userID, serial, msg, s)
	evaluateJamming(pg, rdb, userID, serial, msg, s)
	evaluateEvent(pg, rdb, userID, serial, msg, s)
}

/* ------------------------------------------------------------- overspeed */

func evaluateOverspeed(pg *sql.DB, rdb *redis.Client, userID int64, serial string,
	msg LocationMessageWithCSQ, s alertSettings) {

	// A zero limit is "no limit configured", not a limit of zero.
	if !s.overspeed || s.speedLimitKmh <= 0 || msg.Speed <= s.speedLimitKmh {
		return
	}

	if !claimCooldown(pg, serial, "last_overspeed_alert", overspeedCooldown) {
		return
	}

	title := fmt.Sprintf("%s is over the speed limit", serial)
	detail := fmt.Sprintf("%d km/h in a %d km/h zone", msg.Speed, s.speedLimitKmh)
	insertAlert(pg, rdb, userID, serial, "overspeed", title, detail, &msg.Lat, &msg.Lng, nil, s.silent)
}

/* --------------------------------------------------------------- ignition */

// evaluateIgnition reports the moment the key turns, not the fact that it is
// on. It also owns recording last_ignition, which the tow rule reads.
func evaluateIgnition(pg *sql.DB, rdb *redis.Client, userID int64, serial string,
	msg LocationMessageWithCSQ, s alertSettings) {

	var prev sql.NullBool
	if err := pg.QueryRow(
		"SELECT last_ignition FROM device_alert_state WHERE device_serial = $1", serial,
	).Scan(&prev); err != nil {
		log.Println("ignition state read error:", err)
		return
	}

	// Always record the current state, even when the rule is switched off:
	// turning the alert back on must not then fire on a stale baseline.
	if _, err := pg.Exec(
		"UPDATE device_alert_state SET last_ignition = $2 WHERE device_serial = $1",
		serial, msg.Ignition,
	); err != nil {
		log.Println("ignition state write error:", err)
	}

	// No prior observation: this is the baseline, not a transition.
	if !prev.Valid || prev.Bool == msg.Ignition || !s.ignition {
		return
	}

	kind, title := "ignition_off", serial+" ignition turned off"
	if msg.Ignition {
		kind, title = "ignition_on", serial+" ignition turned on"
	}

	insertAlert(pg, rdb, userID, serial, kind, title, "", &msg.Lat, &msg.Lng, nil, s.silent)
}

/* -------------------------------------------------------------------- tow */

// evaluateTow catches the vehicle moving with no ignition — a tow truck, a
// flatbed, or someone pushing it. This is the single most valuable theft
// signal the device produces, because it fires before the thief ever needs to
// start the engine.
func evaluateTow(pg *sql.DB, rdb *redis.Client, userID int64, serial string,
	msg LocationMessageWithCSQ, s alertSettings) {

	if !s.tow || msg.Ignition || msg.Speed < towSpeedKmh {
		return
	}

	if !claimCooldown(pg, serial, "last_tow_alert", towCooldown) {
		return
	}

	title := serial + " is moving with the ignition off"
	detail := fmt.Sprintf("%d km/h — the vehicle may be being towed", msg.Speed)
	insertAlert(pg, rdb, userID, serial, "tow", title, detail, &msg.Lat, &msg.Lng, nil, s.silent)
}

/* ------------------------------------------------------------------ power */

// evaluatePower detects the vehicle supply being cut while the device keeps
// reporting on its backup cell. That combination is what distinguishes a
// disconnected battery from a unit that merely went offline.
func evaluatePower(pg *sql.DB, rdb *redis.Client, userID int64, serial string,
	msg LocationMessageWithCSQ, s alertSettings) {

	// Firmware that does not report the field at all must not be read as
	// "power is off".
	if msg.ExtPower == nil {
		return
	}
	now := *msg.ExtPower

	var prev sql.NullBool
	if err := pg.QueryRow(
		"SELECT last_ext_power FROM device_alert_state WHERE device_serial = $1", serial,
	).Scan(&prev); err != nil {
		log.Println("ext_power state read error:", err)
		return
	}

	if _, err := pg.Exec(
		"UPDATE device_alert_state SET last_ext_power = $2 WHERE device_serial = $1", serial, now,
	); err != nil {
		log.Println("ext_power state write error:", err)
	}

	if !prev.Valid || prev.Bool == now || !s.powerCut {
		return
	}

	if now {
		insertAlert(pg, rdb, userID, serial, "power_restored",
			serial+" is back on vehicle power", "", &msg.Lat, &msg.Lng, nil, s.silent)
		return
	}

	insertAlert(pg, rdb, userID, serial, "power_cut",
		serial+" lost vehicle power",
		"Running on backup battery — the main supply may have been disconnected",
		&msg.Lat, &msg.Lng, nil, s.silent)
}

/* ---------------------------------------------------------------- jamming */

func evaluateJamming(pg *sql.DB, rdb *redis.Client, userID int64, serial string,
	msg LocationMessageWithCSQ, s alertSettings) {

	if !s.jamming || msg.Jamming == nil || !*msg.Jamming {
		return
	}

	if !claimCooldown(pg, serial, "last_jamming_alert", jammingCooldown) {
		return
	}

	insertAlert(pg, rdb, userID, serial, "jamming",
		serial+" is detecting signal jamming",
		"A GSM jammer may be in use nearby — positions may stop arriving",
		&msg.Lat, &msg.Lng, nil, s.silent)
}

/* ------------------------------------------------- accelerometer / panic */

// evaluateEvent handles the one-shot events the device reports alongside a
// fix: collisions, dangerous driving, and the panic button.
func evaluateEvent(pg *sql.DB, rdb *redis.Client, userID int64, serial string,
	msg LocationMessageWithCSQ, s alertSettings) {

	if msg.Event == "" {
		return
	}

	var kind, title, detail string

	switch msg.Event {
	case "impact":
		if !s.impact {
			return
		}
		kind, title = "impact", serial+" detected an impact"
		detail = "A collision-level shock was recorded"
		if msg.AccelG > 0 {
			detail = fmt.Sprintf("A shock of %.1fg was recorded", msg.AccelG)
		}

	case "harsh_accel", "harsh_brake", "harsh_corner":
		if !s.harshDriving {
			return
		}
		kind = msg.Event
		switch msg.Event {
		case "harsh_accel":
			title = serial + " accelerated harshly"
		case "harsh_brake":
			title = serial + " braked harshly"
		default:
			title = serial + " cornered harshly"
		}
		if msg.AccelG > 0 {
			detail = fmt.Sprintf("Peak %.1fg", msg.AccelG)
		}

	case "sos":
		// Deliberately not switchable. A panic button that a settings screen
		// can disable is worse than no panic button.
		kind, title = "sos", serial+" — SOS button pressed"
		detail = "The driver triggered an emergency alert"

	default:
		log.Printf("unknown device event %q from %s (ignored)", msg.Event, serial)
		return
	}

	// An SOS must make noise even when silent mode is on; that is the whole
	// point of the button.
	silent := s.silent && kind != "sos"

	insertAlert(pg, rdb, userID, serial, kind, title, detail, &msg.Lat, &msg.Lng, nil, silent)
}

/* ---------------------------------------------------------------- helpers */

// claimCooldown atomically checks and stamps a debounce column, returning true
// when the caller may fire.
//
// Check and stamp are one statement on purpose: doing them as a SELECT then an
// UPDATE lets two points arriving together both pass the check and both alert.
func claimCooldown(pg *sql.DB, serial, column string, window time.Duration) bool {
	// column is never user input — every call site passes a literal — so the
	// interpolation cannot be injected into.
	query := fmt.Sprintf(`
        UPDATE device_alert_state
        SET %s = NOW()
        WHERE device_serial = $1
          AND (%s IS NULL OR %s < NOW() - $2::interval)
        RETURNING 1`, column, column, column)

	var claimed int
	err := pg.QueryRow(query, serial, fmt.Sprintf("%d seconds", int(window.Seconds()))).Scan(&claimed)

	if err == sql.ErrNoRows {
		return false // still inside the cooldown window
	}
	if err != nil {
		log.Printf("cooldown claim error on %s: %v", column, err)
		return false
	}

	return true
}
