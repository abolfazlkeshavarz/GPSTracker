package mqtt

import (
    "crypto/subtle"
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
    Heading    float64 `json:"heading,omitempty"`
    Altitude   float64 `json:"altitude,omitempty"`
    HDOP       float64 `json:"hdop,omitempty"`
    FixAgeMs   int     `json:"fix_age_ms,omitempty"`
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

    err := pg.QueryRow(
        "SELECT device_secret FROM devices WHERE serial=$1",
        loc.Device,
    ).Scan(&storedSecret)

    if err != nil {
        log.Printf("Unknown device: %s", loc.Device)
        return
    }

    // Constant-time so a broker-side attacker cannot recover a device secret
    // byte by byte from response timing.
    if subtle.ConstantTimeCompare([]byte(storedSecret), []byte(loc.Secret)) != 1 {
        log.Printf("Invalid secret for device: %s", loc.Device)
        return
    }

    services.SetDeviceOnline(loc.Device)

    // Store to PostgreSQL - Updated with battery field
    _, err = pg.Exec(`
        INSERT INTO location_history
            (device_serial, lat, lng, speed, satellites, csq, battery, ignition,
             heading, altitude, hdop, operator, fix_age_ms, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        loc.Device, loc.Lat, loc.Lng, loc.Speed, loc.Satellites, loc.CSQ, loc.Battery, loc.Ignition,
        nullFloat(loc.Heading), nullFloat(loc.Altitude), nullFloat(loc.HDOP),
        nullString(loc.Operator), nullInt(loc.FixAgeMs))
    if err != nil {
        log.Println("PG insert error:", err)
        return
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
        Timestamp:  loc.Timestamp,
        Heading:    loc.Heading,
        Altitude:   loc.Altitude,
        HDOP:       loc.HDOP,
        FixAgeMs:   loc.FixAgeMs,
    }

    // Update Redis latest location
    latestJSON, _ := json.Marshal(locationData)
    err = rdb.Set(db.Ctx, "latest:"+loc.Device, latestJSON, 24*time.Hour).Err()
    if err != nil {
        log.Println("Redis set error:", err)
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
    
    signalJSON, _ := json.Marshal(signalQuality)
    err = rdb.Set(db.Ctx, "signal:"+loc.Device, signalJSON, 24*time.Hour).Err()
    if err != nil {
        log.Println("Redis signal set error:", err)
    }

    // Publish to Redis channel for WebSocket broadcast
    rdb.Publish(db.Ctx, "device_updates", string(latestJSON))
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
