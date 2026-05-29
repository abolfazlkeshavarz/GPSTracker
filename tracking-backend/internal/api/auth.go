package api

import (
    "database/sql"
    "net/http"

    "tracking-backend/internal/db"
    "tracking-backend/internal/models"
    "tracking-backend/internal/utils"
    "tracking-backend/internal/config"
    "github.com/gin-gonic/gin"
)

func Register(c *gin.Context) {
    var req models.RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if user already exists
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

    // Insert user and return all fields including created_at and role
    var user models.User
    err = db.DB.QueryRow(`
        INSERT INTO users (phone, password_hash, role) 
        VALUES ($1, $2, 'user') 
        RETURNING id, phone, role, created_at`,
        req.Phone, hashedPassword,
    ).Scan(&user.ID, &user.Phone, &user.Role, &user.CreatedAt)
    
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error creating user"})
        return
    }

    c.JSON(http.StatusCreated, gin.H{
        "message": "User registered successfully",
        "user": user,
    })
}

func Login(c *gin.Context) {
    var req models.LoginRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Get user from database - INCLUDING role
    var user models.User
    err := db.DB.QueryRow(`
        SELECT id, phone, password_hash, role, created_at 
        FROM users 
        WHERE phone = $1`,
        req.Phone,
    ).Scan(&user.ID, &user.Phone, &user.PasswordHash, &user.Role, &user.CreatedAt)
    
    if err != nil {
        if err == sql.ErrNoRows {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        }
        return
    }

    // Check password
    if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        return
    }

    // Generate JWT token
    token, err := utils.GenerateJWT(
        user.ID,
        config.AppConfig.JWTSecret,
        config.AppConfig.JWTExpiryHours,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error generating token"})
        return
    }

    // Return user without password hash
    c.JSON(http.StatusOK, models.LoginResponse{
        Token: token,
        User:  user,
    })
}

func ActivateDevice(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }

    var req models.ActivateDeviceRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if device exists and is not activated
    var existingUserID sql.NullInt64
    var deviceSecret string
    var isActive bool
    
    err := db.DB.QueryRow(`
        SELECT user_id, device_secret, is_active 
        FROM devices 
        WHERE serial = $1`, 
        req.Serial,
    ).Scan(&existingUserID, &deviceSecret, &isActive)
    
    if err != nil {
        if err == sql.ErrNoRows {
            c.JSON(http.StatusNotFound, gin.H{"error": "Device not found. Please contact admin."})
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        }
        return
    }
    
    // Verify secret
    if deviceSecret != req.Secret {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid device secret"})
        return
    }
    
    // Check if already activated
    if existingUserID.Valid {
        c.JSON(http.StatusConflict, gin.H{"error": "Device already activated"})
        return
    }
    
    // Activate device for user
    _, err = db.DB.Exec(`
        UPDATE devices 
        SET user_id = $1, is_active = true, activated_at = NOW()
        WHERE serial = $2 AND is_active = false`,
        userID, req.Serial,
    )
    
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error activating device"})
        return
    }
    
    // Log activation
    _, _ = db.DB.Exec(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
        VALUES ($1, $2, $3, $4, $5)`,
        userID, "ACTIVATE_DEVICE", "device", req.Serial, c.ClientIP(),
    )
    
    c.JSON(http.StatusOK, gin.H{"message": "Device activated successfully"})
}

func GetUserDevices(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }

    rows, err := db.DB.Query(`
        SELECT serial, activated_at 
        FROM devices 
        WHERE user_id=$1 
        ORDER BY activated_at DESC`,
        userID,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    devices := []models.Device{}
    for rows.Next() {
        var device models.Device
        var activatedAt sql.NullTime
        
        if err := rows.Scan(&device.Serial, &activatedAt); err != nil {
            continue
        }
        
        // Convert to pointer
        uid := userID.(int)
        device.UserID = &uid  // Fixed: use pointer
        
        if activatedAt.Valid {
            device.ActivatedAt = &activatedAt.Time  // Note: ActivatedAt should also be a pointer in the model
        }
        
        devices = append(devices, device)
    }

    c.JSON(http.StatusOK, gin.H{"devices": devices})
}


