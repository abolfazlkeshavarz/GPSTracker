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
    "tracking-backend/internal/push"
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

    // Web Push. Disabled without a VAPID key pair, in which case alerts still
    // reach open tabs over the WebSocket — they just cannot reach a phone in
    // someone's pocket.
    push.Configure(push.Config{
        PublicKey:  cfg.VAPIDPublicKey,
        PrivateKey: cfg.VAPIDPrivateKey,
        Subject:    cfg.VAPIDSubject,
    })
    if push.Enabled() {
        log.Println("Web Push enabled")
    } else {
        log.Println("Web Push disabled (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable)")
    }

    // Offline/back-online alerts have no triggering message to hook, so they
    // are polled. 60s keeps the delay before an alert fires short without
    // hammering Postgres with a full-device-table scan.
    go mqtt.StartOfflineSweeper(db.DB, db.RedisClient, 60*time.Second)

    // Commands that could not be delivered when they were issued, and stale
    // ones that should now expire rather than execute late.
    go mqtt.StartCommandSweeper(db.DB, 30*time.Second)

    // Plan expiry is calendar-scale; an hour's delay on a renewal reminder is
    // invisible to a customer.
    go mqtt.StartSubscriptionSweeper(db.DB, db.RedisClient, time.Hour)

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
    mqtt.StopCommandSweeper()
    mqtt.StopSubscriptionSweeper()

    log.Println("Shutdown complete")
}
