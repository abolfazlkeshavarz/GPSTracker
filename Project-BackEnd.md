# FINAL PROJECT STRUCTURE

```md
GPSTracker
│────tracking-frontend/
│
│────tracking-backend/
│    ├── cmd/
│    │   └── server/
│    │       └── main.go
│    │
│    ├── internal/
│    │   ├── api/
│    │   │   ├── auth.go
│    │   │   ├── devices.go
│    │   │   ├── middleware.go
│    │   │   ├── router.go
│    │   │   └── websocket.go
│    │   │
│    │   ├── config/
│    │   │   ├── config.go
│    │   │   └── global.go
│    │   │
│    │   ├── db/
│    │   │   ├── postgres.go
│    │   │   └── redis.go
│    │   │
│    │   ├── models/
│    │   │   └── models.go
│    │   │
│    │   ├── mqtt/
│    │   │   └── subscriber.go
│    │   │
│    │   ├── services/
│    │   │   └── device_status.go
│    │   │
│    │   └── utils/
│    │       ├── jwt.go
│    │       ├── logger.go
│    │       └── password.go
│    │
│    ├── scripts/
│    │   └── init.sql
│    │
│    ├── .env
│    ├── go.mod
│    └── go.sum

```

## 1. `go.mod`

```go
module tracking-backend

go 1.25.0

require (
	github.com/eclipse/paho.mqtt.golang v1.5.1
	github.com/gin-gonic/gin v1.12.0
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/gorilla/websocket v1.5.3
	github.com/joho/godotenv v1.5.1
	github.com/lib/pq v1.12.3
	github.com/redis/go-redis/v9 v9.19.0
	github.com/rs/zerolog v1.33.0
	golang.org/x/crypto v0.51.0
)

require (
	github.com/bytedance/gopkg v0.1.3 // indirect
	github.com/bytedance/sonic v1.15.0 // indirect
	github.com/bytedance/sonic/loader v0.5.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/cloudwego/base64x v0.1.6 // indirect
	github.com/gabriel-vasile/mimetype v1.4.12 // indirect
	github.com/gin-contrib/sse v1.1.0 // indirect
	github.com/go-playground/locales v0.14.1 // indirect
	github.com/go-playground/universal-translator v0.18.1 // indirect
	github.com/go-playground/validator/v10 v10.30.1 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/goccy/go-yaml v1.19.2 // indirect
	github.com/json-iterator/go v1.1.12 // indirect
	github.com/klauspost/cpuid/v2 v2.3.0 // indirect
	github.com/leodido/go-urn v1.4.0 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/pelletier/go-toml/v2 v2.2.4 // indirect
	github.com/quic-go/qpack v0.6.0 // indirect
	github.com/quic-go/quic-go v0.59.0 // indirect
	github.com/twitchyliquid64/golang-asm v0.15.1 // indirect
	github.com/ugorji/go/codec v1.3.1 // indirect
	go.mongodb.org/mongo-driver/v2 v2.5.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/arch v0.22.0 // indirect
	golang.org/x/net v0.53.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.44.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	google.golang.org/protobuf v1.36.10 // indirect
)

```



## 2.  `internal/config/global.go`

```go
package config

var AppConfig *Config
```



## 3.  `internal/api/auth.go`


```go
package api

import (
    "database/sql"
    "net/http"

    "tracking-backend/internal/db"
    "tracking-backend/internal/models"
    "tracking-backend/internal/utils"
    "tracking-backend/internal/config"
    "github.com/gin-gonic/gin"
)

func Register(c *gin.Context) {
    var req models.RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if user already exists
    var exists bool
    err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE phone=$1)", req.Phone).Scan(&exists)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    if exists {
        c.JSON(http.StatusConflict, gin.H{"error": "User already exists"})
        return
    }

    // Hash password
    hashedPassword, err := utils.HashPassword(req.Password)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error hashing password"})
        return
    }

    // Insert user and return all fields including created_at
    var user models.User
    err = db.DB.QueryRow(`
        INSERT INTO users (phone, password_hash) 
        VALUES ($1, $2) 
        RETURNING id, phone, created_at`,
        req.Phone, hashedPassword,
    ).Scan(&user.ID, &user.Phone, &user.CreatedAt)
    
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error creating user"})
        return
    }

    c.JSON(http.StatusCreated, gin.H{
        "message": "User registered successfully",
        "user": user,
    })
}

func Login(c *gin.Context) {
    var req models.LoginRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Get user from database - ADD created_at to SELECT
    var user models.User
    err := db.DB.QueryRow(`
        SELECT id, phone, password_hash, created_at 
        FROM users 
        WHERE phone = $1`,
        req.Phone,
    ).Scan(&user.ID, &user.Phone, &user.PasswordHash, &user.CreatedAt)
    
    if err != nil {
        if err == sql.ErrNoRows {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        }
        return
    }

    // Check password
    if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        return
    }

    // Generate JWT token
    token, err := utils.GenerateJWT(
        user.ID,
        config.AppConfig.JWTSecret,
        config.AppConfig.JWTExpiryHours,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error generating token"})
        return
    }

    // Return user without password hash
    c.JSON(http.StatusOK, models.LoginResponse{
        Token: token,
        User:  user,
    })
}

func ActivateDevice(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }

    var req models.ActivateDeviceRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if device is already activated by another user
    var existingUserID sql.NullInt64
    err := db.DB.QueryRow("SELECT user_id FROM devices WHERE serial=$1", req.Serial).Scan(&existingUserID)
    if err != nil && err != sql.ErrNoRows {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    if existingUserID.Valid && int(existingUserID.Int64) != userID.(int) {
        c.JSON(http.StatusConflict, gin.H{"error": "Device already activated by another user"})
        return
    }

    // Activate device for user
    _, err = db.DB.Exec(
        "INSERT INTO devices (serial, user_id, device_secret) VALUES ($1, $2, $3) ON CONFLICT (serial) DO UPDATE SET user_id=$2, device_secret=$3",
        req.Serial, userID, req.Secret,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error activating device"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"message": "Device activated successfully"})
}

func GetUserDevices(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }

    rows, err := db.DB.Query(`
        SELECT serial, activated_at 
        FROM devices 
        WHERE user_id=$1 
        ORDER BY activated_at DESC`,
        userID,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    devices := []models.Device{}
    for rows.Next() {
        var device models.Device
        if err := rows.Scan(&device.Serial, &device.ActivatedAt); err != nil {
            continue
        }
        device.UserID = userID.(int)
        devices = append(devices, device)
    }

    c.JSON(http.StatusOK, gin.H{"devices": devices})
}
```

## 4.  `internal/services/device_status.go`

```go
package services

import (
    "fmt"
    "time"

    "tracking-backend/internal/db"
)

func SetDeviceOnline(serial string) error {
    key := fmt.Sprintf("device_status:%s", serial)
    return db.RedisClient.Set(
        db.Ctx,
        key,
        "online",
        60*time.Second,
    ).Err()
}

func IsDeviceOnline(serial string) bool {
    key := fmt.Sprintf("device_status:%s", serial)
    result, err := db.RedisClient.Get(db.Ctx, key).Result()
    if err != nil {
        return false
    }
    return result == "online"
}
```

## 5.  `internal/mqtt/subscriber.go`

```go
package mqtt

import (
    "database/sql"
    "encoding/json"
    "log"
    "time"
    "strings"
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
        handleMessage(pg, rdb, msg.Topic(), msg.Payload())
    }); token.Wait() && token.Error() != nil {
        log.Fatal("MQTT subscribe error:", token.Error())
    }
    log.Println("Subscribed to topic:", topic)
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

    if storedSecret != loc.Secret {
        log.Printf("Invalid secret for device: %s", loc.Device)
        return
    }

    services.SetDeviceOnline(loc.Device)

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

```

## 6.  `internal/api/devices.go`


```go
package api

import (
    "encoding/json"
    "net/http"
    "time"

    "tracking-backend/internal/db"
    "tracking-backend/internal/models"
    "tracking-backend/internal/services"

    "github.com/gin-gonic/gin"
    "github.com/redis/go-redis/v9"
)

func GetLatestLocation(c *gin.Context) {
    userID := c.GetInt("user_id")
    serial := c.Param("serial")

    // Verify user owns this device
    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    // Try Redis first
    val, err := db.RedisClient.Get(db.Ctx, "latest:"+serial).Result()
    if err == nil {
        // Found in Redis
        var location models.LocationMessage
        if err := json.Unmarshal([]byte(val), &location); err == nil {
            c.JSON(http.StatusOK, location)
            return
        }
    } else if err != redis.Nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Redis error"})
        return
    }

    // Fallback to PostgreSQL
    var location models.LocationMessage
    var recordedAt time.Time
    err = db.DB.QueryRow(`
        SELECT lat, lng, speed, satellites, csq, recorded_at 
        FROM location_history 
        WHERE device_serial=$1 
        ORDER BY recorded_at DESC 
        LIMIT 1`,
        serial,
    ).Scan(&location.Lat, &location.Lng, &location.Speed, &location.Satellites, &location.CSQ, &recordedAt)
    
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "No location data found"})
        return
    }
    location.Device = serial

    c.JSON(http.StatusOK, location)
}

func GetLocationHistory(c *gin.Context) {
    userID := c.GetInt("user_id")
    serial := c.Param("serial")
    limit := c.DefaultQuery("limit", "100")
    hours := c.DefaultQuery("hours", "24")

    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    rows, err := db.DB.Query(`
        SELECT lat, lng, speed, satellites, csq, recorded_at 
        FROM location_history 
        WHERE device_serial=$1 
        AND recorded_at > NOW() - ($2 || ' hours')::INTERVAL
        ORDER BY recorded_at DESC 
        LIMIT $3`,
        serial, hours, limit,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    var history []models.LocationHistory
    for rows.Next() {
        var loc models.LocationHistory
        if err := rows.Scan(&loc.Lat, &loc.Lng, &loc.Speed, &loc.Satellites, &loc.CSQ, &loc.RecordedAt); err != nil {
            continue
        }
        loc.DeviceSerial = serial
        history = append(history, loc)
    }

    c.JSON(http.StatusOK, gin.H{"history": history})
}

func GetSignalQuality(c *gin.Context) {
    userID := c.GetInt("user_id")
    serial := c.Param("serial")

    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    // Try Redis first
    val, err := db.RedisClient.Get(db.Ctx, "signal:"+serial).Result()
    if err == nil {
        var signal models.SignalQuality
        if err := json.Unmarshal([]byte(val), &signal); err == nil {
            c.JSON(http.StatusOK, signal)
            return
        }
    }

    // Fallback to latest location from PostgreSQL
    var satellites, csq int
    var updatedAt time.Time
    err = db.DB.QueryRow(`
        SELECT satellites, csq, recorded_at 
        FROM location_history 
        WHERE device_serial=$1 
        ORDER BY recorded_at DESC 
        LIMIT 1`,
        serial,
    ).Scan(&satellites, &csq, &updatedAt)

    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "No signal data found"})
        return
    }

    signal := models.SignalQuality{
        DeviceSerial: serial,
        Satellites:   satellites,
        CSQ:          csq,
        UpdatedAt:    updatedAt,
    }

    c.JSON(http.StatusOK, signal)
}

// NEW FUNCTION - GetDeviceStatus
func GetDeviceStatus(c *gin.Context) {
    userID := c.GetInt("user_id")
    serial := c.Param("serial")

    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{
            "error": "Access denied",
        })
        return
    }

    online := services.IsDeviceOnline(serial)

    c.JSON(http.StatusOK, gin.H{
        "device": serial,
        "online": online,
    })
}

func deviceBelongsToUser(userID int, serial string) bool {
    var exists bool
    err := db.DB.QueryRow(`
        SELECT EXISTS(
            SELECT 1 FROM devices 
            WHERE serial=$1 AND user_id=$2
        )`,
        serial, userID,
    ).Scan(&exists)
    return err == nil && exists
}
```

## 7.  `internal/api/websocket.go`


```go
package api

import (
    "encoding/json"
    "log"
    "net/http"

    "tracking-backend/internal/db"
    "tracking-backend/internal/config"
    "tracking-backend/internal/utils"
    "github.com/gin-gonic/gin"
    "github.com/gorilla/websocket"
    //"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,

    CheckOrigin: func(r *http.Request) bool {

        origin := r.Header.Get("Origin")

        allowedOrigins := map[string]bool{
            "http://localhost": true,
            "http://localhost:80": true,
            "http://127.0.0.1": true,
            "http://127.0.0.1:80": true,
            "http://localhost:3000": true,
            "http://localhost:5173": true,
        }

        // allow empty origin for mobile apps / Postman
        if origin == "" {
            return true
        }

        return allowedOrigins[origin]
    },
}
func HandleWebSocket(c *gin.Context) {
    
    token := c.Query("token")

    if token == "" {
        c.JSON(http.StatusUnauthorized, gin.H{
            "error": "missing token",
        })
        return
    }

    claims, err := utils.ValidateJWT(
        token,
        config.AppConfig.JWTSecret,
    )

    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{
            "error": "invalid token",
        })
        return
    }

    userID := claims.UserID
    
    // Get user's devices
    rows, err := db.DB.Query(`
        SELECT serial FROM devices WHERE user_id=$1`,
        userID,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    userDevices := make(map[string]bool)
    for rows.Next() {
        var serial string
        if err := rows.Scan(&serial); err == nil {
            userDevices[serial] = true
        }
    }

    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        log.Println("WebSocket upgrade error:", err)
        return
    }
    defer conn.Close()

    log.Printf("User %d connected via WebSocket", userID)

    // Subscribe to Redis channel
    pubsub := db.RedisClient.Subscribe(db.Ctx, "device_updates")
    defer pubsub.Close()

    ch := pubsub.Channel()

    // Send initial connection confirmation
    conn.WriteJSON(gin.H{"type": "connected", "message": "WebSocket connected"})

    for {
        select {
        case msg := <-ch:
            // Parse message to check if it belongs to user's devices
            var location map[string]interface{}
            if err := json.Unmarshal([]byte(msg.Payload), &location); err == nil {
                if device, ok := location["device"].(string); ok {
                    if userDevices[device] {
                        if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
                            log.Println("WebSocket write error:", err)
                            return
                        }
                    }
                }
            }
        }
    }
}

func HandleDeviceWebSocket(c *gin.Context) {
    serial := c.Param("serial")
    userID := c.GetInt("user_id")

    // Verify ownership
    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        log.Println("WebSocket upgrade error:", err)
        return
    }
    defer conn.Close()

    log.Printf("User %d subscribed to device %s via WebSocket", userID, serial)

    // Subscribe to specific device updates
    pubsub := db.RedisClient.Subscribe(db.Ctx, "device_updates")
    defer pubsub.Close()

    ch := pubsub.Channel()

    for {
        select {
        case msg := <-ch:
            var location map[string]interface{}
            if err := json.Unmarshal([]byte(msg.Payload), &location); err == nil {
                if device, ok := location["device"].(string); ok && device == serial {
                    if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
                        log.Println("WebSocket write error:", err)
                        return
                    }
                }
            }
        }
    }
}
```

## 8.  `internal/api/router.go`

```go
package api

import (
    "tracking-backend/internal/config"

    "github.com/gin-gonic/gin"
)

func SetupRouter(cfg *config.Config) *gin.Engine {
    router := gin.Default()

    // CORS middleware (for web/mobile apps)
    router.Use(func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }

        c.Next()
    })

    // Public routes
    router.POST("/api/register", Register)
    router.POST("/api/login", Login)

    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    // Protected routes
    authorized := router.Group("/api")
    authorized.Use(AuthMiddleware(cfg.JWTSecret))
    {
        // Device management
        authorized.POST("/activate", ActivateDevice)
        authorized.GET("/devices", GetUserDevices)
        authorized.GET("/devices/:serial/latest", GetLatestLocation)
        authorized.GET("/devices/:serial/history", GetLocationHistory)
        authorized.GET("/devices/:serial/signal", GetSignalQuality)
        
        // NEW ROUTE - Device status
        authorized.GET("/devices/:serial/status", GetDeviceStatus)
        
        // WebSocket connections
        authorized.GET("/ws", HandleWebSocket)
        authorized.GET("/ws/device/:serial", HandleDeviceWebSocket)
    }

    return router
}
```

## 9.  `internal/models/models.go`


```go
package models

import (
    "time"
)

type User struct {
    ID           int       `json:"id"`
    Phone        string    `json:"phone"`
    PasswordHash string    `json:"-"`
    CreatedAt    time.Time `json:"created_at"`
}

type Device struct {
    Serial      string    `json:"serial"`
    UserID      int       `json:"user_id"`
    ActivatedAt time.Time `json:"activated_at"`
}

type LocationMessage struct {
    Device     string  `json:"device"`
    Lat        float64 `json:"lat"`
    Lng        float64 `json:"lng"`
    Speed      int     `json:"speed"`
    Satellites int     `json:"sat"`
    CSQ        int     `json:"csq,omitempty"`

    // NEW FIELDS
    Battery    float64 `json:"battery,omitempty"`
    Operator   string  `json:"operator,omitempty"`
    Ignition   bool    `json:"ignition,omitempty"`
    Timestamp  int64   `json:"timestamp,omitempty"`
}

type LocationHistory struct {
    ID           int64     `json:"id"`
    DeviceSerial string    `json:"device_serial"`
    Lat          float64   `json:"lat"`
    Lng          float64   `json:"lng"`
    Speed        int       `json:"speed"`
    Satellites   int       `json:"satellites"`
    CSQ          int       `json:"csq"`
    Battery      float64   `json:"battery"`
    RecordedAt   time.Time `json:"recorded_at"`
}

type SignalQuality struct {
    DeviceSerial string    `json:"device_serial"`
    GPSBars      int       `json:"gps_bars"`   // 0-5 based on satellites
    GPRSBars     int       `json:"gprs_bars"`  // 0-5 based on CSQ
    Satellites   int       `json:"satellites"`
    CSQ          int       `json:"csq"`
    UpdatedAt    time.Time `json:"updated_at"`
}

type RegisterRequest struct {
    Phone    string `json:"phone" binding:"required"`
    Password string `json:"password" binding:"required,min=6"`
}

type LoginRequest struct {
    Phone    string `json:"phone" binding:"required"`
    Password string `json:"password" binding:"required"`
}

type ActivateDeviceRequest struct {
    Serial string `json:"serial" binding:"required"`
    Secret string `json:"secret" binding:"required"`
}

type LoginResponse struct {
    Token string `json:"token"`
    User  User   `json:"user"`
}
```

## 10.  `internal/utils/logger.go`

```go
package utils

import (
    "os"

    "github.com/rs/zerolog"
)

var Logger zerolog.Logger

func InitLogger() {
    Logger = zerolog.New(os.Stdout).
        With().
        Timestamp().
        Logger()
}
```

## 11.  `cmd/server/main.go`

```go
package main

import (
    "log"
    "os"
    "os/signal"
    "syscall"

    "tracking-backend/internal/api"
    "tracking-backend/internal/config"
    "tracking-backend/internal/db"
    "tracking-backend/internal/mqtt"
    "tracking-backend/internal/utils"
)

func main() {
    // Load configuration
    cfg := config.Load()

    // SET GLOBAL CONFIG
    config.AppConfig = cfg

    // Initialize logger
    utils.InitLogger()

    // Initialize PostgreSQL
    if err := db.InitPostgres(cfg.PostgresDSN()); err != nil {
        log.Fatal("Failed to initialize PostgreSQL:", err)
    }
    defer db.ClosePostgres()

    // Initialize Redis
    if err := db.InitRedis(cfg.RedisAddr(), cfg.RedisPassword); err != nil {
        log.Fatal("Failed to initialize Redis:", err)
    }
    defer db.CloseRedis()

    // Start MQTT subscriber in background
    go mqtt.StartSubscriber(db.DB, db.RedisClient, cfg.MQTTBroker, cfg.MQTTUser, cfg.MQTTPassword, cfg.MQTTTopic)
    defer mqtt.StopSubscriber()

    // Setup and start HTTP server
    router := api.SetupRouter(cfg)

    // Start server in goroutine
    go func() {
        log.Printf("Server starting on port %s", cfg.ServerPort)
        if err := router.Run(":" + cfg.ServerPort); err != nil {
            log.Fatal("Failed to start server:", err)
        }
    }()

    // Wait for interrupt signal to gracefully shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("Shutting down server...")
}
```
## 12. `internal/api/middleware.go`
```go
package api

import (
    "net/http"
    "strings"

    "tracking-backend/internal/utils"

    "github.com/gin-gonic/gin"
)

func AuthMiddleware(secret []byte) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
            c.Abort()
            return
        }

        // Bearer <token>
        parts := strings.SplitN(authHeader, " ", 2)
        if len(parts) != 2 || parts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
            c.Abort()
            return
        }

        claims, err := utils.ValidateJWT(parts[1], secret)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
            c.Abort()
            return
        }

        c.Set("user_id", claims.UserID)
        c.Next()
    }
}
```
## 13. `internal/config/config.go`
```go
package config

import (
    "log"
    "os"
    "strconv"

    "github.com/joho/godotenv"
)

type Config struct {
    // PostgreSQL
    DBHost     string
    DBPort     string
    DBUser     string
    DBPassword string
    DBName     string

    // Redis
    RedisHost     string
    RedisPort     string
    RedisPassword string

    // MQTT
    MQTTBroker   string
    MQTTUser     string
    MQTTPassword string
    MQTTTopic    string

    // JWT
    JWTSecret      []byte
    JWTExpiryHours int

    // Server
    ServerPort string
}

func Load() *Config {
    // Load .env file if it exists
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found, using environment variables")
    }

    jwtExpiryHours, _ := strconv.Atoi(getEnv("JWT_EXPIRY_HOURS", "72"))

    return &Config{
        // PostgreSQL
        DBHost:     getEnv("DB_HOST", "localhost"),
        DBPort:     getEnv("DB_PORT", "5432"),
        DBUser:     getEnv("DB_USER", "postgres"),
        DBPassword: getEnv("DB_PASSWORD", "admin"),
        DBName:     getEnv("DB_NAME", "GPSTracker"),

        // Redis
        RedisHost:     getEnv("REDIS_HOST", "localhost"),
        RedisPort:     getEnv("REDIS_PORT", "6379"),
        RedisPassword: getEnv("REDIS_PASSWORD", ""),

        // MQTT
        MQTTBroker:   getEnv("MQTT_BROKER", "tcp://85.9.123.30:1883"),
        MQTTUser:     getEnv("MQTT_USER", "testquitto"),
        MQTTPassword: getEnv("MQTT_PASSWORD", "admin"),
        MQTTTopic:    getEnv("MQTT_TOPIC", "devices/+/location"),

        // JWT
        JWTSecret:      []byte(getEnv("JWT_SECRET", "Whoknowwho!!11Whoknowwho!!11")),
        JWTExpiryHours: jwtExpiryHours,

        // Server
        ServerPort: getEnv("SERVER_PORT", "8080"),
    }
}

func (c *Config) PostgresDSN() string {
    return "host=" + c.DBHost +
        " port=" + c.DBPort +
        " user=" + c.DBUser +
        " password=" + c.DBPassword +
        " dbname=" + c.DBName +
        " sslmode=disable"
}

func (c *Config) RedisAddr() string {
    return c.RedisHost + ":" + c.RedisPort
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}
```
## 14. `internal/db/postgres.go`
```go
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
```
## 15. `internal/db/redis.go`
```go
package db

import (
    "context"
    "log"

    "github.com/redis/go-redis/v9"
)

var RedisClient *redis.Client
var Ctx = context.Background()

func InitRedis(addr, password string) error {
    RedisClient = redis.NewClient(&redis.Options{
        Addr:     addr,
        Password: password,
        DB:       0,
    })

    // Test connection
    if err := RedisClient.Ping(Ctx).Err(); err != nil {
        return err
    }

    log.Println("Connected to Redis")
    return nil
}

func CloseRedis() {
    if RedisClient != nil {
        RedisClient.Close()
    }
}
```
## 16. `internal/utils/jwt.go`
```go
package utils

import (
    "errors"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID int `json:"user_id"`
    jwt.RegisteredClaims
}

func GenerateJWT(userID int, secret []byte, expiryHours int) (string, error) {
    claims := Claims{
        UserID: userID,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(expiryHours) * time.Hour)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(secret)
}

func ValidateJWT(tokenString string, secret []byte) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        return secret, nil
    })

    if err != nil {
        return nil, err
    }

    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }

    return nil, errors.New("invalid token")
}
```
## 17. `internal/utils/password.go`
```go
package utils

import "golang.org/x/crypto/bcrypt"

func HashPassword(password string) (string, error) {
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```



## 18.  `scripts/init.sql`

```sql
-- Create database
CREATE DATABASE tracking_db;

-- Connect to database
\c tracking_db;

-- Create tables
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE;
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    serial VARCHAR(50) PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    device_secret TEXT NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS location_history (
    id BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    csq INTEGER DEFAULT 0,
    battery DOUBLE PRECISION DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_history_device_time 
    ON location_history(device_serial, recorded_at DESC);
    
CREATE INDEX IF NOT EXISTS idx_location_history_recorded_at 
    ON location_history(recorded_at DESC);

-- Optional: Create a view for easy access to latest locations
CREATE OR REPLACE VIEW latest_locations AS
SELECT DISTINCT ON (device_serial) 
    device_serial,
    lat,
    lng,
    speed,
    satellites,
    csq,
    battery,
    recorded_at
FROM location_history
ORDER BY device_serial, recorded_at DESC;
```

## 19. `.env`

```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=admin
DB_NAME=tracking_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MQTT
MQTT_BROKER=tcp://85.9.123.30:1883
MQTT_USER=testquitto
MQTT_PASSWORD=admin
MQTT_TOPIC=devices/+/location

# JWT
JWT_SECRET=CHANGE_THIS_SECRET_NOW
JWT_EXPIRY_HOURS=72

# Server
SERVER_PORT=8080

# Environment
APP_ENV=development
```
## To Run After Updates:

```bash
# Clean and download dependencies
go mod tidy
go mod download

# Recreate database (if needed)
dropdb tracking_db
createdb tracking_db
psql -U postgres -d tracking_db -f scripts/init.sql

# Run the server
go run cmd/server/main.go
```
