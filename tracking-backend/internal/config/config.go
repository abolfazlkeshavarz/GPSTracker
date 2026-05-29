package config

import (
    "log"
    "os"
    "strconv"

    "github.com/joho/godotenv"
)

type Config struct {
    // PostgreSQL
    DBHost     string
    DBPort     string
    DBUser     string
    DBPassword string
    DBName     string

    // Redis
    RedisHost     string
    RedisPort     string
    RedisPassword string

    // MQTT
    MQTTBroker   string
    MQTTUser     string
    MQTTPassword string
    MQTTTopic    string

    // JWT
    JWTSecret      []byte
    JWTExpiryHours int
    
    //Domain
    AppDomain string
    
    // Server
    ServerPort string
}

func Load() *Config {
    // Load .env file if it exists
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found, using environment variables")
    }

    jwtExpiryHours, _ := strconv.Atoi(getEnv("JWT_EXPIRY_HOURS", "72"))

    return &Config{
        // PostgreSQL
        DBHost:     getEnv("DB_HOST", "localhost"),
        DBPort:     getEnv("DB_PORT", "5432"),
        DBUser:     getEnv("DB_USER", "postgres"),
        DBPassword: getEnv("DB_PASSWORD", "admin"),
        DBName:     getEnv("DB_NAME", "tracking_db"),

        // Redis
        RedisHost:     getEnv("REDIS_HOST", "localhost"),
        RedisPort:     getEnv("REDIS_PORT", "6379"),
        RedisPassword: getEnv("REDIS_PASSWORD", ""),

        // MQTT
        MQTTBroker:   getEnv("MQTT_BROKER", "tcp://85.9.123.30:1883"),
        MQTTUser:     getEnv("MQTT_USER", "testquitto"),
        MQTTPassword: getEnv("MQTT_PASSWORD", "admin"),
        MQTTTopic:    getEnv("MQTT_TOPIC", "devices/+/location"),

        // JWT
        JWTSecret:      []byte(getEnv("JWT_SECRET", "Whoknowwho!!11Whoknowwho!!11")),
        JWTExpiryHours: jwtExpiryHours,

        // Server
        ServerPort: getEnv("SERVER_PORT", "8080"),
    }
}

func (c *Config) PostgresDSN() string {
    return "host=" + c.DBHost +
        " port=" + c.DBPort +
        " user=" + c.DBUser +
        " password=" + c.DBPassword +
        " dbname=" + c.DBName +
        " sslmode=disable"
}

func (c *Config) RedisAddr() string {
    return c.RedisHost + ":" + c.RedisPort
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}