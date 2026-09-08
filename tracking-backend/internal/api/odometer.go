package api

import (
	"database/sql"
	"errors"
	"math"
	"net/http"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"

	"github.com/gin-gonic/gin"
)

/*
Odometer: a device's lifetime distance total.

The value is accumulated on the MQTT ingest path (see UpdateOdometer in
internal/services/odometer.go). These endpoints only read it and let an owner
set it — to match the vehicle's real dashboard reading when a tracker is
first fitted, or to reset it to zero.
*/

// metersToKm rounds metres to kilometres at two decimal places, matching the
// precision TrackSummary.DistanceKm uses.
func metersToKm(m float64) float64 {
	return math.Round(m/10) / 100
}

// GetOdometer returns the running distance total for a device the caller owns.
//
// A device that has never reported has no odometer row yet; that is reported
// as a zero total rather than a 404, so the UI can always show a figure.
func GetOdometer(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	o := models.Odometer{Device: serial}

	var updatedAt sql.NullTime
	err := db.DB.QueryRow(
		"SELECT total_meters, updated_at FROM device_odometer WHERE device_serial = $1", serial,
	).Scan(&o.TotalMeters, &updatedAt)

	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusOK, o)
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	o.TotalKm = metersToKm(o.TotalMeters)
	if updatedAt.Valid {
		o.UpdatedAt = &updatedAt.Time
	}

	c.JSON(http.StatusOK, o)
}

// SetOdometer overwrites the running total with an explicit reading.
//
// The last-counted anchor position is deliberately left untouched: the next
// live fix still measures its hop from the vehicle's real location, so
// setting the reading does not make the counter jump on the following point.
func SetOdometer(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	var req models.SetOdometerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Upper bound is a sanity check, not a real limit: ~100 million km is more
	// than any vehicle will ever cover, so anything past it is a fat-finger.
	if *req.TotalKm < 0 || *req.TotalKm > 100_000_000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "total_km must be between 0 and 100000000"})
		return
	}

	meters := *req.TotalKm * 1000

	if _, err := db.DB.Exec(`
        INSERT INTO device_odometer (device_serial, total_meters, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (device_serial) DO UPDATE
            SET total_meters = EXCLUDED.total_meters, updated_at = NOW()`,
		serial, meters,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update odometer"})
		return
	}

	c.JSON(http.StatusOK, models.Odometer{
		Device:      serial,
		TotalMeters: meters,
		TotalKm:     metersToKm(meters),
	})
}
