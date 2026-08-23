package api

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"tracking-backend/internal/db"

	"github.com/gin-gonic/gin"
)

// ExportDeviceHistoryCSV streams a device's location history as CSV.
//
// A plain export button is a small thing, but its absence is one of the
// most common complaints about closed tracking platforms: the data is
// yours, and "give it to me in a format I can open in a spreadsheet" should
// never require asking support for a database dump.
func ExportDeviceHistoryCSV(c *gin.Context) {
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

	from, err := parseTimeParam(c.Query("from"), to.Add(-30*24*time.Hour), false)
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

	rows, err := db.DB.Query(`
        SELECT recorded_at, lat, lng, speed, satellites, csq, battery,
               ignition, heading, altitude, hdop, COALESCE(is_backfill, FALSE),
               COALESCE(auth_method, 'secret')
        FROM location_history
        WHERE device_serial = $1 AND recorded_at >= $2 AND recorded_at <= $3
        ORDER BY recorded_at ASC
        LIMIT $4`,
		serial, from, to, maxTrackPoints,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	filename := fmt.Sprintf("%s-history-%s.csv", serial, from.Format("20060102"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)

	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	w.Write([]string{
		"recorded_at", "lat", "lng", "speed_kmh", "satellites", "signal_csq",
		"battery_v", "ignition", "heading_deg", "altitude_m", "hdop",
		"backfilled", "auth_method",
	})

	for rows.Next() {
		var recordedAt time.Time
		var lat, lng float64
		var speed, satellites, csq int
		var battery sql.NullFloat64
		var ignition sql.NullBool
		var heading, altitude, hdop sql.NullFloat64
		var isBackfill bool
		var authMethod string

		if err := rows.Scan(&recordedAt, &lat, &lng, &speed, &satellites, &csq,
			&battery, &ignition, &heading, &altitude, &hdop, &isBackfill, &authMethod); err != nil {
			continue
		}

		w.Write([]string{
			recordedAt.UTC().Format(time.RFC3339),
			fmt.Sprintf("%.6f", lat),
			fmt.Sprintf("%.6f", lng),
			fmt.Sprintf("%d", speed),
			fmt.Sprintf("%d", satellites),
			fmt.Sprintf("%d", csq),
			nullFloatCSV(battery),
			nullBoolCSV(ignition),
			nullFloatCSV(heading),
			nullFloatCSV(altitude),
			nullFloatCSV(hdop),
			fmt.Sprintf("%t", isBackfill),
			authMethod,
		})
	}
}

func nullFloatCSV(v sql.NullFloat64) string {
	if !v.Valid {
		return ""
	}
	return fmt.Sprintf("%.4f", v.Float64)
}

func nullBoolCSV(v sql.NullBool) string {
	if !v.Valid {
		return ""
	}
	return fmt.Sprintf("%t", v.Bool)
}
