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

    // Insert user and return all fields including created_at
    var user models.User
    err = db.DB.QueryRow(`
        INSERT INTO users (phone, password_hash) 
        VALUES ($1, $2) 
        RETURNING id, phone, created_at`,
        req.Phone, hashedPassword,
    ).Scan(&user.ID, &user.Phone, &user.CreatedAt)
    
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

    // Get user from database - ADD created_at to SELECT
    var user models.User
    err := db.DB.QueryRow(`
        SELECT id, phone, password_hash, created_at 
        FROM users 
        WHERE phone = $1`,
        req.Phone,
    ).Scan(&user.ID, &user.Phone, &user.PasswordHash, &user.CreatedAt)
    
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

    // Check if device is already activated by another user
    var existingUserID sql.NullInt64
    err := db.DB.QueryRow("SELECT user_id FROM devices WHERE serial=$1", req.Serial).Scan(&existingUserID)
    if err != nil && err != sql.ErrNoRows {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    if existingUserID.Valid && int(existingUserID.Int64) != userID.(int) {
        c.JSON(http.StatusConflict, gin.H{"error": "Device already activated by another user"})
        return
    }

    // Activate device for user
    _, err = db.DB.Exec(
        "INSERT INTO devices (serial, user_id) VALUES ($1, $2) ON CONFLICT (serial) DO UPDATE SET user_id=$2",
        req.Serial, userID,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error activating device"})
        return
    }

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
        if err := rows.Scan(&device.Serial, &device.ActivatedAt); err != nil {
            continue
        }
        device.UserID = userID.(int)
        devices = append(devices, device)
    }

    c.JSON(http.StatusOK, gin.H{"devices": devices})
}