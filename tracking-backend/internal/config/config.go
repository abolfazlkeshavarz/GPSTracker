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
    SSLMode    string
    Env        string

    // CertSigningKey is the base64 Ed25519 private key used to sign trip
    // certificates. Empty disables certificate issuing; verification of
    // previously issued documents still works, since that only needs the
    // public key embedded in them.
    CertSigningKey string

    // VAPID identity for Web Push. Without a key pair the push channel stays
    // disabled and the app falls back to in-page alerts only, so an
    // environment that never configured it still runs.
    VAPIDPublicKey  string
    VAPIDPrivateKey string
    VAPIDSubject    string
}

// insecureDevSecret is the fallback signing key. It is public knowledge (it
// lives in the repo), so it is only ever allowed outside production.
const insecureDevSecret = "insecure-development-secret-do-not-use-in-production"

func Load() *Config {
    // Load .env file if it exists
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found, using environment variables")
    }

    env := getEnv("APP_ENV", "development")

    // A bad JWT_EXPIRY_HOURS used to be swallowed by a discarded error and
    // become 0, which made every issued token expire immediately.
    jwtExpiryHours := 72
    if raw := getEnv("JWT_EXPIRY_HOURS", ""); raw != "" {
        parsed, err := strconv.Atoi(raw)
        if err != nil || parsed <= 0 {
            log.Printf("Invalid JWT_EXPIRY_HOURS %q, falling back to %d hours", raw, jwtExpiryHours)
        } else {
            jwtExpiryHours = parsed
        }
    }

    jwtSecret := getEnv("JWT_SECRET", "")
    if jwtSecret == "" {
        if env == "production" {
            log.Fatal("JWT_SECRET must be set in production")
        }
        log.Println("WARNING: JWT_SECRET is not set, using an insecure development key")
        jwtSecret = insecureDevSecret
    } else if len(jwtSecret) < 32 {
        // HS256 keys shorter than the 256-bit output add nothing over a
        // full-length one and are well within brute-force range.
        if env == "production" {
            log.Fatal("JWT_SECRET must be at least 32 characters in production")
        }
        log.Println("WARNING: JWT_SECRET is shorter than 32 characters")
    }

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
        JWTSecret:      []byte(jwtSecret),
        JWTExpiryHours: jwtExpiryHours,

        // Domain
        AppDomain: getEnv("APP_DOMAIN", ""),

        // Server
        CertSigningKey: getEnv("CERT_SIGNING_KEY", ""),

        // Web Push
        VAPIDPublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
        VAPIDPrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
        VAPIDSubject:    getEnv("VAPID_SUBJECT", "mailto:support@localhost"),

        ServerPort: getEnv("SERVER_PORT", "8080"),
        SSLMode:    getEnv("DB_SSLMODE", "disable"),
        Env:        env,
    }
}

// IsProduction reports whether the app is running with production guardrails.
func (c *Config) IsProduction() bool {
    return c.Env == "production"
}

func (c *Config) PostgresDSN() string {
    return "host=" + c.DBHost +
        " port=" + c.DBPort +
        " user=" + c.DBUser +
        " password=" + c.DBPassword +
        " dbname=" + c.DBName +
        " sslmode=" + c.SSLMode
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