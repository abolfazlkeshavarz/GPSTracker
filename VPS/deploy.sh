#!/bin/bash
set -e

# ============================================================
# GPSTracker Deployment Script
# Usage: sudo bash deploy.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ============================================================
# CONFIGURATION — edit these before running
# ============================================================

DOMAIN="abolfazl.fun"
DB_USER="postgres"
DB_PASSWORD="admin"
DB_NAME="tracking_db"

BACKEND_DIR="/opt/tracking-backend"
FRONTEND_DIR="/var/www/tracking-frontend"
SSL_DIR="/etc/nginx/ssl/${DOMAIN}"
MAPS_DATA_DIR="/root/maps"

# MQTT Configuration
MQTT_USER="testquitto"
MQTT_PASSWORD="admin"
MQTT_PORT=1883
MQTT_WS_PORT=8083

# JWT signing key. This must NOT be hardcoded: this script is committed to the
# repository, so a literal value here is public knowledge and anyone could
# forge a token for any user, including an admin.
#
# Generated once and then reused from the existing .env on later deploys, so
# redeploying does not invalidate everyone's active sessions.
if [[ -f "${BACKEND_DIR}/.env" ]] && grep -q '^JWT_SECRET=.\+' "${BACKEND_DIR}/.env"; then
  JWT_SECRET="$(grep '^JWT_SECRET=' "${BACKEND_DIR}/.env" | head -1 | cut -d= -f2-)"
else
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-64)"
fi

# Maps Configuration
MAPS_DOWNLOAD_URL="https://bucketfirst.s3.ir-thr-at1.arvanstorage.ir/iran-output.zip"
MAPS_ZIP_FILE="iran-output.zip"

# ============================================================
# MUST BE RUN AS ROOT
# ============================================================
if [[ $EUID -ne 0 ]]; then
  error "Please run as root: sudo bash deploy.sh"
fi

# ============================================================
# 1. UPDATE PACKAGE LIST AND INSTALL BASE PACKAGES
# ============================================================
log "Updating package list and installing base packages..."
apt-get update -qq
apt-get install -y -qq \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    nginx \
    postgresql \
    postgresql-contrib \
    redis-server \
    mosquitto \
    mosquitto-clients \
    ufw \
    unzip \
    wget

# ============================================================
# 2. INSTALL DOCKER
# ============================================================
log "Installing Docker..."

# Remove old versions if any
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker GPG key and repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl restart docker
log "Docker installed and configured."

# ============================================================
# 2.5. CONFIGURE DOCKER REGISTRY MIRROR (ARVANCLOUD)
# ============================================================
log "Configuring Docker registry mirror (ArvanCloud)..."

# Create Docker daemon configuration directory if it doesn't exist
mkdir -p /etc/docker

# Configure Docker to use ArvanCloud mirror
cat > /etc/docker/daemon.json <<'EOF'
{
  "insecure-registries": ["https://docker.arvancloud.ir"],
  "registry-mirrors": ["https://docker.arvancloud.ir"]
}
EOF

# Restart Docker to apply changes
systemctl restart docker
log "Docker registry mirror configured (ArvanCloud)"

# ============================================================
# 3. MOSQUITTO MQTT BROKER CONFIGURATION
# ============================================================
log "Configuring Mosquitto MQTT broker..."

# Stop Mosquitto if running
systemctl stop mosquitto 2>/dev/null || true

# Backup existing configs if they exist
if [ -f /etc/mosquitto/mosquitto.conf ]; then
    mv /etc/mosquitto/mosquitto.conf /etc/mosquitto/mosquitto.conf.backup.$(date +%s)
fi
if [ -f /etc/mosquitto/conf.d/default.conf ]; then
    mv /etc/mosquitto/conf.d/default.conf /etc/mosquitto/conf.d/default.conf.backup.$(date +%s) 2>/dev/null || true
fi

# Create main mosquitto.conf (without duplicate issues)
cat > /etc/mosquitto/mosquitto.conf <<'EOF'
# Persistence configuration
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information

# Include all config files in conf.d directory
include_dir /etc/mosquitto/conf.d
EOF

# Create password file for authentication
touch /etc/mosquitto/passwd
chmod 600 /etc/mosquitto/passwd
chown mosquitto:mosquitto /etc/mosquitto/passwd

# Add MQTT user
mosquitto_passwd -b /etc/mosquitto/passwd "${MQTT_USER}" "${MQTT_PASSWORD}"

# Create default.conf with listener settings (no persistence_location here)
cat > /etc/mosquitto/conf.d/default.conf <<EOF
# Listeners
listener ${MQTT_PORT} 0.0.0.0
listener ${MQTT_WS_PORT} 0.0.0.0
protocol websockets

# Authentication
allow_anonymous false
password_file /etc/mosquitto/passwd

# Performance settings
max_connections -1
retain_available true
set_tcp_nodelay true
EOF

# Ensure directories have correct permissions
mkdir -p /var/lib/mosquitto
mkdir -p /var/log/mosquitto
chown -R mosquitto:mosquitto /var/lib/mosquitto
chown -R mosquitto:mosquitto /var/log/mosquitto
chmod 750 /var/lib/mosquitto
chmod 750 /var/log/mosquitto

# Enable and start Mosquitto
systemctl enable mosquitto
systemctl start mosquitto

# Verify Mosquitto is running
sleep 2
if systemctl is-active --quiet mosquitto; then
    log "Mosquitto MQTT broker started successfully on port ${MQTT_PORT} (MQTT) and ${MQTT_WS_PORT} (WebSocket)"
else
    error "Failed to start Mosquitto. Check logs with: journalctl -u mosquitto -n 50"
fi

# ============================================================
# 4. SSL CERTIFICATES
# ============================================================
log "Installing SSL certificates..."

mkdir -p "${SSL_DIR}"

# ---- Paste your fullchain.pem here ----
cat > "${SSL_DIR}/fullchain.pem" <<'CERT'
-----BEGIN CERTIFICATE-----
MIIFAjCCA+qgAwIBAgISBchCeiYFwLe5aqOYNicBqVuVMA0GCSqGSIb3DQEBCwUA
MDMxCzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQD
EwNZUjIwHhcNMjYwNjExMjAxNzI5WhcNMjYwOTA5MjAxNzI4WjAXMRUwEwYDVQQD
EwxhYm9sZmF6bC5mdW4wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCz
+tj496nuehxVvi3XsNM8UN5dJTamPfS4wIx8ygA9JLg0VZ/FRlIjPARDybn8pX7H
Iqv1cQAzyxI2ZCSvAQ9Q9K+3fOy4f8Ered69ziZQyg9UW/sjYE/cVDHLDhMGGVzr
dgNSyKJ9sfzdaToq6TzF81hFUzNDcWbUtfO9f97mtTUyKwdFk3ZnFtWSC5rfsz53
5Bs85Dl/kNzt6StPNUotxFz9hjeUTDILpFczANb4CDuOXnQc3Mpe35qaaM1NE59k
dMnBah9eG5Av35gjaRssrcy1c3ZaxDE3xOVsPHAAMrWqxWdvP1Sl0fj5zvM+mjUi
dpKg52s8vfNJZd4ujI5rAgMBAAGjggIqMIICJjAOBgNVHQ8BAf8EBAMCBaAwEwYD
VR0lBAwwCgYIKwYBBQUHAwEwDAYDVR0TAQH/BAIwADAdBgNVHQ4EFgQUHHlXHeQC
0qo4DS/Nz/62RJC8hscwHwYDVR0jBBgwFoAUQBUtJnntMiCe35pyHdYyH4EMgQww
MwYIKwYBBQUHAQEEJzAlMCMGCCsGAQUFBzAChhdodHRwOi8veXIyLmkubGVuY3Iu
b3JnLzAnBgNVHREEIDAegg4qLmFib2xmYXpsLmZ1boIMYWJvbGZhemwuZnVuMBMG
A1UdIAQMMAowCAYGZ4EMAQIBMC4GA1UdHwQnMCUwI6AhoB+GHWh0dHA6Ly95cjIu
Yy5sZW5jci5vcmcvMjIuY3JsMIIBDAYKKwYBBAHWeQIEAgSB/QSB+gD4AHYAyzj3
FYl8hKFEX1vB3fvJbvKaWc1HCmkFhbDLFMMUWOcAAAGeuIq3+gAABAMARzBFAiEA
7GDEjHNoZgSsvud1j5fcrStbFsI5wP5qs+5BT2M87MMCIFgUKtiFDfXOKAEpvZC0
HhV6kct9POpNUgIY8nc62OOGAH4ARq+GPTs+5Z+ld96oJF02sNntIqIj9GF3QSKU
Uu6VUF8AAAGeuIq4QwAIAAAFAAlnStEEAwBHMEUCIEEJT21+IwmbnkfDPlBSpXyV
2oSxG5tpqfs0Nf0sSTfDAiEA7TrjoeRqM8qXvpumZFc7F4aflueyXfezt6alADuy
U/cwDQYJKoZIhvcNAQELBQADggEBAGP6L5fR3b5687RscW9ArsPefAz7rZc667mw
nDzkDFqSuvpucxCAiY/o54Ls9ktp0dtve4b+KTBHTBcWIRQU29nqK+oL0qWSACO7
OXm+DOxHX3ma/nSRPdIIH5MuYk5ofb8BV5Tl2mhgIW7o2WD5/boWqDud8i7aH7M7
V+uaNoDkonzYSouYFIePxL+9dTxWHvW6JGmI/qT1StQ5/leIwqfOSNELVtmCKlbc
Sgf9FnDBe83Yn4WcfqX2Qydb0rI89vRE6hX14mrie6PU4xyKLJwb4EpRJM+ktmEQ
Bvv93SjUZ8z3YKXP1/H7+q2nQevc9tz45/DxEtPEVMfScZ7ak0w=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIE2jCCAsKgAwIBAgIQTr0klH4k05SALYSlL9WzGTANBgkqhkiG9w0BAQsFADAu
MQswCQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZUjAe
Fw0yNTA5MDMwMDAwMDBaFw0yODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYw
FAYDVQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQDEwNZUjIwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQDZ0LxwBppqh84luqMerV/eeL/fXQ7mLQQv1Lnp
WKZbyvGpx6wh6AfnslAnF6ewTkcHA+gSOoBvm3Dfm06AuGiF+KRut4fAcowqnAQQ
CW98+QPP/eOv/wug7Iyk4NkOxf2I6g2f55T6nJoOTLFcukeRq80JGQEYan+dPFr9
OGUgQK2hGKgNkW87pappsOAuUJcroYhRt5uUis4qaZireiseu32gzDJNBAiKtsvd
6HX4v25bpkRNcS/B/Gtc9kVbUpD+2PLPxdei3Tim55k4tfAEXwD2qyiPTxrTNq6l
N+AMr5g2c1dNqkOTwjxeV6L5lpP1rGiYvLnRaPlOqyZRPW+5AgMBAAGjge4wgesw
DgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUFBwMBMBIGA1UdEwEB/wQI
MAYBAf8CAQAwHQYDVR0OBBYEFEAVLSZ57TIgnt+ach3WMh+BDIEMMB8GA1UdIwQY
MBaAFN7nW2DQIm1AKH0/DQH+pLVStFGUMDIGCCsGAQUFBwEBBCYwJDAiBggrBgEF
BQcwAoYWaHR0cDovL3lyLmkubGVuY3Iub3JnLzATBgNVHSAEDDAKMAgGBmeBDAEC
ATAnBgNVHR8EIDAeMBygGqAYhhZodHRwOi8veXIuYy5sZW5jci5vcmcvMA0GCSqG
SIb3DQEBCwUAA4ICAQB0ZUQWZ9/Yn9COEpo+JfecMnB0h0vwDm/M66IqXqw3LoaL
mx9lZvRTeDIS67PUeI3yCA2W6PKRD0/FE/G57lOmS+Xy5AaaL00ICGOqjNcCaMWW
8o8nevHOd4i4lqgtznE/28QwlcdJyF8yBiWHpnyjhEpmNWJURgOCOg2xpwRMBCsj
MScqYPtOhBeuYQvSwAEeTML2Ukh6uGuX4E14q65Ja8cdjF5bAldnP1eE4FBaAwsZ
G2fOqqrKV03Y85Nw2btedP1AtliQuJZs/Jo/gXxXdc7LrH3McgnpnbTiAncX7yES
hP6kzQejllqMCIt52HOjxDGWafS7Xw+DKwqmH+Eqy8dcbOuag/1AYlQoKNVK3F5q
Hh6tEDiMqQcLIibGKteE6iHo4A/bIScbzrhXUYuism42ZYzmc48FMVIH3qy4L84E
TdAH2gtxw0PAhvRVXp8HP7wfngpzsN/8xOTpeRSbM4+Qbc56G6+Bifmv6sk1ieQb
NA3wJdl4DDUuQSV8hBgx6zoI1ZSGORprDFux7c6rhc77QZMSRrEgomBeklervEve
86ylWmZ3WWHV6RLMi8xNvjd71r4EPIGgY7BZU/VPBkq+uA7Gb6mbJnFgV43uh3xy
LRFgxIAphIukwTGSMZZR+AI+Qnp0BYTWovHXozOf3H8r6hozEoT02JHn0AeTfA==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----
CERT

# ---- Paste your privkey.pem here ----
cat > "${SSL_DIR}/privkey.pem" <<'KEY'
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCz+tj496nuehxV
vi3XsNM8UN5dJTamPfS4wIx8ygA9JLg0VZ/FRlIjPARDybn8pX7HIqv1cQAzyxI2
ZCSvAQ9Q9K+3fOy4f8Ered69ziZQyg9UW/sjYE/cVDHLDhMGGVzrdgNSyKJ9sfzd
aToq6TzF81hFUzNDcWbUtfO9f97mtTUyKwdFk3ZnFtWSC5rfsz535Bs85Dl/kNzt
6StPNUotxFz9hjeUTDILpFczANb4CDuOXnQc3Mpe35qaaM1NE59kdMnBah9eG5Av
35gjaRssrcy1c3ZaxDE3xOVsPHAAMrWqxWdvP1Sl0fj5zvM+mjUidpKg52s8vfNJ
Zd4ujI5rAgMBAAECggEAL28u7RsU8dHEEwMPAPhNC+oCWQk8SH8uttykiiURAAxj
8gMZGzyn3Dpuo1EQ0Bnr+l7UdFkmZQAh2iz1kBwW5c6/Wvw1RYECL8usXVjuNz+x
35lobI/vLFISV4JrmCFqIHKXeKOBU+BrlQ0tM+8JweAbRRYi/iTupaQYy7peTG5G
wWIrcAmwKUo4UDDtZ8GMZ2ZMs5SQHwEwEOM1jnw0ZI2xWSol5ruc6Ys/sN/vGvMG
70TAglW5WqvyDqVSm89IbG8d0sWl19Nqf8CB7C64JjF3sqBIvyMbtQbj36+N6ZG2
yMjIxIOBtY1GZEHKESeaki908YI86pFlF+olimxtkQKBgQDzPjQXY5YS6IphkJ/O
THeEcXrkU3jfTMmHWN3Svdro3k+b1xK7flWd0zL308UgAhCVfA3G/MKNsskYj92j
fbugBdPKv3+FHtXipe87LrZhTVtyBUCU3XT1++Gx7iygwM49BvEKgmsHNLH5zrDy
VKpNHNPQPc42PoLfkiuUblnfewKBgQC9a0TzimEpjvM6xGfmUwdBz4hFW1x2Ht5/
teJWHpDm4g8mHVnV54F7SAoyx8uZg0GhdS9W09Bm840xcR+MxPpWr5EveYCIVgil
hoPedgqDynlQQpiMjrgdwoeZkpkAQJOH5+cLXeWDmvNmhDoubkI6RKuNx5OQnvSG
hiD1kKbh0QKBgQDL54cPXEH/08O9CdmMvHksI1zbbkXTGrGNric1dEXAFCwz/VUM
q1jmFpeRPIrwzApO5VE/T79fvVHqLx+i39Ga0Ye7XFBvrWuqtWMX/46PfqN7r391
yzcyxVVrLLdognfgnKMPJkjGH5xaRrP6UJL6VYIR/N2Sh1B6TjQOF3trZQKBgQCE
Iw6orkH1kclPl6+7VvRbDoFLkN5BcGtav/EyjoQa7FwRBKyksaj77Vdf8UywvIXO
Mkdh1MUu7Hv0n6uYsdjJHBS1/5aQhSPnBJ19VO8k3NwgBzUP6Ie8CvY5RbECIgpI
5pegsFHpqvBc9aT4uuXsa/cZIr5oRtrh9TOM2unv4QKBgBveCsQwyq3t/oYnaDth
V88M1JKV8BuMsBhYx1Gk8GEkrpDcNxQVcCe5vXSEaATn1VwOU1R5nWR4Zz1LzAPa
Uukg7moaxS/2an/dcIYmEu1aEPENxoBEQ+c0o0iTncXRy42yQVzJQp7tfYU4O96a
eRUjSLM4YISjXQg6kRjpDYdo
-----END PRIVATE KEY-----
KEY

chmod 600 "${SSL_DIR}/privkey.pem"
chmod 644 "${SSL_DIR}/fullchain.pem"
log "SSL certificates installed."

# ============================================================
# 5. POSTGRESQL SETUP
# ============================================================
log "Configuring PostgreSQL..."

systemctl enable postgresql
systemctl start postgresql

# Set postgres user password
sudo -u postgres psql -c "ALTER USER ${DB_USER} PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true

# Create DB and schema (idempotent: skip if already exists)
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 && warn "Database ${DB_NAME} already exists, skipping creation." || {

    log "Creating database and schema..."
    sudo -u postgres psql <<SQL
CREATE DATABASE ${DB_NAME};
SQL

    sudo -u postgres psql -d ${DB_NAME} <<'SQLSCHEMA'
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    serial VARCHAR(50) PRIMARY KEY,
    device_secret TEXT NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT FALSE,
    activated_at TIMESTAMP WITH TIME ZONE,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Location history table
CREATE TABLE IF NOT EXISTS location_history (
    id BIGSERIAL PRIMARY KEY,
    device_serial VARCHAR(50) REFERENCES devices(serial) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    battery DOUBLE PRECISION DEFAULT 0,
    csq INTEGER DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_serial_active ON devices(serial, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_history_device_time ON location_history(device_serial, recorded_at DESC);

-- Auto-update trigger for last_modified_at
CREATE OR REPLACE FUNCTION update_last_modified_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_devices_last_modified_at ON devices;
CREATE TRIGGER update_devices_last_modified_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_last_modified_at_column();


-- Device statistics function
CREATE OR REPLACE FUNCTION get_device_stats()
RETURNS TABLE (
    total_devices BIGINT,
    active_devices BIGINT,
    inactive_devices BIGINT,
    devices_with_users BIGINT,
    devices_without_users BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) AS total_devices,
        COUNT(*) FILTER (WHERE is_active = true) AS active_devices,
        COUNT(*) FILTER (WHERE is_active = false) AS inactive_devices,
        COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS devices_with_users,
        COUNT(*) FILTER (WHERE user_id IS NULL) AS devices_without_users
    FROM devices;
END;
$$ LANGUAGE plpgsql;

-- Device overview view
CREATE OR REPLACE VIEW device_overview AS
SELECT
    d.serial,
    d.device_secret,
    d.is_active,
    d.activated_at,
    d.created_at,
    d.last_modified_at,
    u.id as user_id,
    u.phone as user_phone,
    u.role as user_role,
    COUNT(lh.id) as location_count,
    MAX(lh.recorded_at) as last_location_time
FROM devices d
LEFT JOIN users u ON d.user_id = u.id
LEFT JOIN location_history lh ON d.serial = lh.device_serial
GROUP BY d.serial, u.id, u.phone, u.role;
SQLSCHEMA
}

log "PostgreSQL configured."

# ============================================================
# 6. REDIS SETUP
# ============================================================
log "Configuring Redis..."
systemctl enable redis-server
systemctl start redis-server
log "Redis running."

# ============================================================
# 7. .ENV FILE
# ============================================================
log "Writing .env file..."
mkdir -p "${BACKEND_DIR}"

# Get server IP address
SERVER_IP=$(hostname -I | awk '{print $1}')

cat > "${BACKEND_DIR}/.env" <<EOF
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MQTT (local broker)
MQTT_BROKER=tcp://${SERVER_IP}:${MQTT_PORT}
MQTT_USER=${MQTT_USER}
MQTT_PASSWORD=${MQTT_PASSWORD}
MQTT_TOPIC=devices/+/location

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY_HOURS=72

# Server
SERVER_PORT=8080
APP_DOMAIN=${DOMAIN}

# Browser origins allowed for CORS and WebSocket upgrades
ALLOWED_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}

# Environment
APP_ENV=production
EOF

# The file holds the JWT signing key and database password.
chmod 600 "${BACKEND_DIR}/.env"

log ".env file written to ${BACKEND_DIR}/.env"
log "MQTT Broker configured at ${SERVER_IP}:${MQTT_PORT}"
log "MQTT Credentials - Username: ${MQTT_USER}, Password: ${MQTT_PASSWORD}"

# ============================================================
# 8. SYSTEMD SERVICE FOR BACKEND
# ============================================================
log "Installing tracking-backend systemd service..."

cat > /etc/systemd/system/tracking-backend.service <<EOF
[Unit]
Description=Tracking Backend
After=network.target postgresql.service redis-server.service mosquitto.service

[Service]
Type=simple
User=root
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${BACKEND_DIR}/.env
ExecStart=${BACKEND_DIR}/server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tracking-backend

# Start only if the binary exists
if [[ -f "${BACKEND_DIR}/server" ]]; then
    chmod +x "${BACKEND_DIR}/server"
    systemctl restart tracking-backend
    log "tracking-backend service started."
else
    warn "Binary not found at ${BACKEND_DIR}/server — service registered but NOT started."
    warn "Copy your compiled 'server' binary there and run: systemctl start tracking-backend"
fi

# ============================================================
# 9. NGINX CONFIGURATION
# ============================================================
log "Configuring Nginx..."

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
mkdir -p "${FRONTEND_DIR}"

# --- tracker (main site) ---
cat > /etc/nginx/sites-available/tracker <<'NGINXTRACKER'
# -------------------------
# HTTP → HTTPS redirect
# -------------------------
server {
    listen 80;
    server_name abolfazl.fun www.abolfazl.fun;
    return 301 https://abolfazl.fun$request_uri;
}

# -------------------------
# HTTPS → redirect www to non-www
# -------------------------
server {
    listen 443 ssl http2;
    server_name www.abolfazl.fun;

    ssl_certificate     /etc/nginx/ssl/abolfazl.fun/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/abolfazl.fun/privkey.pem;

    return 301 https://abolfazl.fun$request_uri;
}

# -------------------------
# MAIN HTTPS SERVER (non-www)
# -------------------------
server {
    listen 443 ssl http2;
    server_name abolfazl.fun;

    root /var/www/tracking-frontend;
    index index.html;

    ssl_certificate     /etc/nginx/ssl/abolfazl.fun/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/abolfazl.fun/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ws {
        proxy_pass http://127.0.0.1:8080/api/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600;
    }
}
NGINXTRACKER

# --- maps ---
cat > /etc/nginx/sites-available/maps <<'NGINXMAPS'
server {
    listen 80;
    server_name maps.abolfazl.fun;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name maps.abolfazl.fun;

    ssl_certificate     /etc/nginx/ssl/abolfazl.fun/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/abolfazl.fun/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        sub_filter 'http://maps.abolfazl.fun' 'https://maps.abolfazl.fun';
        sub_filter_once off;
    }
}
NGINXMAPS

# Enable sites
ln -sf /etc/nginx/sites-available/tracker /etc/nginx/sites-enabled/tracker
ln -sf /etc/nginx/sites-available/maps    /etc/nginx/sites-enabled/maps

# Disable default site if present
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t && systemctl enable nginx && systemctl restart nginx
log "Nginx configured and restarted."

# ============================================================
# 10. DOWNLOAD AND EXTRACT MAPS
# ============================================================
log "Downloading maps from ArvanCloud S3..."

# Create maps directory
mkdir -p "${MAPS_DATA_DIR}"

# Download the zip file
log "Downloading ${MAPS_ZIP_FILE} from ${MAPS_DOWNLOAD_URL}..."
wget -O "${MAPS_DATA_DIR}/${MAPS_ZIP_FILE}" "${MAPS_DOWNLOAD_URL}" --progress=bar:force 2>&1

if [[ $? -eq 0 ]]; then
    log "Download completed successfully."
    
    # Extract the zip file
    log "Extracting ${MAPS_ZIP_FILE} to ${MAPS_DATA_DIR}..."
    unzip -o "${MAPS_DATA_DIR}/${MAPS_ZIP_FILE}" -d "${MAPS_DATA_DIR}/"
    
    # Remove the zip file after extraction
    rm -f "${MAPS_DATA_DIR}/${MAPS_ZIP_FILE}"
    
    # Find and log the .mbtiles file
    MBTILES_FILE=$(find "${MAPS_DATA_DIR}" -name "*.mbtiles" -type f | head -1)
    if [[ -n "${MBTILES_FILE}" ]]; then
        log "Map file found: ${MBTILES_FILE}"
        chmod 644 "${MBTILES_FILE}"
    else
        warn "No .mbtiles file found in the extracted content"
        warn "Please ensure your zip contains a valid .mbtiles file"
    fi
    
    # Set proper permissions
    chmod -R 755 "${MAPS_DATA_DIR}"
    
    log "Maps extraction completed."
else
    error "Failed to download maps from ${MAPS_DOWNLOAD_URL}"
fi

# ============================================================
# 11. DOCKER TILESERVER (maps)
# ============================================================
log "Starting tileserver Docker container..."

# Remove existing container if any
docker rm -f tileserver 2>/dev/null || true

docker run -d \
    --name tileserver \
    --restart unless-stopped \
    -v "${MAPS_DATA_DIR}:/data" \
    -p 8081:8080 \
    -e TILESERVER_PUBLIC_URL=https://maps.abolfazl.fun \
    maptiler/tileserver-gl:latest

log "Tileserver container started."

# ============================================================
# 12. FIREWALL
# ============================================================
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow ${MQTT_PORT}/tcp
ufw allow ${MQTT_WS_PORT}/tcp
ufw --force enable
log "Firewall rules applied."

# ============================================================
# DONE
# ============================================================
echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "  Services status:"
systemctl is-active --quiet postgresql    && echo -e "  ${GREEN}✓${NC} PostgreSQL" || echo -e "  ${RED}✗${NC} PostgreSQL"
systemctl is-active --quiet redis-server  && echo -e "  ${GREEN}✓${NC} Redis"      || echo -e "  ${RED}✗${NC} Redis"
systemctl is-active --quiet mosquitto     && echo -e "  ${GREEN}✓${NC} Mosquitto MQTT" || echo -e "  ${RED}✗${NC} Mosquitto MQTT"
systemctl is-active --quiet nginx         && echo -e "  ${GREEN}✓${NC} Nginx"      || echo -e "  ${RED}✗${NC} Nginx"
docker ps --filter name=tileserver --filter status=running -q | grep -q . \
    && echo -e "  ${GREEN}✓${NC} Tileserver (Docker)" \
    || echo -e "  ${RED}✗${NC} Tileserver (Docker)"
systemctl is-active --quiet tracking-backend \
    && echo -e "  ${GREEN}✓${NC} Tracking backend" \
    || echo -e "  ${YELLOW}~${NC} Tracking backend (waiting for binary)"
echo ""
echo "  MQTT Broker Information:"
echo "    - MQTT Port: ${MQTT_PORT}"
echo "    - WebSocket Port: ${MQTT_WS_PORT}"
echo "    - Username: ${MQTT_USER}"
echo "    - Password: ${MQTT_PASSWORD}"
echo "    - Connection String: tcp://${SERVER_IP}:${MQTT_PORT}"
echo ""
echo "  Maps Information:"
echo "    - Download URL: ${MAPS_DOWNLOAD_URL}"
echo "    - Extracted to: ${MAPS_DATA_DIR}"
MBTILES_FILE=$(find "${MAPS_DATA_DIR}" -name "*.mbtiles" -type f | head -1)
if [[ -n "${MBTILES_FILE}" ]]; then
    echo "    - Map file: $(basename ${MBTILES_FILE})"
fi
echo ""
echo "  Docker Registry Mirror:"
echo "    - Mirror: https://docker.arvancloud.ir"
echo "    - Status: Configured"
echo ""
echo "  Next steps:"
echo "  1. Verify Docker mirror is working: docker pull hello-world"
echo "  2. Copy your compiled backend binary to: ${BACKEND_DIR}/server"
echo "  3. Copy your frontend build to: ${FRONTEND_DIR}/"
echo "  4. Run: systemctl start tracking-backend"
echo "  5. Test MQTT: mosquitto_pub -h ${SERVER_IP} -u ${MQTT_USER} -P ${MQTT_PASSWORD} -t test -m 'hello'"
echo "  6. Access maps at: https://maps.abolfazl.fun"
echo ""
echo "  IMPORTANT: Save these MQTT credentials for your devices:"
echo "    Username: ${MQTT_USER}"
echo "    Password: ${MQTT_PASSWORD}"
echo ""