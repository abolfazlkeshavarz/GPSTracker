package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "tracking-backend/internal/api"
    "tracking-backend/internal/config"
    "tracking-backend/internal/db"
    "tracking-backend/internal/mqtt"
    "tracking-backend/internal/utils"
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

    // Offline/back-online alerts have no triggering message to hook, so they
    // are polled. 60s keeps the delay before an alert fires short without
    // hammering Postgres with a full-device-table scan.
    go mqtt.StartOfflineSweeper(db.DB, db.RedisClient, 60*time.Second)

    router := api.SetupRouter(cfg)

    srv := &http.Server{
        Addr:              ":" + cfg.ServerPort,
        Handler:           router,
        ReadHeaderTimeout: 10 * time.Second,
        IdleTimeout:       120 * time.Second,
        // No ReadTimeout/WriteTimeout: they would cut off long-lived
        // WebSocket connections, which manage their own deadlines.
    }

    go func() {
        log.Println("Server running on port", cfg.ServerPort)

        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    // graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    <-quit

    log.Println("Shutting down...")

    // Previously this only logged and exited, dropping in-flight requests and
    // never disconnecting from the MQTT broker.
    ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Println("Server shutdown error:", err)
    }

    mqtt.StopSubscriber()
    mqtt.StopOfflineSweeper()

    log.Println("Shutdown complete")
}
