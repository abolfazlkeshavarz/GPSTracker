package mqtt

import (
	"database/sql"
	"encoding/json"
	"log"
	"strings"
	"time"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/services"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/redis/go-redis/v9"
)

var mqttClient mqtt.Client

type LocationMessageWithCSQ struct {
	Device     string  `json:"device"`
	Secret     string  `json:"secret"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	Speed      int     `json:"speed"`
	Satellites int     `json:"sat"`
	CSQ        int     `json:"csq"`
	Battery    float64 `json:"battery,omitempty"`
	Operator   string  `json:"operator,omitempty"`
	Ignition   bool    `json:"ignition,omitempty"`
	Timestamp  int64   `json:"timestamp,omitempty"`

	// Signature is an HMAC-SHA256 over device|timestamp|lat|lng, keyed with
	// the device secret (firmware rev 3+). When present it replaces sending
	// the secret itself, which previously travelled in cleartext in every
	// message.
	Signature string `json:"sig,omitempty"`

	Heading  float64 `json:"heading,omitempty"`
	Altitude float64 `json:"altitude,omitempty"`
	HDOP     float64 `json:"hdop,omitempty"`
	FixAgeMs int     `json:"fix_age_ms,omitempty"`

	// Anti-theft telemetry (firmware rev 4+). Pointers because "not reported"
	// must stay distinguishable from a reported false — an older unit that
	// never sends ext_power must not look like one whose battery was cut.
	ExtPower *bool `json:"ext_power,omitempty"`
	Jamming  *bool `json:"jamming,omitempty"`

	// Event is a one-shot accelerometer or panic event riding along with the
	// position fix: "impact", "harsh_accel", "harsh_brake", "harsh_corner",
	// "sos". AccelG is its peak magnitude in g.
	Event  string  `json:"event,omitempty"`
	AccelG float64 `json:"accel_g,omitempty"`
}

func StartSubscriber(pg *sql.DB, rdb *redis.Client, broker, user, pass, topic string) {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetUsername(user)
	opts.SetPassword(pass)
	opts.SetClientID("backend_tracker_" + time.Now().Format("20060102150405"))
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)

	// ADDED: Will message for offline status
	opts.SetWill(
		"devices/status",
		`{"status":"offline"}`,
		1,
		false,
	)

	// Resubscribe on every (re)connect. Without this the client silently stops
	// receiving locations after any broker restart, because the subscription
	// below is only ever issued once.
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		log.Println("Connected to MQTT broker:", broker)

		if token := c.Subscribe(topic, 1, func(_ mqtt.Client, msg mqtt.Message) {
			handleMessage(pg, rdb, msg.Topic(), msg.Payload())
		}); token.Wait() && token.Error() != nil {
			log.Println("MQTT subscribe error:", token.Error())
			return
		}

		log.Println("Subscribed to topic:", topic)

		// Command acknowledgements ride the same connection and must be
		// re-subscribed on every reconnect for the same reason locations are.
		subscribeAcks(c, pg)
	})

	opts.SetConnectionLostHandler(func(_ mqtt.Client, err error) {
		log.Println("MQTT connection lost:", err)
	})

	mqttClient = mqtt.NewClient(opts)

	// This runs in its own goroutine: a log.Fatal here would take the whole
	// API server down just because the broker was briefly unreachable.
	if token := mqttClient.Connect(); token.Wait() && token.Error() != nil {
		log.Println("MQTT connect error (will keep retrying):", token.Error())
	}
}

func handleMessage(pg *sql.DB, rdb *redis.Client, topic string, payload []byte) {
	var loc LocationMessageWithCSQ
	if err := json.Unmarshal(payload, &loc); err != nil {
		log.Println("JSON parse error:", err, "payload:", string(payload))
		return
	}
	parts := strings.Split(topic, "/")

	if len(parts) != 3 {
		log.Println("Invalid topic:", topic)
		return
	}

	topicDevice := parts[1]

	if topicDevice != loc.Device {
		log.Printf(
			"Topic device mismatch. Topic=%s Payload=%s",
			topicDevice,
			loc.Device,
		)
		return
	}

	log.Printf("Received location from %s: lat=%.6f, lng=%.6f, speed=%d, sat=%d, csq=%d",
		loc.Device, loc.Lat, loc.Lng, loc.Speed, loc.Satellites, loc.CSQ)

	// ADDED: Mark device online

	var storedSecret string
	var ownerUserID sql.NullInt64

	err := pg.QueryRow(
		"SELECT device_secret, user_id FROM devices WHERE serial=$1",
		loc.Device,
	).Scan(&storedSecret, &ownerUserID)

	if err != nil {
		log.Printf("Unknown device: %s", loc.Device)
		return
	}

	authMethod, err := authenticate(storedSecret, loc)
	if err != nil {
		log.Printf("Rejected point from %s: %v", loc.Device, err)
		return
	}

	// When the fix actually happened, per the device clock. A point replayed
	// out of a coverage gap must land at its real time, not at "now".
	recordedAt, isBackfill := resolveTimestamp(loc.Timestamp, time.Now().UTC())

	result, err := storePoint(pg, loc, recordedAt, isBackfill, authMethod)
	if err != nil {
		log.Println("PG insert error:", err)
		return
	}

	if !result.Stored {
		// Duplicate replay — the device re-sent a buffered point it had
		// already delivered. Expected, not an error.
		log.Printf("Duplicate point from %s at %s (ignored)",
			loc.Device, recordedAt.Format(time.RFC3339))
		return
	}

	if isBackfill {
		log.Printf("Backfilled point from %s: recorded %s, %s late",
			loc.Device, recordedAt.Format(time.RFC3339),
			time.Since(recordedAt).Round(time.Second))
	}

	// Only a point that is actually current means the device is online. A
	// replayed point from an hour ago says nothing about right now.
	//
	// Alerts are evaluated on live points only, for the same reason backfill
	// never touches the "latest" key: a geofence crossing or a low-battery
	// reading forty minutes in the past is not something a user should be
	// paged about right now.
	if !isBackfill {
		services.SetDeviceOnline(loc.Device)

		// Fold the fix into the lifetime distance total. Live points only: a
		// backfilled point is out of chronological order, so measuring its
		// hop from the last-counted position would zig-zag the odometer.
		if err := services.UpdateOdometer(pg, loc.Device, loc.Lat, loc.Lng, recordedAt); err != nil {
			log.Println("odometer update error:", err)
		}

		if ownerUserID.Valid {
			evaluateAlerts(pg, rdb, ownerUserID.Int64, loc.Device, loc)
		}
	}

	// Prepare location for Redis
	locationData := models.LocationMessage{
		Device:     loc.Device,
		Lat:        loc.Lat,
		Lng:        loc.Lng,
		Speed:      loc.Speed,
		Satellites: loc.Satellites,
		CSQ:        loc.CSQ,
		Battery:    loc.Battery,
		Operator:   loc.Operator,
		Ignition:   loc.Ignition,
		Timestamp:  recordedAt.Unix(),
		Heading:    loc.Heading,
		Altitude:   loc.Altitude,
		HDOP:       loc.HDOP,
		FixAgeMs:   loc.FixAgeMs,
	}

	latestJSON, _ := json.Marshal(locationData)

	// A backfilled point is older than what the dashboard already shows.
	// Writing it to the "latest" key would drag the live marker backwards to
	// a position the vehicle left long ago, so it is stored in history only.
	if !isBackfill {
		if err := rdb.Set(db.Ctx, "latest:"+loc.Device, latestJSON, 24*time.Hour).Err(); err != nil {
			log.Println("Redis set error:", err)
		}
	}

	// Update signal quality in Redis
	gpsBars := calculateGPSBars(loc.Satellites)
	gprsBars := calculateGPRSBars(loc.CSQ)

	signalQuality := models.SignalQuality{
		DeviceSerial: loc.Device,
		GPSBars:      gpsBars,
		GPRSBars:     gprsBars,
		Satellites:   loc.Satellites,
		CSQ:          loc.CSQ,
		UpdatedAt:    time.Now(),
	}

	if !isBackfill {
		signalJSON, _ := json.Marshal(signalQuality)
		if err := rdb.Set(db.Ctx, "signal:"+loc.Device, signalJSON, 24*time.Hour).Err(); err != nil {
			log.Println("Redis signal set error:", err)
		}

		// Only live points are broadcast: pushing backfill over the WebSocket
		// would make the map jump between past and present.
		rdb.Publish(db.Ctx, "device_updates", string(latestJSON))
	}
}

// Older firmware omits these fields entirely. Storing NULL rather than 0
// keeps "not reported" distinguishable from "reported as zero" -- a real
// distinction for heading, where 0 means due north.
func nullFloat(v float64) interface{} {
	if v == 0 {
		return nil
	}
	return v
}

func nullString(v string) interface{} {
	if v == "" {
		return nil
	}
	return v
}

func nullInt(v int) interface{} {
	if v == 0 {
		return nil
	}
	return v
}

func calculateGPSBars(satellites int) int {
	if satellites >= 8 {
		return 5
	} else if satellites >= 6 {
		return 4
	} else if satellites >= 4 {
		return 3
	} else if satellites >= 2 {
		return 2
	} else if satellites >= 1 {
		return 1
	}
	return 0
}

func calculateGPRSBars(csq int) int {
	if csq == 99 { // Unknown/not detectable
		return 0
	}
	if csq >= 20 {
		return 5
	} else if csq >= 15 {
		return 4
	} else if csq >= 10 {
		return 3
	} else if csq >= 5 {
		return 2
	} else if csq >= 2 {
		return 1
	}
	return 0
}

func StopSubscriber() {
	if mqttClient != nil && mqttClient.IsConnected() {
		mqttClient.Disconnect(250)
		log.Println("Disconnected from MQTT broker")
	}
}
