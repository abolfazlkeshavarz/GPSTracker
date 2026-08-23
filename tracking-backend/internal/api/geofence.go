package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/services"

	"github.com/gin-gonic/gin"
)

/*
Geofencing.

Circular zones only — a circle needs just a centre and radius to check
containment, which keeps the check on the MQTT ingest path (see
evaluateGeofences in internal/mqtt/geofence.go) a single comparison per fence
per point. That matters because that path runs on every message from every
device, not once per user action.
*/

// ListGeofences returns every fence defined for a device.
func ListGeofences(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	rows, err := db.DB.Query(`
        SELECT id, device_serial, name, lat, lng, radius_m, trigger_on, is_active, created_at
        FROM geofences
        WHERE device_serial = $1
        ORDER BY created_at DESC`,
		serial,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	fences := []models.Geofence{}
	for rows.Next() {
		var f models.Geofence
		if err := rows.Scan(&f.ID, &f.DeviceSerial, &f.Name, &f.Lat, &f.Lng,
			&f.RadiusM, &f.TriggerOn, &f.IsActive, &f.CreatedAt); err != nil {
			continue
		}
		fences = append(fences, f)
	}

	c.JSON(http.StatusOK, gin.H{"geofences": fences})
}

// CreateGeofence adds a fence for a device the caller owns.
func CreateGeofence(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	var req models.CreateGeofenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.RadiusM < 20 || req.RadiusM > 50000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "radius_m must be between 20 and 50000 metres"})
		return
	}

	if req.TriggerOn == "" {
		req.TriggerOn = "both"
	}
	if req.TriggerOn != "enter" && req.TriggerOn != "exit" && req.TriggerOn != "both" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trigger_on must be 'enter', 'exit' or 'both'"})
		return
	}

	var f models.Geofence
	err := db.DB.QueryRow(`
        INSERT INTO geofences (device_serial, name, lat, lng, radius_m, trigger_on, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, device_serial, name, lat, lng, radius_m, trigger_on, is_active, created_at`,
		serial, req.Name, req.Lat, req.Lng, req.RadiusM, req.TriggerOn, userID,
	).Scan(&f.ID, &f.DeviceSerial, &f.Name, &f.Lat, &f.Lng, &f.RadiusM, &f.TriggerOn, &f.IsActive, &f.CreatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create geofence"})
		return
	}

	// Seed containment state from the device's current position, if known, so
	// the very next point compares against a real prior state instead of
	// silently swallowing what might be an immediate crossing.
	if val, err := db.RedisClient.Get(db.Ctx, "latest:"+serial).Result(); err == nil {
		var loc struct {
			Lat float64 `json:"lat"`
			Lng float64 `json:"lng"`
		}
		if json.Unmarshal([]byte(val), &loc) == nil {
			inside := services.PointInCircle(loc.Lat, loc.Lng, f.Lat, f.Lng, float64(f.RadiusM))
			db.DB.Exec(`
                INSERT INTO geofence_state (geofence_id, is_inside)
                VALUES ($1, $2)
                ON CONFLICT (geofence_id) DO UPDATE SET is_inside = EXCLUDED.is_inside`,
				f.ID, inside)
		}
	}

	c.JSON(http.StatusCreated, f)
}

// DeleteGeofence removes a fence. Ownership is checked through the device,
// not the fence row directly, so the same access rule applies everywhere.
func DeleteGeofence(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid geofence id"})
		return
	}

	result, err := db.DB.Exec(
		"DELETE FROM geofences WHERE id = $1 AND device_serial = $2", id, serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Geofence not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Geofence deleted"})
}

// UpdateGeofence toggles a fence active/inactive without deleting it —
// useful for a "pause while I'm away" case without losing the definition.
func UpdateGeofence(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid geofence id"})
		return
	}

	var req struct {
		IsActive *bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.IsActive == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "is_active is required"})
		return
	}

	result, err := db.DB.Exec(
		"UPDATE geofences SET is_active = $1 WHERE id = $2 AND device_serial = $3",
		*req.IsActive, id, serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Geofence not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Geofence updated"})
}

/* -------------------------------------------------------------- alerts */

// ListAlerts returns the caller's alerts across every device they own,
// newest first — the unified log described in the schema comment: unlike a
// bare push notification, a user can come back later and see what happened.
func ListAlerts(c *gin.Context) {
	userID := c.GetInt("user_id")

	limit := clampedIntQuery(c, "limit", 50, 1, 200)
	unreadOnly := c.Query("unread") == "1"

	query := `
        SELECT id, device_serial, kind, title, COALESCE(detail, ''),
               lat, lng, geofence_id, is_read, created_at
        FROM alerts
        WHERE user_id = $1`
	args := []interface{}{userID}

	if unreadOnly {
		query += " AND NOT is_read"
	}
	query += " ORDER BY created_at DESC LIMIT $2"
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	alerts := []models.Alert{}
	for rows.Next() {
		var a models.Alert
		var lat, lng sql.NullFloat64
		var geofenceID sql.NullInt64

		if err := rows.Scan(&a.ID, &a.DeviceSerial, &a.Kind, &a.Title, &a.Detail,
			&lat, &lng, &geofenceID, &a.IsRead, &a.CreatedAt); err != nil {
			continue
		}
		if lat.Valid {
			a.Lat = &lat.Float64
		}
		if lng.Valid {
			a.Lng = &lng.Float64
		}
		if geofenceID.Valid {
			a.GeofenceID = &geofenceID.Int64
		}
		alerts = append(alerts, a)
	}

	var unreadCount int
	db.DB.QueryRow("SELECT COUNT(*) FROM alerts WHERE user_id = $1 AND NOT is_read", userID).Scan(&unreadCount)

	c.JSON(http.StatusOK, gin.H{"alerts": alerts, "unread_count": unreadCount})
}

// MarkAlertRead marks one alert read. Ownership is enforced by matching
// user_id in the WHERE clause rather than a separate lookup — a 404 either
// way, so it never confirms whether an alert id belongs to someone else.
func MarkAlertRead(c *gin.Context) {
	userID := c.GetInt("user_id")

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid alert id"})
		return
	}

	result, err := db.DB.Exec(
		"UPDATE alerts SET is_read = TRUE WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Marked read"})
}

// MarkAllAlertsRead clears the unread badge in one call.
func MarkAllAlertsRead(c *gin.Context) {
	userID := c.GetInt("user_id")

	_, err := db.DB.Exec("UPDATE alerts SET is_read = TRUE WHERE user_id = $1 AND NOT is_read", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All alerts marked read"})
}
