package api

import (
	"database/sql"
	"errors"
	"net/http"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"

	"github.com/gin-gonic/gin"
)

/*
The configurator: per-device tuning an owner can do from the app.

Reads never 404. A device with no settings row is reported with the column
defaults, which are the same values the alert engine falls back to — so the
screen always shows what the device is actually doing, whether or not anyone
has ever saved anything.
*/

// defaultSettings mirrors the device_settings column defaults, and the Go
// defaults in internal/mqtt/alerts.go. All three have to agree.
func defaultSettings(serial string) models.DeviceSettings {
	return models.DeviceSettings{
		DeviceSerial:      serial,
		SpeedLimitKmh:     0, // 0 disables the rule rather than meaning 0 km/h
		ReportIntervalS:   30,
		AlertOverspeed:    true,
		AlertIgnition:     true,
		AlertTow:          true,
		AlertImpact:       true,
		AlertHarshDriving: true,
		AlertPowerCut:     true,
		AlertJamming:      true,
		AlertLowBattery:   true,
		AlertGeofence:     true,
		AlertOffline:      true,
		SilentMode:        false,
	}
}

const settingsColumns = `
    device_serial, speed_limit_kmh, report_interval_s,
    alert_overspeed, alert_ignition, alert_tow, alert_impact, alert_harsh_driving,
    alert_power_cut, alert_jamming, alert_low_battery, alert_geofence, alert_offline,
    silent_mode, updated_at`

func scanSettings(row interface{ Scan(...any) error }, s *models.DeviceSettings) error {
	return row.Scan(&s.DeviceSerial, &s.SpeedLimitKmh, &s.ReportIntervalS,
		&s.AlertOverspeed, &s.AlertIgnition, &s.AlertTow, &s.AlertImpact, &s.AlertHarshDriving,
		&s.AlertPowerCut, &s.AlertJamming, &s.AlertLowBattery, &s.AlertGeofence, &s.AlertOffline,
		&s.SilentMode, &s.UpdatedAt)
}

// GetDeviceSettings returns the current configuration for a device.
func GetDeviceSettings(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	var s models.DeviceSettings
	err := scanSettings(db.DB.QueryRow(
		"SELECT "+settingsColumns+" FROM device_settings WHERE device_serial = $1", serial), &s)

	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusOK, defaultSettings(serial))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, s)
}

// UpdateDeviceSettings patches a device's configuration.
//
// The upsert seeds any missing row from the defaults first, so a partial
// update against a device that has never been configured writes exactly the
// fields the caller sent and leaves the rest at their documented defaults —
// rather than at whatever Go's zero values happen to be, which would silently
// switch every alert off.
func UpdateDeviceSettings(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	var req models.UpdateDeviceSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.SpeedLimitKmh != nil && (*req.SpeedLimitKmh < 0 || *req.SpeedLimitKmh > 300) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "speed_limit_kmh must be between 0 and 300"})
		return
	}
	if req.ReportIntervalS != nil && (*req.ReportIntervalS < 10 || *req.ReportIntervalS > 3600) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "report_interval_s must be between 10 and 3600"})
		return
	}

	if _, err := db.DB.Exec(`
        INSERT INTO device_settings (device_serial) VALUES ($1)
        ON CONFLICT (device_serial) DO NOTHING`, serial,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// COALESCE against the existing row: a NULL parameter (an omitted field)
	// leaves the stored value alone.
	var s models.DeviceSettings
	err := scanSettings(db.DB.QueryRow(`
        UPDATE device_settings SET
            speed_limit_kmh     = COALESCE($2, speed_limit_kmh),
            report_interval_s   = COALESCE($3, report_interval_s),
            alert_overspeed     = COALESCE($4, alert_overspeed),
            alert_ignition      = COALESCE($5, alert_ignition),
            alert_tow           = COALESCE($6, alert_tow),
            alert_impact        = COALESCE($7, alert_impact),
            alert_harsh_driving = COALESCE($8, alert_harsh_driving),
            alert_power_cut     = COALESCE($9, alert_power_cut),
            alert_jamming       = COALESCE($10, alert_jamming),
            alert_low_battery   = COALESCE($11, alert_low_battery),
            alert_geofence      = COALESCE($12, alert_geofence),
            alert_offline       = COALESCE($13, alert_offline),
            silent_mode         = COALESCE($14, silent_mode),
            updated_at          = NOW()
        WHERE device_serial = $1
        RETURNING `+settingsColumns,
		serial, req.SpeedLimitKmh, req.ReportIntervalS,
		req.AlertOverspeed, req.AlertIgnition, req.AlertTow, req.AlertImpact,
		req.AlertHarshDriving, req.AlertPowerCut, req.AlertJamming,
		req.AlertLowBattery, req.AlertGeofence, req.AlertOffline, req.SilentMode,
	), &s)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update settings"})
		return
	}

	// A changed reporting interval is only real once the device honours it, so
	// it is pushed down the control channel as well as stored. Best-effort:
	// the stored value is authoritative and the device picks it up on its next
	// successful command delivery.
	if req.ReportIntervalS != nil {
		queueIntervalCommand(userID, serial, *req.ReportIntervalS)
	}

	c.JSON(http.StatusOK, s)
}
