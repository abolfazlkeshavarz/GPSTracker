package db

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

var RedisClient *redis.Client
var Ctx = context.Background()

func InitRedis(addr, password string) error {
	RedisClient = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	})

	// Test connection
	if err := RedisClient.Ping(Ctx).Err(); err != nil {
		return err
	}

	log.Println("Connected to Redis")
	return nil
}

func CloseRedis() {
	if RedisClient != nil {
		RedisClient.Close()
	}
}
