package api

import (
	"net/http"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

/*
Self-service account management.

Previously the only way to change a password was through the admin panel —
an ordinary user had no path to it at all. That is a real gap for a product
handed to non-technical customers: "I forgot my password" or "I want to
change my password" should never require filing a support request.
*/

// GetMe returns the caller's own profile.
//
// The frontend trusts the cached `user` object in localStorage for display,
// but nothing forced it to refresh after an admin changed a role — this
// endpoint exists so a client can re-sync itself.
func GetMe(c *gin.Context) {
	userID := c.GetInt("user_id")

	var user models.User
	err := db.DB.QueryRow(
		"SELECT id, phone, role, created_at FROM users WHERE id = $1", userID,
	).Scan(&user.ID, &user.Phone, &user.Role, &user.CreatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// ChangeMyPassword lets a user change their own password.
//
// Requires the current password — unlike the admin reset path, which is
// trusted because it is behind AdminMiddleware, this endpoint is reachable
// by anyone with a valid session, including one obtained from a token that
// leaked. Requiring the current password limits what a stolen-but-not-yet-
// expired token can do.
func ChangeMyPassword(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var storedHash string
	if err := db.DB.QueryRow(
		"SELECT password_hash FROM users WHERE id = $1", userID,
	).Scan(&storedHash); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if !utils.CheckPasswordHash(req.CurrentPassword, storedHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
		return
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not hash password"})
		return
	}

	if _, err := db.DB.Exec(
		"UPDATE users SET password_hash = $1 WHERE id = $2", newHash, userID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password updated"})
}

/* -------------------------------------------------------------- devices */

// RenameDevice sets a human-readable name for a device the caller owns.
//
// Every device otherwise shows only its raw serial. "TRACKER-004" means
// nothing to a customer; "Dad's Car" does.
func RenameDevice(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	var req models.RenameDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := db.DB.Exec(
		"UPDATE devices SET name = $1 WHERE serial = $2", req.Name, serial,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not rename device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device renamed", "name": req.Name})
}
