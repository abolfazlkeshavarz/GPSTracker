package mqtt

import (
    "database/sql"
    "encoding/json"
    "log"
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
    Lat        float64 `json:"lat"`
    Lng        float64 `json:"lng"`
    Speed      int     `json:"speed"`
    Satellites int     `json:"sat"`
    CSQ        int     `json:"csq"`
    Battery    float64 `json:"battery,omitempty"`
    Operator   string  `json:"operator,omitempty"`
    Ignition   bool    `json:"ignition,omitempty"`
    Timestamp  int64   `json:"timestamp,omitempty"`
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

    mqttClient = mqtt.NewClient(opts)
    if token := mqttClient.Connect(); token.Wait() && token.Error() != nil {
        log.Fatal("MQTT connect error:", token.Error())
    }
    log.Println("Connected to MQTT broker:", broker)

    if token := mqttClient.Subscribe(topic, 1, func(c mqtt.Client, msg mqtt.Message) {
        handleMessage(pg, rdb, msg.Payload())
    }); token.Wait() && token.Error() != nil {
        log.Fatal("MQTT subscribe error:", token.Error())
    }
    log.Println("Subscribed to topic:", topic)
}

func handleMessage(pg *sql.DB, rdb *redis.Client, payload []byte) {
    var loc LocationMessageWithCSQ
    if err := json.Unmarshal(payload, &loc); err != nil {
        log.Println("JSON parse error:", err, "payload:", string(payload))
        return
    }

    log.Printf("Received location from %s: lat=%.6f, lng=%.6f, speed=%d, sat=%d, csq=%d",
        loc.Device, loc.Lat, loc.Lng, loc.Speed, loc.Satellites, loc.CSQ)

    // ADDED: Mark device online
    services.SetDeviceOnline(loc.Device)

    // Check if device exists in database
    var exists bool
    err := pg.QueryRow("SELECT EXISTS(SELECT 1 FROM devices WHERE serial=$1)", loc.Device).Scan(&exists)
    if err != nil {
        log.Println("Error checking device existence:", err)
        return
    }

    if !exists {
        log.Printf("Device %s not activated, skipping storage", loc.Device)
        return
    }

    // Store to PostgreSQL - Updated with battery field
    _, err = pg.Exec(`
        INSERT INTO location_history (device_serial, lat, lng, speed, satellites, csq, battery, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        loc.Device, loc.Lat, loc.Lng, loc.Speed, loc.Satellites, loc.CSQ, loc.Battery)
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
