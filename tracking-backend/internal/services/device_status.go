package services

import (
    "fmt"
    "time"

    "tracking-backend/internal/db"
)

func SetDeviceOnline(serial string) error {

    key := fmt.Sprintf("device_status:%s", serial)

    return db.RedisClient.Set(
        db.Ctx,
        key,
        "online",
        60*time.Second,
    ).Err()
}

func IsDeviceOnline(serial string) bool {

    key := fmt.Sprintf("device_status:%s", serial)

    result, err := db.RedisClient.Get(db.Ctx, key).Result()

    if err != nil {
        return false
    }

    return result == "online"
}
