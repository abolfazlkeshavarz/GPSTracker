package api

import (
    "tracking-backend/internal/config"

    "github.com/gin-gonic/gin"
)

func SetupRouter(cfg *config.Config) *gin.Engine {
    router := gin.Default()

    // CORS middleware (for web/mobile apps)
    router.Use(func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }

        c.Next()
    })

    // Public routes
    router.POST("/api/register", Register)
    router.POST("/api/login", Login)

    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    // Protected routes
    authorized := router.Group("/api")
    authorized.Use(AuthMiddleware(cfg.JWTSecret))
    {
        // Device management
        authorized.POST("/activate", ActivateDevice)
        authorized.GET("/devices", GetUserDevices)
        authorized.GET("/devices/:serial/latest", GetLatestLocation)
        authorized.GET("/devices/:serial/history", GetLocationHistory)
        authorized.GET("/devices/:serial/signal", GetSignalQuality)
        authorized.GET("/devices/:serial/status", GetDeviceStatus)
        
        // WebSocket connections
        authorized.GET("/ws", HandleWebSocket)
        authorized.GET("/ws/device/:serial", HandleDeviceWebSocket)
    }


    
    admin := router.Group("/api/admin")
    admin.Use(AuthMiddleware(cfg.JWTSecret))
    admin.Use(AdminMiddleware())
    {
        // Device management
        admin.POST("/devices", AdminCreateDevice)
        admin.GET("/devices", AdminGetDevices)
        admin.PUT("/devices/:serial", AdminUpdateDevice)
        admin.DELETE("/devices/:serial", AdminDeleteDevice)
        
        // User management
        admin.GET("/users", AdminGetUsers)
        
        // Audit logs
        admin.GET("/logs", AdminGetLogs)
        
        // Statistics
        admin.GET("/stats", AdminGetStats)
    }

    return router
}