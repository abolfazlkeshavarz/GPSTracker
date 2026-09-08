package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/mqtt"

	"github.com/gin-gonic/gin"
)

/*
Remote control.

This is the feature with real-world consequences: cutting the engine of a
moving vehicle is a safety decision, not a UI click. Three guards apply, and
all three are enforced here rather than in the interface, so a bare API call
cannot get around what the app makes the user confirm:

  1. `confirm: true` is required for the dangerous commands.
  2. Engine cut-off is REFUSED above a walking pace. An immobiliser that can
     stop a car at 90 km/h is a way to kill someone, and every serious
     immobiliser on the market has this interlock. The device firmware has the
     same check; this is the second of the two.
  3. Every command is written to an audit log with the user who issued it.
*/

// immobiliserMaxSpeedKmh is the speed above which an engine cut is refused.
// Low enough to be a stationary or crawling vehicle, high enough to tolerate
// GPS noise on a parked one.
const immobiliserMaxSpeedKmh = 10

// dangerousCommands need an explicit confirmation flag.
var dangerousCommands = map[string]bool{
	"engine_cut": true,
	"reboot":     true,
}

// validCommands mirrors the CHECK constraint on device_commands.command.
var validCommands = map[string]bool{
	"engine_cut": true, "engine_restore": true,
	"door_lock": true, "door_unlock": true,
	"locate": true, "reboot": true, "set_interval": true,
}

// IssueCommand queues an instruction for a device and tries to deliver it now.
func IssueCommand(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	var req models.IssueCommandRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !validCommands[req.Command] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown command"})
		return
	}

	if dangerousCommands[req.Command] && !req.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "This command requires confirm: true",
		})
		return
	}

	// The immobiliser interlock. Refuse rather than queue: a command that
	// waits until the vehicle happens to be moving is exactly the failure mode
	// this is here to prevent.
	if req.Command == "engine_cut" {
		if speed, known := lastKnownSpeed(serial); known && speed > immobiliserMaxSpeedKmh {
			c.JSON(http.StatusConflict, gin.H{
				"error": fmt.Sprintf(
					"Refused: the vehicle is moving at %d km/h. The engine can only be cut below %d km/h.",
					speed, immobiliserMaxSpeedKmh),
			})
			return
		}
	}

	var params json.RawMessage
	if req.Command == "set_interval" {
		if req.IntervalS < 10 || req.IntervalS > 3600 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "interval_s must be between 10 and 3600"})
			return
		}
		params = json.RawMessage(fmt.Sprintf(`{"interval_s":%d}`, req.IntervalS))
	}

	cmd, err := queueCommand(userID, serial, req.Command, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not queue command"})
		return
	}

	c.JSON(http.StatusAccepted, cmd)
}

// ListCommands returns a device's recent command history, so an owner can see
// what was sent, by whom, and whether the vehicle actually confirmed it.
func ListCommands(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	limit := clampedIntQuery(c, "limit", 20, 1, 100)

	rows, err := db.DB.Query(`
        SELECT id, device_serial, command, params, status, issued_at, sent_at, acked_at,
               COALESCE(result, '')
        FROM device_commands
        WHERE device_serial = $1
        ORDER BY issued_at DESC
        LIMIT $2`, serial, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	commands := []models.DeviceCommand{}
	for rows.Next() {
		var cmd models.DeviceCommand
		var params []byte
		var sentAt, ackedAt sql.NullTime

		if err := rows.Scan(&cmd.ID, &cmd.DeviceSerial, &cmd.Command, &params, &cmd.Status,
			&cmd.IssuedAt, &sentAt, &ackedAt, &cmd.Result); err != nil {
			continue
		}
		if len(params) > 0 {
			cmd.Params = json.RawMessage(params)
		}
		if sentAt.Valid {
			cmd.SentAt = &sentAt.Time
		}
		if ackedAt.Valid {
			cmd.AckedAt = &ackedAt.Time
		}
		commands = append(commands, cmd)
	}

	c.JSON(http.StatusOK, gin.H{"commands": commands})
}

/* ---------------------------------------------------------------- helpers */

// queueCommand writes the row, audit-logs it, and attempts immediate delivery.
//
// Delivery failure is not an error to the caller: the row is stored as
// 'pending' and the sweeper retries it. What the caller gets back is the true
// status, so the UI can say "queued — device unreachable" rather than
// pretending the engine was cut.
func queueCommand(userID int, serial, command string, params json.RawMessage) (models.DeviceCommand, error) {
	var cmd models.DeviceCommand
	cmd.Params = params

	err := db.DB.QueryRow(`
        INSERT INTO device_commands (device_serial, command, params, issued_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, device_serial, command, status, issued_at`,
		serial, command, nullJSON(params), userID,
	).Scan(&cmd.ID, &cmd.DeviceSerial, &cmd.Command, &cmd.Status, &cmd.IssuedAt)
	if err != nil {
		return cmd, err
	}

	// Who cut whose engine, and when. This is the log a dispute is settled
	// from, so it is written before delivery is even attempted.
	details, _ := json.Marshal(map[string]any{"command": command, "command_id": cmd.ID})
	if _, err := db.DB.Exec(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES ($1, 'ISSUE_COMMAND', 'device', $2, $3)`,
		userID, serial, details,
	); err != nil {
		// Never fail the command over the log write; surface it instead.
		fmt.Println("audit log error:", err)
	}

	var secret string
	if err := db.DB.QueryRow(
		"SELECT device_secret FROM devices WHERE serial = $1", serial,
	).Scan(&secret); err != nil {
		return cmd, err
	}

	if err := mqtt.PublishCommand(db.DB, cmd.ID, serial, secret, command, params); err != nil {
		// Stays 'pending'; the sweeper will retry until it expires.
		cmd.Result = "Queued — the device is not reachable right now"
		return cmd, nil
	}

	cmd.Status = "sent"
	now := time.Now()
	cmd.SentAt = &now

	return cmd, nil
}

// queueIntervalCommand pushes a changed reporting interval to the device.
// Best-effort by design: the stored setting is authoritative.
func queueIntervalCommand(userID int, serial string, intervalS int) {
	params := json.RawMessage(fmt.Sprintf(`{"interval_s":%d}`, intervalS))
	if _, err := queueCommand(userID, serial, "set_interval", params); err != nil {
		fmt.Println("interval command queue error:", err)
	}
}

// lastKnownSpeed reads the cached live position for the immobiliser interlock.
//
// Returns known=false when there is no current fix at all. A device that has
// not reported is treated as "speed unknown", and the interlock deliberately
// allows the cut in that case: a stolen vehicle whose tracker has just been
// jammed is exactly when an owner most needs the command to work.
func lastKnownSpeed(serial string) (speed int, known bool) {
	val, err := db.RedisClient.Get(db.Ctx, "latest:"+serial).Result()
	if err != nil {
		return 0, false
	}

	var loc struct {
		Speed int `json:"speed"`
	}
	if json.Unmarshal([]byte(val), &loc) != nil {
		return 0, false
	}

	return loc.Speed, true
}

func nullJSON(raw json.RawMessage) interface{} {
	if len(raw) == 0 {
		return nil
	}
	return []byte(raw)
}
