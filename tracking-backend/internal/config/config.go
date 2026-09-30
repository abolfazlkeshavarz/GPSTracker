package config

import (
    "log"
    "os"
    "strconv"
    "strings"

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

    // TrustedProxies lists the proxy addresses/CIDRs whose X-Forwarded-For
    // header is believed. Everything else is ignored.
    TrustedProxies []string
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

    mqttBroker := getEnv("MQTT_BROKER", "tcp://localhost:1883")
    mqttUser := getEnv("MQTT_USER", "")
    mqttPassword := getEnv("MQTT_PASSWORD", "")
    dbPassword := getEnv("DB_PASSWORD", "")
    if env == "production" {
        // Weak or default credentials used to be baked in as fallbacks, so a
        // missing variable quietly shipped "admin" to production.
        if dbPassword == "" || dbPassword == "admin" || dbPassword == "postgres" {
            log.Fatal("DB_PASSWORD must be set to a strong value in production")
        }
        if mqttPassword == "" || mqttPassword == "admin" {
            log.Fatal("MQTT_PASSWORD must be set to a strong value in production")
        }
    }

    trusted := []string{}
    for _, p := range strings.Split(getEnv("TRUSTED_PROXIES", "127.0.0.1,::1,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16"), ",") {
        if p = strings.TrimSpace(p); p != "" {
            trusted = append(trusted, p)
        }
    }

    return &Config{
        // PostgreSQL
        DBHost:     getEnv("DB_HOST", "localhost"),
        DBPort:     getEnv("DB_PORT", "5432"),
        DBUser:     getEnv("DB_USER", "postgres"),
        DBPassword: dbPassword,
        DBName:     getEnv("DB_NAME", "tracking_db"),

        // Redis
        RedisHost:     getEnv("REDIS_HOST", "localhost"),
        RedisPort:     getEnv("REDIS_PORT", "6379"),
        RedisPassword: getEnv("REDIS_PASSWORD", ""),

        // MQTT
        MQTTBroker:   mqttBroker,
        MQTTUser:     mqttUser,
        MQTTPassword: mqttPassword,
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

        TrustedProxies: trusted,
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