package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// Admin middleware to check role
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}

		var role string
		err := db.DB.QueryRow("SELECT role FROM users WHERE id = $1", userID).Scan(&role)
		if err != nil || role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Helper function to log admin actions
func logAdminAction(c *gin.Context, action, entityType, entityID string, details interface{}) {
	userID, _ := c.Get("user_id")
	ipAddress := c.ClientIP()

	detailsJSON, _ := json.Marshal(details)

	_, err := db.DB.Exec(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)`,
		userID, action, entityType, entityID, detailsJSON, ipAddress,
	)

	if err != nil {
		println("Failed to log admin action:", err.Error())
	}
}

// Admin: Create a new device (pre-register)
func AdminCreateDevice(c *gin.Context) {
	var req models.AdminCreateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	// Check if device already exists
	var exists bool
	err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM devices WHERE serial=$1)", req.Serial).Scan(&exists)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": "Device already exists"})
		return
	}

	// Insert new device (inactive by default) - FIXED: Added user_id as NULL initially
	_, err = db.DB.Exec(`
        INSERT INTO devices (serial, device_secret, created_by, user_id, is_active)
        VALUES ($1, $2, $3, NULL, false)`,
		req.Serial, req.DeviceSecret, userID,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create device: " + err.Error()})
		return
	}

	// Log the action. req carries device_secret, which is a credential.
	logAdminAction(c, "CREATE_DEVICE", "device", req.Serial, gin.H{"serial": req.Serial})

	c.JSON(http.StatusCreated, gin.H{
		"message": "Device created successfully",
		"serial":  req.Serial,
	})
}

// Admin: Update a device
func AdminUpdateDevice(c *gin.Context) {
	serial := c.Param("serial")

	var req models.AdminUpdateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build dynamic update query
	updates := []string{}
	args := []interface{}{}
	argCount := 1

	if req.DeviceSecret != "" {
		updates = append(updates, "device_secret = $"+strconv.Itoa(argCount))
		args = append(args, req.DeviceSecret)
		argCount++
	}

	if req.UserID != nil {
		updates = append(updates, "user_id = $"+strconv.Itoa(argCount))
		args = append(args, req.UserID)
		argCount++
	}

	if req.IsActive != nil {
		updates = append(updates, "is_active = $"+strconv.Itoa(argCount))
		args = append(args, *req.IsActive)
		argCount++

		// If activating, set activated_at to NOW()
		if *req.IsActive {
			updates = append(updates, "activated_at = NOW()")
		} else {
			// If deactivating, clear activated_at
			updates = append(updates, "activated_at = NULL")
		}
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	query := "UPDATE devices SET " + joinStrings(updates, ", ") + " WHERE serial = $" + strconv.Itoa(argCount)
	args = append(args, serial)

	result, err := db.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	// Log the action, redacting the device secret.
	logAdminAction(c, "UPDATE_DEVICE", "device", serial, gin.H{
		"user_id":         req.UserID,
		"is_active":       req.IsActive,
		"secret_changed":  req.DeviceSecret != "",
	})

	c.JSON(http.StatusOK, gin.H{"message": "Device updated successfully"})
}

// Admin: Delete a device
func AdminDeleteDevice(c *gin.Context) {
	serial := c.Param("serial")

	result, err := db.DB.Exec("DELETE FROM devices WHERE serial = $1", serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	logAdminAction(c, "DELETE_DEVICE", "device", serial, nil)

	c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
}

// Admin: Deactivate device (remove user association)
func AdminDeactivateDevice(c *gin.Context) {
	serial := c.Param("serial")

	// First check if device exists
	var exists bool
	err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM devices WHERE serial = $1)", serial).Scan(&exists)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	// Get device info before deactivating for logging
	var userID sql.NullInt64
	db.DB.QueryRow("SELECT user_id FROM devices WHERE serial = $1", serial).Scan(&userID)

	result, err := db.DB.Exec(`
        UPDATE devices 
        SET user_id = NULL, is_active = false, activated_at = NULL
        WHERE serial = $1`,
		serial,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deactivate device: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	logAdminAction(c, "DEACTIVATE_DEVICE", "device", serial, gin.H{"previous_user": userID.Int64})

	c.JSON(http.StatusOK, gin.H{"message": "Device deactivated successfully"})
}

// Admin: Get all users with search
func AdminGetUsers(c *gin.Context) {
	search := c.Query("search")

	// Atoi errors were discarded, so limit=abc silently became 0 and returned
	// an empty page; an unbounded limit could pull the whole table.
	limit := clampedIntQuery(c, "limit", 50, 1, 500)
	offset := clampedIntQuery(c, "offset", 0, 0, 1_000_000)

	var query string
	var args []interface{}
	argCount := 1

	if search != "" {
		query = `
            SELECT id, phone, role, created_at 
            FROM users 
            WHERE phone ILIKE $` + strconv.Itoa(argCount) + ` 
            OR CAST(id AS TEXT) = $` + strconv.Itoa(argCount+1) + `
            ORDER BY created_at DESC 
            LIMIT $` + strconv.Itoa(argCount+2) + ` OFFSET $` + strconv.Itoa(argCount+3)
		args = append(args, "%"+search+"%", search, limit, offset)
	} else {
		query = `
            SELECT id, phone, role, created_at 
            FROM users 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `
		args = append(args, limit, offset)
	}

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var user models.User
		err := rows.Scan(&user.ID, &user.Phone, &user.Role, &user.CreatedAt)
		if err != nil {
			continue
		}
		users = append(users, user)
	}

	// Get total count
	var total int
	if search != "" {
		db.DB.QueryRow(`
            SELECT COUNT(*) FROM users 
            WHERE phone ILIKE $1 OR CAST(id AS TEXT) = $2`,
			"%"+search+"%", search,
		).Scan(&total)
	} else {
		db.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&total)
	}

	c.JSON(http.StatusOK, gin.H{
		"users":  users,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Admin: Get user by ID
func AdminGetUser(c *gin.Context) {
	id, ok := parseIDParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user id"})
		return
	}

	var user models.User
	err := db.DB.QueryRow(`
        SELECT id, phone, role, created_at 
        FROM users 
        WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Phone, &user.Role, &user.CreatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	c.JSON(http.StatusOK, user)
}

// Admin: Create user
func AdminCreateUser(c *gin.Context) {
	var req struct {
		Phone    string `json:"phone" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
		Role     string `json:"role" binding:"required,oneof=admin user"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if user exists
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

	// Insert user
	var user models.User
	err = db.DB.QueryRow(`
        INSERT INTO users (phone, password_hash, role) 
        VALUES ($1, $2, $3) 
        RETURNING id, phone, role, created_at`,
		req.Phone, hashedPassword, req.Role,
	).Scan(&user.ID, &user.Phone, &user.Role, &user.CreatedAt)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error creating user: " + err.Error()})
		return
	}

	// req carries the plaintext password; log only the non-secret fields.
	logAdminAction(c, "CREATE_USER", "user", strconv.Itoa(user.ID), gin.H{
		"phone": req.Phone,
		"role":  req.Role,
	})

	c.JSON(http.StatusCreated, gin.H{
		"message": "User created successfully",
		"user":    user,
	})
}

// Admin: Update user
func AdminUpdateUser(c *gin.Context) {
	id, ok := parseIDParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user id"})
		return
	}

	var req struct {
		Phone    string `json:"phone,omitempty"`
		Password string `json:"password,omitempty"`
		Role     string `json:"role,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Role was written to the database unvalidated. Anything other than
	// "admin"/"user" silently locks the account out of the admin panel,
	// since AdminMiddleware compares against the literal "admin".
	if req.Role != "" && req.Role != "admin" && req.Role != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Role must be 'admin' or 'user'"})
		return
	}

	// AdminCreateUser enforces min=6; keep the update path consistent.
	if req.Password != "" && len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}

	// Refuse to strip the last admin, which would leave nobody able to
	// administer the system.
	if req.Role == "user" {
		adminID, _ := c.Get("user_id")
		if adminID == id {
			var adminCount int
			if err := db.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&adminCount); err == nil && adminCount <= 1 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot remove the last admin"})
				return
			}
		}
	}

	// Build dynamic update query
	updates := []string{}
	args := []interface{}{}
	argCount := 1

	if req.Phone != "" {
		// Check if phone is taken by another user
		var exists bool
		err := db.DB.QueryRow(`
            SELECT EXISTS(
                SELECT 1 FROM users 
                WHERE phone=$1 AND id != $2
            )`, req.Phone, id).Scan(&exists)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
		if exists {
			c.JSON(http.StatusConflict, gin.H{"error": "Phone number already in use"})
			return
		}
		updates = append(updates, "phone = $"+strconv.Itoa(argCount))
		args = append(args, req.Phone)
		argCount++
	}

	if req.Password != "" {
		hashedPassword, err := utils.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error hashing password"})
			return
		}
		updates = append(updates, "password_hash = $"+strconv.Itoa(argCount))
		args = append(args, hashedPassword)
		argCount++
	}

	if req.Role != "" {
		updates = append(updates, "role = $"+strconv.Itoa(argCount))
		args = append(args, req.Role)
		argCount++
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	query := "UPDATE users SET " + joinStrings(updates, ", ") + " WHERE id = $" + strconv.Itoa(argCount)
	args = append(args, id)

	result, err := db.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user: " + err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Never log the submitted password, even hashed-at-rest elsewhere.
	logAdminAction(c, "UPDATE_USER", "user", strconv.Itoa(id), gin.H{
		"phone":           req.Phone,
		"role":            req.Role,
		"password_changed": req.Password != "",
	})

	c.JSON(http.StatusOK, gin.H{"message": "User updated successfully"})
}

// Admin: Delete user
func AdminDeleteUser(c *gin.Context) {
	id, ok := parseIDParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user id"})
		return
	}

	// Don't allow deleting yourself
	adminID, _ := c.Get("user_id")
	if adminID == id {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your own account"})
		return
	}

	// Check if user has devices
	var deviceCount int
	db.DB.QueryRow("SELECT COUNT(*) FROM devices WHERE user_id = $1", id).Scan(&deviceCount)

	// First, disassociate devices from this user
	_, err := db.DB.Exec("UPDATE devices SET user_id = NULL, is_active = false WHERE user_id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user's devices"})
		return
	}

	// Delete user
	result, err := db.DB.Exec("DELETE FROM users WHERE id = $1", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	logAdminAction(c, "DELETE_USER", "user", strconv.Itoa(id), gin.H{"device_count": deviceCount})

	c.JSON(http.StatusOK, gin.H{
		"message":          "User deleted successfully",
		"devices_affected": deviceCount,
	})
}

// Admin: Get user's devices
func AdminGetUserDevices(c *gin.Context) {
	userID, ok := parseIDParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user id"})
		return
	}

	rows, err := db.DB.Query(`
        SELECT serial, device_secret, is_active, activated_at, created_at
        FROM devices 
        WHERE user_id = $1
        ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	devices := []map[string]interface{}{}
	for rows.Next() {
		var serial, deviceSecret string
		var isActive bool
		var activatedAt, createdAt sql.NullTime

		err := rows.Scan(&serial, &deviceSecret, &isActive, &activatedAt, &createdAt)
		if err != nil {
			continue
		}

		device := map[string]interface{}{
			"serial":        serial,
			"device_secret": deviceSecret,
			"is_active":     isActive,
			"created_at":    createdAt.Time,
		}

		if activatedAt.Valid {
			device["activated_at"] = activatedAt.Time
		}

		devices = append(devices, device)
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id": userID,
		"devices": devices,
		"total":   len(devices),
	})
}

// Admin: Get all devices with search and filters
// func AdminGetDevices(c *gin.Context) {
//     search := c.Query("search")
//     isActive := c.Query("is_active")
//     userID := c.Query("user_id")
//     limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
//     offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

//     // Build query with proper parameter numbering
//     query := `
//         SELECT d.serial, d.device_secret, d.user_id, d.is_active,
//                d.activated_at, d.created_by, d.created_at,
//                COALESCE(u.phone, '') as user_phone
//         FROM devices d
//         LEFT JOIN users u ON d.user_id = u.id
//         WHERE 1=1
//     `

//     var args []interface{}
//     argCount := 1

//     if search != "" {
//         query += " AND (d.serial ILIKE $" + strconv.Itoa(argCount) + " OR d.device_secret ILIKE $" + strconv.Itoa(argCount) + ")"
//         args = append(args, "%"+search+"%")
//         argCount++
//     }

//     if isActive != "" {
//         isActiveBool := isActive == "true"
//         query += " AND d.is_active = $" + strconv.Itoa(argCount)
//         args = append(args, isActiveBool)
//         argCount++
//     }

//     if userID != "" {
//         query += " AND d.user_id = $" + strconv.Itoa(argCount)
//         args = append(args, userID)
//         argCount++
//     }

//     query += " ORDER BY d.created_at DESC LIMIT $" + strconv.Itoa(argCount) + " OFFSET $" + strconv.Itoa(argCount+1)
//     args = append(args, limit, offset)

//     rows, err := db.DB.Query(query, args...)
//     if err != nil {
//         c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
//         return
//     }
//     defer rows.Close()

//     devices := []map[string]interface{}{}
//     for rows.Next() {
//         var serial, deviceSecret, userPhone string
//         var userID sql.NullInt64
//         var isActive bool
//         var activatedAt, createdAt sql.NullTime
//         var createdBy sql.NullInt64

//         err := rows.Scan(&serial, &deviceSecret, &userID, &isActive,
//                          &activatedAt, &createdBy, &createdAt, &userPhone)
//         if err != nil {
//             continue
//         }

//         device := map[string]interface{}{
//             "serial":        serial,
//             "device_secret": deviceSecret,
//             "is_active":     isActive,
//             "created_at":    createdAt.Time,
//             "user_phone":    userPhone,
//         }

//         if userID.Valid {
//             device["user_id"] = userID.Int64
//         }
//         if activatedAt.Valid {
//             device["activated_at"] = activatedAt.Time
//         }
//         if createdBy.Valid {
//             device["created_by"] = createdBy.Int64
//         }

//         devices = append(devices, device)
//     }

//     // Get total count - FIXED: Use separate countArgs slice
//     var total int
//     countQuery := `SELECT COUNT(*) FROM devices d WHERE 1=1`
//     countArgs := []interface{}{}
//     countArgCount := 1

//     if search != "" {
//         countQuery += " AND (d.serial ILIKE $" + strconv.Itoa(countArgCount) + " OR d.device_secret ILIKE $" + strconv.Itoa(countArgCount) + ")"
//         countArgs = append(countArgs, "%"+search+"%")
//         countArgCount++
//     }

//     if isActive != "" {
//         isActiveBool := isActive == "true"
//         countQuery += " AND d.is_active = $" + strconv.Itoa(countArgCount)
//         countArgs = append(countArgs, isActiveBool)
//         countArgCount++
//     }

//     if userID != "" {
//         countQuery += " AND d.user_id = $" + strconv.Itoa(countArgCount)
//         countArgs = append(countArgs, userID)
//         countArgCount++
//     }

//     if len(countArgs) > 0 {
//         db.DB.QueryRow(countQuery, countArgs...).Scan(&total)
//     } else {
//         db.DB.QueryRow(countQuery).Scan(&total)
//     }

//     c.JSON(http.StatusOK, gin.H{
//         "devices": devices,
//         "total":   total,
//         "limit":   limit,
//         "offset":  offset,
//     })
// }

// Admin: Get audit logs
func AdminGetLogs(c *gin.Context) {
	// Was passed through as a raw string, so limit=abc reached Postgres.
	limit := clampedIntQuery(c, "limit", 100, 1, 500)
	action := c.Query("action")
	entityType := c.Query("entity_type")

	query := `
        SELECT al.id, al.user_id, al.action, al.entity_type, 
               al.entity_id, al.details, al.ip_address, al.created_at,
               u.phone as user_phone
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    `
	args := []interface{}{}
	argCount := 1

	if action != "" {
		query += " AND al.action = $" + strconv.Itoa(argCount)
		args = append(args, action)
		argCount++
	}

	if entityType != "" {
		query += " AND al.entity_type = $" + strconv.Itoa(argCount)
		args = append(args, entityType)
		argCount++
	}

	query += " ORDER BY al.created_at DESC LIMIT $" + strconv.Itoa(argCount)
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	logs := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var userID sql.NullInt64
		var action, entityType, entityID, ipAddress string
		var details json.RawMessage
		var createdAt time.Time
		var userPhone sql.NullString

		err := rows.Scan(&id, &userID, &action, &entityType, &entityID,
			&details, &ipAddress, &createdAt, &userPhone)
		if err != nil {
			continue
		}

		log := map[string]interface{}{
			"id":          id,
			"action":      action,
			"entity_type": entityType,
			"entity_id":   entityID,
			"ip_address":  ipAddress,
			"created_at":  createdAt,
		}

		if userID.Valid {
			log["user_id"] = userID.Int64
		}
		if userPhone.Valid {
			log["user_phone"] = userPhone.String
		}
		if len(details) > 0 {
			log["details"] = details
		}

		logs = append(logs, log)
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"total": len(logs),
	})
}

// Admin: Get device activation statistics
func AdminGetEnhancedStats(c *gin.Context) {
	var totalUsers, totalDevices, activeDevices, inactiveDevices, totalLocations int

	db.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'user'").Scan(&totalUsers)
	db.DB.QueryRow("SELECT COUNT(*) FROM devices").Scan(&totalDevices)
	db.DB.QueryRow("SELECT COUNT(*) FROM devices WHERE is_active = true").Scan(&activeDevices)
	db.DB.QueryRow("SELECT COUNT(*) FROM devices WHERE is_active = false").Scan(&inactiveDevices)
	db.DB.QueryRow("SELECT COUNT(*) FROM location_history").Scan(&totalLocations)

	// Get recent activity
	var recentActivations int
	db.DB.QueryRow(`
        SELECT COUNT(*) FROM devices 
        WHERE activated_at > NOW() - INTERVAL '24 hours'
    `).Scan(&recentActivations)

	c.JSON(http.StatusOK, gin.H{
		"total_users":        totalUsers,
		"total_devices":      totalDevices,
		"active_devices":     activeDevices,
		"inactive_devices":   inactiveDevices,
		"total_locations":    totalLocations,
		"recent_activations": recentActivations,
	})
}

// Helper functions
func formatInt(i int) string {
	return strconv.Itoa(i)
}

func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

func AdminAssignDeviceToUser(c *gin.Context) {
    serial := c.Param("serial")
    
    var req models.AssignDeviceRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
        return
    }
    
    // Log the request for debugging
    println("Assigning device:", serial, "to user:", req.UserID)
    
    // Check if device exists
    var deviceExists bool
    err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM devices WHERE serial = $1)", serial).Scan(&deviceExists)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking device: " + err.Error()})
        return
    }
    
    if !deviceExists {
        c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
        return
    }
    
    // Check if user exists
    var userExists bool
    err = db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", req.UserID).Scan(&userExists)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking user: " + err.Error()})
        return
    }
    
    if !userExists {
        c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        return
    }
    
    // First, check if last_modified_at column exists
    var columnExists bool
    err = db.DB.QueryRow(`
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'devices' AND column_name = 'last_modified_at'
        )
    `).Scan(&columnExists)
    
    var updateQuery string
    if columnExists {
        updateQuery = `
            UPDATE devices 
            SET user_id = $1, is_active = true, activated_at = NOW(), last_modified_at = NOW()
            WHERE serial = $2
        `
    } else {
        updateQuery = `
            UPDATE devices 
            SET user_id = $1, is_active = true, activated_at = NOW()
            WHERE serial = $2
        `
    }
    
    // Assign device to user and activate it
    result, err := db.DB.Exec(updateQuery, req.UserID, serial)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to assign device: " + err.Error()})
        return
    }
    
    rowsAffected, _ := result.RowsAffected()
    if rowsAffected == 0 {
        c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
        return
    }
    
    // Log the action
    logAdminAction(c, "ASSIGN_DEVICE", "device", serial, gin.H{"assigned_to_user": req.UserID})
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Device assigned to user successfully",
        "serial": serial,
        "user_id": req.UserID,
    })
}

// Updated AdminGetDevices to include last_modified_at
func AdminGetDevices(c *gin.Context) {
    search := c.Query("search")
    isActive := c.Query("is_active")
    userID := c.Query("user_id")
    limit := clampedIntQuery(c, "limit", 50, 1, 500)
    offset := clampedIntQuery(c, "offset", 0, 0, 1_000_000)

    // Check if last_modified_at column exists
    var hasLastModified bool
    err := db.DB.QueryRow(`
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'devices' AND column_name = 'last_modified_at'
        )
    `).Scan(&hasLastModified)
    if err != nil {
        hasLastModified = false
    }
    
    // Build query based on column existence
    var query string
    if hasLastModified {
        query = `
            SELECT d.serial, d.device_secret, d.user_id, d.is_active, 
                   d.activated_at, d.created_by, d.created_at, d.last_modified_at,
                   COALESCE(u.phone, '') as user_phone
            FROM devices d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE 1=1
        `
    } else {
        query = `
            SELECT d.serial, d.device_secret, d.user_id, d.is_active, 
                   d.activated_at, d.created_by, d.created_at, NULL as last_modified_at,
                   COALESCE(u.phone, '') as user_phone
            FROM devices d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE 1=1
        `
    }
    
    var args []interface{}
    argCount := 1
    
    if search != "" {
        query += " AND (d.serial ILIKE $" + strconv.Itoa(argCount) + " OR d.device_secret ILIKE $" + strconv.Itoa(argCount) + ")"
        args = append(args, "%"+search+"%")
        argCount++
    }
    
    if isActive != "" {
        isActiveBool := isActive == "true"
        query += " AND d.is_active = $" + strconv.Itoa(argCount)
        args = append(args, isActiveBool)
        argCount++
    }
    
    if userID != "" {
        query += " AND d.user_id = $" + strconv.Itoa(argCount)
        args = append(args, userID)
        argCount++
    }
    
    query += " ORDER BY d.created_at DESC LIMIT $" + strconv.Itoa(argCount) + " OFFSET $" + strconv.Itoa(argCount+1)
    args = append(args, limit, offset)
    
    rows, err := db.DB.Query(query, args...)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
        return
    }
    defer rows.Close()
    
    devices := []map[string]interface{}{}
    for rows.Next() {
        var serial, deviceSecret, userPhone string
        var userID sql.NullInt64
        var isActive bool
        var activatedAt, createdAt, lastModifiedAt sql.NullTime
        var createdBy sql.NullInt64
        
        // Both query variants project the same nine columns (the fallback
        // selects NULL AS last_modified_at), so one scan covers both.
        if err := rows.Scan(&serial, &deviceSecret, &userID, &isActive,
            &activatedAt, &createdBy, &createdAt, &lastModifiedAt, &userPhone); err != nil {
            continue
        }


        device := map[string]interface{}{
            "serial":        serial,
            "device_secret": deviceSecret,
            "is_active":     isActive,
            "created_at":    createdAt.Time,
            "user_phone":    userPhone,
        }
        
        if userID.Valid {
            device["user_id"] = userID.Int64
        }
        if activatedAt.Valid {
            device["activated_at"] = activatedAt.Time
        }
        if lastModifiedAt.Valid {
            device["last_modified_at"] = lastModifiedAt.Time
        }
        if createdBy.Valid {
            device["created_by"] = createdBy.Int64
        }
        
        devices = append(devices, device)
    }
    
    // Get total count
    var total int
    countQuery := `SELECT COUNT(*) FROM devices d WHERE 1=1`
    countArgs := []interface{}{}
    countArgCount := 1
    
    if search != "" {
        countQuery += " AND (d.serial ILIKE $" + strconv.Itoa(countArgCount) + " OR d.device_secret ILIKE $" + strconv.Itoa(countArgCount) + ")"
        countArgs = append(countArgs, "%"+search+"%")
        countArgCount++
    }
    
    if isActive != "" {
        isActiveBool := isActive == "true"
        countQuery += " AND d.is_active = $" + strconv.Itoa(countArgCount)
        countArgs = append(countArgs, isActiveBool)
        countArgCount++
    }
    
    if userID != "" {
        countQuery += " AND d.user_id = $" + strconv.Itoa(countArgCount)
        countArgs = append(countArgs, userID)
        countArgCount++
    }
    
    if len(countArgs) > 0 {
        db.DB.QueryRow(countQuery, countArgs...).Scan(&total)
    } else {
        db.DB.QueryRow(countQuery).Scan(&total)
    }
    
    c.JSON(http.StatusOK, gin.H{
        "devices": devices,
        "total":   total,
        "limit":   limit,
        "offset":  offset,
    })
}
