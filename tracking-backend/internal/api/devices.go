package api

import (
    "encoding/json"
    "net/http"
    "time"
    "tracking-backend/internal/services"
    "tracking-backend/internal/db"
    "tracking-backend/internal/models"

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
