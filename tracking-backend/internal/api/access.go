package api

import (
	"net/http"

	"tracking-backend/internal/db"

	"github.com/gin-gonic/gin"
)

// canAccessDevice decides whether the caller may read or change a device's
// data through the ordinary per-device endpoints.
//
// Owners always can. Admins can too — support, installation and the
// developer need to inspect and fix any unit's settings, zones, odometer
// and commands without borrowing the customer's login. The owner check runs
// first, so the role lookup only costs a query on the admin path, and every
// change an admin makes to someone else's device is written to the audit log.
func canAccessDevice(c *gin.Context, serial string) bool {
	userID := c.GetInt("user_id")
	if deviceBelongsToUser(userID, serial) {
		return true
	}
	if !isAdmin(c) {
		return false
	}
	var exists bool
	if err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM devices WHERE serial = $1)", serial).Scan(&exists); err != nil || !exists {
		return false
	}
	if c.Request.Method != http.MethodGet {
		logAdminAction(c, "ADMIN_DEVICE_"+c.Request.Method, "device", serial, gin.H{"path": c.FullPath()})
	}
	return true
}

// isAdmin reports whether the authenticated caller has the admin role. The
// result is cached on the request so repeated checks cost one query.
func isAdmin(c *gin.Context) bool {
	if v, ok := c.Get("is_admin"); ok {
		return v.(bool)
	}
	var role string
	err := db.DB.QueryRow("SELECT role FROM users WHERE id = $1", c.GetInt("user_id")).Scan(&role)
	admin := err == nil && role == "admin"
	c.Set("is_admin", admin)
	return admin
}
