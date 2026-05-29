package api

import (
    "database/sql"
    "encoding/json"
    "net/http"
    "time"
    
    "tracking-backend/internal/db"
    "tracking-backend/internal/models"
    
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
        // Log error but don't fail the request
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
    
    // Insert new device (inactive by default)
    _, err = db.DB.Exec(`
        INSERT INTO devices (serial, device_secret, created_by, is_active)
        VALUES ($1, $2, $3, false)`,
        req.Serial, req.DeviceSecret, userID,
    )
    
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create device"})
        return
    }
    
    // Log the action
    logAdminAction(c, "CREATE_DEVICE", "device", req.Serial, req)
    
    c.JSON(http.StatusCreated, gin.H{
        "message": "Device created successfully",
        "serial": req.Serial,
    })
}

// Admin: Get all devices with optional filters
func AdminGetDevices(c *gin.Context) {
    userID := c.Query("user_id")
    isActive := c.Query("is_active")
    
    query := `
        SELECT d.serial, d.device_secret, d.user_id, d.is_active, 
               d.activated_at, d.created_by, d.created_at,
               u.phone as user_phone
        FROM devices d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE 1=1
    `
    args := []interface{}{}
    argCount := 1
    
    if userID != "" {
        query += " AND d.user_id = $" + formatInt(argCount)
        args = append(args, userID)
        argCount++
    }
    
    if isActive != "" {
        isActiveBool := isActive == "true"
        query += " AND d.is_active = $" + formatInt(argCount)
        args = append(args, isActiveBool)
        argCount++
    }
    
    query += " ORDER BY d.created_at DESC"
    
    rows, err := db.DB.Query(query, args...)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()
    
    devices := []map[string]interface{}{}
    for rows.Next() {
        var serial, deviceSecret, userPhone sql.NullString
        var userID sql.NullInt64
        var isActive bool
        var activatedAt, createdAt sql.NullTime
        var createdBy sql.NullInt64
        
        err := rows.Scan(&serial, &deviceSecret, &userID, &isActive, 
                         &activatedAt, &createdBy, &createdAt, &userPhone)
        if err != nil {
            continue
        }
        
        device := map[string]interface{}{
            "serial": serial.String,
            "device_secret": deviceSecret.String,
            "is_active": isActive,
            "created_at": createdAt.Time,
        }
        
        if userID.Valid {
            device["user_id"] = userID.Int64
        }
        if userPhone.Valid {
            device["user_phone"] = userPhone.String
        }
        if activatedAt.Valid {
            device["activated_at"] = activatedAt.Time
        }
        if createdBy.Valid {
            device["created_by"] = createdBy.Int64
        }
        
        devices = append(devices, device)
    }
    
    c.JSON(http.StatusOK, gin.H{
        "devices": devices,
        "total": len(devices),
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
        updates = append(updates, "device_secret = $"+formatInt(argCount))
        args = append(args, req.DeviceSecret)
        argCount++
    }
    
    if req.UserID != nil {
        updates = append(updates, "user_id = $"+formatInt(argCount))
        args = append(args, req.UserID)
        argCount++
    }
    
    if req.IsActive != nil {
        updates = append(updates, "is_active = $"+formatInt(argCount))
        args = append(args, *req.IsActive)
        argCount++
        
        // If activating, set activated_at
        if *req.IsActive {
            updates = append(updates, "activated_at = NOW()")
        }
    }
    
    if len(updates) == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
        return
    }
    
    query := "UPDATE devices SET " + joinStrings(updates, ", ") + " WHERE serial = $" + formatInt(argCount)
    args = append(args, serial)
    
    result, err := db.DB.Exec(query, args...)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device"})
        return
    }
    
    rowsAffected, _ := result.RowsAffected()
    if rowsAffected == 0 {
        c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
        return
    }
    
    // Log the action
    logAdminAction(c, "UPDATE_DEVICE", "device", serial, req)
    
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

// Admin: Get all users
func AdminGetUsers(c *gin.Context) {
    rows, err := db.DB.Query(`
        SELECT id, phone, role, created_at 
        FROM users 
        ORDER BY created_at DESC
    `)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
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
    
    c.JSON(http.StatusOK, gin.H{
        "users": users,
        "total": len(users),
    })
}

// Admin: Get audit logs
func AdminGetLogs(c *gin.Context) {
    limit := c.DefaultQuery("limit", "100")
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
        query += " AND al.action = $" + formatInt(argCount)
        args = append(args, action)
        argCount++
    }
    
    if entityType != "" {
        query += " AND al.entity_type = $" + formatInt(argCount)
        args = append(args, entityType)
        argCount++
    }
    
    query += " ORDER BY al.created_at DESC LIMIT $" + formatInt(argCount)
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
            "id": id,
            "action": action,
            "entity_type": entityType,
            "entity_id": entityID,
            "ip_address": ipAddress,
            "created_at": createdAt,
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
        "logs": logs,
        "total": len(logs),
    })
}

// Admin: Get device activation statistics
func AdminGetStats(c *gin.Context) {
    var totalDevices, activeDevices, totalUsers int
    
    db.DB.QueryRow("SELECT COUNT(*) FROM devices").Scan(&totalDevices)
    db.DB.QueryRow("SELECT COUNT(*) FROM devices WHERE is_active = true").Scan(&activeDevices)
    db.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'user'").Scan(&totalUsers)
    
    c.JSON(http.StatusOK, gin.H{
        "total_devices": totalDevices,
        "active_devices": activeDevices,
        "inactive_devices": totalDevices - activeDevices,
        "total_users": totalUsers,
    })
}

// Helper functions
func formatInt(i int) string {
    return string(rune('0' + i))
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