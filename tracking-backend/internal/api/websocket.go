package api

import (
    "encoding/json"
    "log"
    "net/http"

    "tracking-backend/internal/db"
    "tracking-backend/internal/config"
    "tracking-backend/internal/utils"
    "github.com/gin-gonic/gin"
    "github.com/gorilla/websocket"
    //"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,

    CheckOrigin: func(r *http.Request) bool {

        origin := r.Header.Get("Origin")

        allowedOrigins := map[string]bool{
            "http://localhost": true,
            "http://localhost:80": true,
            "http://127.0.0.1": true,
            "http://127.0.0.1:80": true,
            "http://localhost:3000": true,
            "http://localhost:5173": true,
        }

        // allow empty origin for mobile apps / Postman
        if origin == "" {
            return true
        }

        return allowedOrigins[origin]
    },
}
func HandleWebSocket(c *gin.Context) {
    
    token := c.Query("token")

    if token == "" {
        c.JSON(http.StatusUnauthorized, gin.H{
            "error": "missing token",
        })
        return
    }

    claims, err := utils.ValidateJWT(
        token,
        config.AppConfig.JWTSecret,
    )

    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{
            "error": "invalid token",
        })
        return
    }

    userID := claims.UserID
    
    // Get user's devices
    rows, err := db.DB.Query(`
        SELECT serial FROM devices WHERE user_id=$1`,
        userID,
    )
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()

    userDevices := make(map[string]bool)
    for rows.Next() {
        var serial string
        if err := rows.Scan(&serial); err == nil {
            userDevices[serial] = true
        }
    }

    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        log.Println("WebSocket upgrade error:", err)
        return
    }
    defer conn.Close()

    log.Printf("User %d connected via WebSocket", userID)

    // Subscribe to Redis channel
    pubsub := db.RedisClient.Subscribe(db.Ctx, "device_updates")
    defer pubsub.Close()

    ch := pubsub.Channel()

    // Send initial connection confirmation
    conn.WriteJSON(gin.H{"type": "connected", "message": "WebSocket connected"})

    for {
        select {
        case msg := <-ch:
            // Parse message to check if it belongs to user's devices
            var location map[string]interface{}
            if err := json.Unmarshal([]byte(msg.Payload), &location); err == nil {
                if device, ok := location["device"].(string); ok {
                    if userDevices[device] {
                        if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
                            log.Println("WebSocket write error:", err)
                            return
                        }
                    }
                }
            }
        }
    }
}

func HandleDeviceWebSocket(c *gin.Context) {
    serial := c.Param("serial")
    userID := c.GetInt("user_id")

    // Verify ownership
    if !deviceBelongsToUser(userID, serial) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
        return
    }

    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        log.Println("WebSocket upgrade error:", err)
        return
    }
    defer conn.Close()

    log.Printf("User %d subscribed to device %s via WebSocket", userID, serial)

    // Subscribe to specific device updates
    pubsub := db.RedisClient.Subscribe(db.Ctx, "device_updates")
    defer pubsub.Close()

    ch := pubsub.Channel()

    for {
        select {
        case msg := <-ch:
            var location map[string]interface{}
            if err := json.Unmarshal([]byte(msg.Payload), &location); err == nil {
                if device, ok := location["device"].(string); ok && device == serial {
                    if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
                        log.Println("WebSocket write error:", err)
                        return
                    }
                }
            }
        }
    }
}