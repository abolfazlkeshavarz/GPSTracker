package api

import (
    "crypto/subtle"
    "database/sql"
    "net/http"
    "regexp"
    "strings"

    "tracking-backend/internal/config"
    "tracking-backend/internal/db"
    "tracking-backend/internal/models"
    "tracking-backend/internal/utils"

    "github.com/gin-gonic/gin"
)

// phonePattern accepts an international or local phone number, and also the
// literal "admin" used by the bootstrap account.
var phonePattern = regexp.MustCompile(`^(admin|\+?[0-9]{6,20})$`)

// dummyHash is a valid bcrypt hash of a random value. Logins for unknown
// phone numbers are checked against it so that a missing user costs the same
// wall-clock time as a wrong password, closing the timing side channel that
// would otherwise reveal which accounts exist.
const dummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

// secretsMatch compares two secrets without leaking their contents through
// timing. A plain != returns as soon as it hits a differing byte.
func secretsMatch(a, b string) bool {
    return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func Register(c *gin.Context) {
    var req models.RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    req.Phone = strings.TrimSpace(req.Phone)
    if !phonePattern.MatchString(req.Phone) {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid phone number"})
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
        // The EXISTS check above is racy; the unique index is what actually
        // enforces uniqueness, so report a conflict rather than a 500.
        if strings.Contains(err.Error(), "duplicate key") {
            c.JSON(http.StatusConflict, gin.H{"error": "User already exists"})
            return
        }
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

    req.Phone = strings.TrimSpace(req.Phone)

    // Get user from database - INCLUDING role
    var user models.User
    err := db.DB.QueryRow(`
        SELECT id, phone, password_hash, role, created_at
        FROM users
        WHERE phone = $1`,
        req.Phone,
    ).Scan(&user.ID, &user.Phone, &user.PasswordHash, &user.Role, &user.CreatedAt)

    if err != nil && err != sql.ErrNoRows {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }

    userFound := err == nil

    // Always run bcrypt, even when the account does not exist, so response
    // time does not reveal which phone numbers are registered.
    storedHash := dummyHash
    if userFound {
        storedHash = user.PasswordHash
    }

    passwordOK := utils.CheckPasswordHash(req.Password, storedHash)

    if !userFound || !passwordOK {
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

    req.Serial = strings.TrimSpace(req.Serial)

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
    if !secretsMatch(deviceSecret, req.Secret) {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid device secret"})
        return
    }

    // Check if already activated
    if existingUserID.Valid {
        c.JSON(http.StatusConflict, gin.H{"error": "Device already activated"})
        return
    }

    // Activate device for user. The user_id IS NULL guard makes this the
    // authoritative check: two concurrent activations of the same device can
    // both pass the read above, but only one can win this UPDATE.
    result, err := db.DB.Exec(`
        UPDATE devices
        SET user_id = $1, is_active = true, activated_at = NOW()
        WHERE serial = $2 AND user_id IS NULL`,
        userID, req.Serial,
    )

    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error activating device"})
        return
    }

    // Previously the result was discarded and the handler reported success
    // even when it had claimed nothing.
    rowsAffected, err := result.RowsAffected()
    if err != nil || rowsAffected == 0 {
        c.JSON(http.StatusConflict, gin.H{"error": "Device already activated"})
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
    userID := c.GetInt("user_id")
    if userID == 0 {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }

    // is_active was missing from the projection, so every device came back
    // marked inactive regardless of its real state.
    rows, err := db.DB.Query(`
        SELECT serial, is_active, activated_at
        FROM devices
        WHERE user_id=$1
        ORDER BY activated_at DESC NULLS LAST`,
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

        if err := rows.Scan(&device.Serial, &device.IsActive, &activatedAt); err != nil {
            continue
        }

        uid := userID
        device.UserID = &uid

        if activatedAt.Valid {
            device.ActivatedAt = &activatedAt.Time
        }

        devices = append(devices, device)
    }

    if err := rows.Err(); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"devices": devices})
}


