package api

import (
    "database/sql"
    "encoding/json"
    "errors"
    "net/http"
    "strings"
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

    // Bad input used to reach Postgres verbatim and surface as a 500.
    limit := clampedIntQuery(c, "limit", 100, 1, 1000)
    hours := clampedIntQuery(c, "hours", 24, 1, 24*365)

    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    rows, err := db.DB.Query(`
        SELECT lat, lng, speed, satellites, csq, recorded_at
        FROM location_history
        WHERE device_serial=$1
        AND recorded_at > NOW() - make_interval(hours => $2)
        ORDER BY recorded_at DESC
        LIMIT $3`,
        serial, hours, limit,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    // Initialised so an empty result serialises as [] rather than null.
    history := []models.LocationHistory{}
    for rows.Next() {
        var loc models.LocationHistory
        if err := rows.Scan(&loc.Lat, &loc.Lng, &loc.Speed, &loc.Satellites, &loc.CSQ, &loc.RecordedAt); err != nil {
            continue
        }
        loc.DeviceSerial = serial
        history = append(history, loc)
    }

    if err := rows.Err(); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"history": history})
}

// maxTrackPoints bounds a single track response. At the firmware's 30-second
// reporting interval this is a little over three days of continuous driving.
const maxTrackPoints = 20000

// GetDeviceTrack returns the movement history for an explicit date range,
// together with the stops detected inside it.
//
// GET /api/devices/:serial/track?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z
//
// `from` and `to` accept either RFC3339 or a plain YYYY-MM-DD date. Omitting
// them falls back to the last 24 hours.
func GetDeviceTrack(c *gin.Context) {
    userID := c.GetInt("user_id")
    serial := c.Param("serial")

    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    to, err := parseTimeParam(c.Query("to"), time.Now(), true)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'to' date: " + err.Error()})
        return
    }

    from, err := parseTimeParam(c.Query("from"), to.Add(-24*time.Hour), false)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'from' date: " + err.Error()})
        return
    }

    if !from.Before(to) {
        c.JSON(http.StatusBadRequest, gin.H{"error": "'from' must be earlier than 'to'"})
        return
    }

    if to.Sub(from) > 366*24*time.Hour {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Range must not exceed 366 days"})
        return
    }

    opts := services.TrackOptions{
        StopRadiusMeters: float64(clampedIntQuery(c, "stop_radius", int(services.DefaultStopRadiusMeters), 10, 1000)),
        MinStopSeconds:   clampedIntQuery(c, "min_stop", services.DefaultMinStopSeconds, 30, 24*3600),
    }

    // Ascending, so the points can be drawn as a path without re-sorting.
    // One extra row is requested to detect truncation.
    rows, err := db.DB.Query(`
        SELECT lat, lng, speed, satellites, csq, battery, ignition,
               heading, altitude, hdop, recorded_at
        FROM location_history
        WHERE device_serial = $1
          AND recorded_at >= $2
          AND recorded_at <= $3
        ORDER BY recorded_at ASC
        LIMIT $4`,
        serial, from, to, maxTrackPoints+1,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    points := []models.TrackPoint{}
    for rows.Next() {
        var p models.TrackPoint
        var battery, heading, altitude, hdop sql.NullFloat64
        var ignition sql.NullBool

        if err := rows.Scan(&p.Lat, &p.Lng, &p.Speed, &p.Satellites,
            &p.CSQ, &battery, &ignition,
            &heading, &altitude, &hdop, &p.RecordedAt); err != nil {
            continue
        }

        if battery.Valid {
            p.Battery = battery.Float64
        }
        if ignition.Valid {
            v := ignition.Bool
            p.Ignition = &v
        }
        // Left nil when the firmware did not report them, so the client can
        // tell "not reported" from a genuine zero.
        if heading.Valid {
            v := heading.Float64
            p.Heading = &v
        }
        if altitude.Valid {
            v := altitude.Float64
            p.Altitude = &v
        }
        if hdop.Valid {
            v := hdop.Float64
            p.HDOP = &v
        }

        points = append(points, p)
    }

    if err := rows.Err(); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }

    truncated := len(points) > maxTrackPoints
    if truncated {
        points = points[:maxTrackPoints]
    }

    stops, summary := services.BuildTrack(points, opts)

    c.JSON(http.StatusOK, models.TrackResponse{
        Device:    serial,
        From:      from,
        To:        to,
        Points:    points,
        Stops:     stops,
        Summary:   summary,
        Truncated: truncated,
    })
}

// parseTimeParam accepts RFC3339 or a bare YYYY-MM-DD date.
//
// A bare date is interpreted in the server's local zone. endOfDay pushes it to
// 23:59:59.999 so that `to=2026-01-31` includes everything recorded that day,
// which is what a user picking a date range expects.
func parseTimeParam(raw string, fallback time.Time, endOfDay bool) (time.Time, error) {
    raw = strings.TrimSpace(raw)
    if raw == "" {
        return fallback, nil
    }

    if t, err := time.Parse(time.RFC3339, raw); err == nil {
        return t, nil
    }

    t, err := time.ParseInLocation("2006-01-02", raw, time.Local)
    if err != nil {
        return time.Time{}, errors.New("expected YYYY-MM-DD or RFC3339")
    }

    if endOfDay {
        t = t.Add(24*time.Hour - time.Millisecond)
    }

    return t, nil
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
