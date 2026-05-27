package main

import (
    "log"
    "os"
    "os/signal"
    "syscall"
    "tracking-backend/internal/utils"
    "tracking-backend/internal/api"
    "tracking-backend/internal/config"
    "tracking-backend/internal/db"
    "tracking-backend/internal/mqtt"
)

func main() {

    cfg := config.Load()
    utils.InitLogger()

    // SET GLOBAL CONFIG
    config.AppConfig = cfg

    // PostgreSQL
    if err := db.InitPostgres(cfg.PostgresDSN()); err != nil {
        log.Fatal(err)
    }
    defer db.ClosePostgres()

    // Redis
    if err := db.InitRedis(cfg.RedisAddr(), cfg.RedisPassword); err != nil {
        log.Fatal(err)
    }
    defer db.CloseRedis()

    // MQTT
    go mqtt.StartSubscriber(
        db.DB,
        db.RedisClient,
        cfg.MQTTBroker,
        cfg.MQTTUser,
        cfg.MQTTPassword,
        cfg.MQTTTopic,
    )

    router := api.SetupRouter(cfg)

    go func() {
        log.Println("Server running on port", cfg.ServerPort)

        if err := router.Run(":" + cfg.ServerPort); err != nil {
            log.Fatal(err)
        }
    }()

    // graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    <-quit

    log.Println("Shutting down...")
}
