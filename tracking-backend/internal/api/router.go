package api

import (
    "net/http"
    "time"

    "tracking-backend/internal/config"

    "github.com/gin-gonic/gin"
)

func SetupRouter(cfg *config.Config) *gin.Engine {
    router := gin.Default()

    // Reject absurdly large request bodies before they are parsed.
    router.Use(func(c *gin.Context) {
        c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20) // 1 MiB
        c.Next()
    })

    // CORS middleware (for web/mobile apps).
    router.Use(func(c *gin.Context) {
        origin := c.GetHeader("Origin")

        // "*" cannot be combined with Allow-Credentials — browsers reject the
        // pair outright — so echo back only origins we actually trust.
        if origin != "" && IsOriginAllowed(origin) {
            c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
            c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
            c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
            c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
            c.Writer.Header().Set("Access-Control-Max-Age", "600")
        }

        // Responses differ per origin, so caches must key on it.
        c.Writer.Header().Add("Vary", "Origin")

        if c.Request.Method == http.MethodOptions {
            c.AbortWithStatus(http.StatusNoContent)
            return
        }

        c.Next()
    })

    // Public routes. These verify a credential, so they are rate limited per
    // IP to make online password guessing impractical.
    authLimiter := RateLimitMiddleware(10, time.Minute)
    router.POST("/api/register", authLimiter, Register)
    router.POST("/api/login", authLimiter, Login)

    // Public: a third party must be able to verify a certificate without an
    // account on this system. That is the point of signing asymmetrically.
    router.GET("/api/certificate-key", GetCertificatePublicKey)

    // Public: the VAPID application server key is public by definition, and
    // the client needs it before it can offer to enable notifications.
    router.GET("/api/push/vapid-key", GetVAPIDKey)

    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    // Protected routes
    authorized := router.Group("/api")
    authorized.Use(AuthMiddleware(cfg.JWTSecret))
    {
        // Device management. Activation checks a device secret, so it gets the
        // same brute-force protection as login.
        authorized.POST("/activate", RateLimitMiddleware(10, time.Minute), ActivateDevice)
        authorized.GET("/devices", GetUserDevices)
        authorized.GET("/devices/:serial/latest", GetLatestLocation)
        authorized.GET("/devices/:serial/history", GetLocationHistory)
        authorized.GET("/devices/:serial/track", GetDeviceTrack)

        // Tamper-evident history
        authorized.GET("/devices/:serial/verify", GetDeviceChainVerification)
        authorized.GET("/devices/:serial/certificate", GetDeviceCertificate)
        authorized.GET("/devices/:serial/signal", GetSignalQuality)
        authorized.GET("/devices/:serial/status", GetDeviceStatus)

        // Data export
        authorized.GET("/devices/:serial/export.csv", ExportDeviceHistoryCSV)

        // Device customization
        authorized.PUT("/devices/:serial/name", RenameDevice)

        // Odometer: lifetime distance total, accumulated on the ingest path.
        authorized.GET("/devices/:serial/odometer", GetOdometer)
        authorized.PUT("/devices/:serial/odometer", SetOdometer)

        // The configurator: per-device alert rules and reporting interval.
        authorized.GET("/devices/:serial/settings", GetDeviceSettings)
        authorized.PUT("/devices/:serial/settings", UpdateDeviceSettings)

        // Remote control. Issuing is rate limited: these reach a physical
        // vehicle, so a runaway client or a stolen token must not be able to
        // flood the broker with engine commands.
        authorized.POST("/devices/:serial/commands", RateLimitMiddleware(20, time.Minute), IssueCommand)
        authorized.GET("/devices/:serial/commands", ListCommands)

        // Plan and warranty status.
        authorized.GET("/devices/:serial/subscription", GetDeviceSubscription)

        // Web Push registration for this browser / installed PWA.
        authorized.POST("/push/subscribe", SubscribePush)
        authorized.POST("/push/unsubscribe", UnsubscribePush)
        authorized.POST("/push/test", RateLimitMiddleware(5, time.Minute), TestPush)

        // Geofencing
        authorized.GET("/devices/:serial/geofences", ListGeofences)
        authorized.POST("/devices/:serial/geofences", CreateGeofence)
        authorized.PUT("/devices/:serial/geofences/:id", UpdateGeofence)
        authorized.DELETE("/devices/:serial/geofences/:id", DeleteGeofence)

        // Alerts
        authorized.GET("/alerts", ListAlerts)
        authorized.POST("/alerts/:id/read", MarkAlertRead)
        authorized.POST("/alerts/read-all", MarkAllAlertsRead)

        // Self-service account management
        authorized.GET("/me", GetMe)
        authorized.PUT("/me/password", ChangeMyPassword)

        // WebSocket connections
        authorized.GET("/ws", HandleWebSocket)
        authorized.GET("/ws/device/:serial", HandleDeviceWebSocket)
    }
    
    admin := router.Group("/api/admin")
    admin.Use(AuthMiddleware(cfg.JWTSecret))
    admin.Use(AdminMiddleware())
    {
        // User management
        admin.GET("/users", AdminGetUsers)
        admin.GET("/users/:id", AdminGetUser)
        admin.POST("/users", AdminCreateUser)
        admin.PUT("/users/:id", AdminUpdateUser)
        admin.DELETE("/users/:id", AdminDeleteUser)
        admin.GET("/users/:id/devices", AdminGetUserDevices)
        
        // Device management
        admin.GET("/devices", AdminGetDevices)
        admin.POST("/devices", AdminCreateDevice)
        admin.PUT("/devices/:serial", AdminUpdateDevice)
        admin.DELETE("/devices/:serial", AdminDeleteDevice)
        admin.POST("/devices/:serial/deactivate", AdminDeactivateDevice)
        admin.POST("/devices/:serial/assign", AdminAssignDeviceToUser)

        // Commercial: plan renewal and the inventory/warranty fields. Only an
        // admin may change these — a customer extending their own
        // subscription would make the whole thing decorative.
        admin.POST("/devices/:serial/subscription", AdminRenewSubscription)
        admin.PUT("/devices/:serial/inventory", AdminUpdateInventory)
        
        // Audit logs
        admin.GET("/logs", AdminGetLogs)
        
        // Statistics
        admin.GET("/stats", AdminGetEnhancedStats)
    }

    return router
}