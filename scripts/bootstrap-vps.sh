#!/usr/bin/env bash
#
# Full zero-to-deployed setup on a brand-new Ubuntu/Debian VPS: installs
# Docker, downloads the map tiles, creates .env.prod, brings the containerised
# stack up, and configures this server's nginx + an SSL certificate — all in
# one run.
#
# This app runs fine alongside OTHER projects on the same VPS, each on its
# own (sub)domain: only this project's Docker containers are installed by
# this script, and the SSL/reverse-proxy step (make ssl) reuses the host's
# single nginx + certbot rather than trying to own port 443 itself — see
# scripts/deploy-host-nginx.sh. If nginx/certbot are already installed for
# another project, this leaves them and every other project's config alone.
#
# Usage (from the project root, after git clone):
#   ./scripts/bootstrap-vps.sh
#
# You can supply the domain and email up front so nothing is prompted:
#   DOMAIN=track.example.com LETSENCRYPT_EMAIL=admin@example.com ./scripts/bootstrap-vps.sh
#
# If this is not the first project on this VPS, also set a free local port
# (must be unique per project — default 8081):
#   APP_HTTP_PORT=8082 DOMAIN=... LETSENCRYPT_EMAIL=... ./scripts/bootstrap-vps.sh
#
# To skip the multi-gigabyte map tile download (bring your own MAPS_DIR
# later, or point MAPS_DIR at one already on this server):
#   SKIP_MAPS=1 ./scripts/bootstrap-vps.sh
#
# To point MQTT credentials at whatever is already flashed into your
# trackers' firmware instead of generating new random ones:
#   MQTT_USER=tracker MQTT_PASSWORD=... ./scripts/bootstrap-vps.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
source scripts/lib.sh

# ------------------------------------------------------------- elevate to root
if [[ "$(id -u)" != "0" ]]; then
  echo "==> Root access is required to install Docker; re-running with sudo"
  exec sudo -E bash "$0" "$@"
fi

REAL_USER="${SUDO_USER:-root}"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script is written only for Ubuntu/Debian (apt)." >&2
  exit 1
fi

# --------------------------------------------------------- base packages
echo "==> Installing base packages"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg make openssl git unzip

# --------------------------------------------------------------- Docker Engine
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  echo "    Docker installed."
else
  echo "==> Docker is already installed"
fi

if [[ "$REAL_USER" != "root" ]] && ! id -nG "$REAL_USER" | grep -qw docker; then
  echo "==> Adding user $REAL_USER to the docker group"
  usermod -aG docker "$REAL_USER"
  echo "    Note: you must log out/in again to run docker without sudo."
fi

# --------------------------------------------------------------- domain and email
if [[ -z "${DOMAIN:-}" ]]; then
  read -r -p "Domain whose A record points to this server's IP: " DOMAIN
fi
if [[ -z "${LETSENCRYPT_EMAIL:-}" ]]; then
  read -r -p "Email for Let's Encrypt expiry warnings: " LETSENCRYPT_EMAIL
fi
: "${DOMAIN:?DOMAIN is required}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required}"

if [[ -z "${APP_HTTP_PORT:-}" ]]; then
  # Pick the first free loopback port automatically instead of making the
  # operator guess one — the frontend container only needs a private port for
  # the host nginx to proxy to (see scripts/deploy-host-nginx.sh).
  APP_HTTP_PORT="$(find_free_port 8081)"
  if [[ -d /etc/nginx || -x /usr/sbin/nginx ]]; then
    echo ""
    echo "nginx is already on this server (another project is likely deployed"
    echo "here). This app will publish its local port on 127.0.0.1:${APP_HTTP_PORT}"
    echo "(auto-picked as free). Press Enter to accept, or type another number:"
    read -r -p "Local port for this app [${APP_HTTP_PORT}]: " reply
    APP_HTTP_PORT="${reply:-$APP_HTTP_PORT}"
  fi
fi

# ------------------------------------------------------------------- .env.prod
echo "==> Creating .env.prod"
if [[ ! -f .env.prod ]]; then
  cp .env.prod.example .env.prod

  DB_PASSWORD="$(rand_secret 24)"
  REDIS_PASSWORD="$(rand_secret 24)"
  MQTT_USER="${MQTT_USER:-tracker}"
  MQTT_PASSWORD="${MQTT_PASSWORD:-$(rand_secret 24)}"
  JWT_SECRET="$(rand_secret 48)"

  sed -i \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" \
    -e "s|^MQTT_USER=.*|MQTT_USER=${MQTT_USER}|" \
    -e "s|^MQTT_PASSWORD=.*|MQTT_PASSWORD=${MQTT_PASSWORD}|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" \
    -e "s|^HTTP_PORT=.*|HTTP_PORT=${APP_HTTP_PORT}|" \
    -e "s|^APP_DOMAIN=.*|APP_DOMAIN=${DOMAIN}|" \
    -e "s|^PUBLIC_URL=.*|PUBLIC_URL=https://${DOMAIN}|" \
    -e "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" \
    -e "s|^LETSENCRYPT_EMAIL=.*|LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}|" \
    -e "s|^MAPS_DIR=.*|MAPS_DIR=/root/maps|" \
    .env.prod

  echo "    Generated fresh DB/Redis/MQTT passwords and a JWT secret."
  echo "    MQTT credentials: user='${MQTT_USER}' — flash this into your trackers'"
  echo "    firmware, or re-run with MQTT_USER=... MQTT_PASSWORD=... to match"
  echo "    what is already flashed."
else
  echo "    .env.prod already exists — leaving it as is."
  load_env .env.prod
  APP_HTTP_PORT="${HTTP_PORT:-$APP_HTTP_PORT}"
fi

if [[ "$REAL_USER" != "root" ]]; then
  chown "$REAL_USER":"$REAL_USER" .env.prod
fi
chmod 600 .env.prod

load_env .env.prod

# ------------------------------------------------------------- MQTT password file
if [[ ! -f deploy/mosquitto/passwd ]]; then
  echo "==> Creating the MQTT broker password file"
  make mqtt-passwd MQTT_USER="${MQTT_USER}" MQTT_PASSWORD="${MQTT_PASSWORD}"
else
  echo "==> deploy/mosquitto/passwd already exists — leaving it as is"
fi

# --------------------------------------------------------------------- maps
MAPS_DIR="${MAPS_DIR:-/root/maps}"
MAPS_DOWNLOAD_URL="${MAPS_DOWNLOAD_URL:-https://bucketfirst.s3.ir-thr-at1.arvanstorage.ir/iran-output.zip}"

if [[ "${SKIP_MAPS:-0}" == "1" ]]; then
  echo "==> SKIP_MAPS=1 — not downloading map tiles"
  echo "    Point MAPS_DIR in .env.prod at a directory containing config.json,"
  echo "    styles/, fonts/ and a .mbtiles file before starting the stack."
elif find "$MAPS_DIR" -maxdepth 1 -name "*.mbtiles" -type f 2>/dev/null | grep -q .; then
  echo "==> Map tiles already present in ${MAPS_DIR} — skipping download"
else
  echo "==> Downloading map tiles to ${MAPS_DIR}"
  echo "    This is several GB; set SKIP_MAPS=1 to skip and provide your own."
  mkdir -p "$MAPS_DIR"
  MAPS_ZIP="${MAPS_DIR}/maps.zip"
  if curl -fL --progress-bar -o "$MAPS_ZIP" "$MAPS_DOWNLOAD_URL"; then
    unzip -o "$MAPS_ZIP" -d "$MAPS_DIR" >/dev/null
    rm -f "$MAPS_ZIP"
    chmod -R a+rX "$MAPS_DIR"
    MBTILES_FILE="$(find "$MAPS_DIR" -name "*.mbtiles" -type f | head -1)"
    if [[ -n "$MBTILES_FILE" ]]; then
      echo "    Map file found: ${MBTILES_FILE}"
    else
      echo "    Warning: no .mbtiles file found in the extracted content — the"
      echo "    tileserver container will not start cleanly until one is added."
    fi
  else
    echo "    Warning: failed to download maps from ${MAPS_DOWNLOAD_URL}."
    echo "    The stack will still come up, but the tileserver container will"
    echo "    fail its healthcheck until MAPS_DIR has valid map data in it."
  fi
fi

# --------------------------------------------------------------- images
#
# If the images are already here — loaded from a tarball built on a bigger
# machine (scripts/load-images.sh) — don't rebuild them. The frontend build
# wants real CPU/RAM, which a small VPS may not have, so on those the whole
# point is to never build here.
if docker image inspect "gpstracker-backend:${VERSION:-latest}" >/dev/null 2>&1 \
   && docker image inspect "gpstracker-frontend:${VERSION:-latest}" >/dev/null 2>&1; then
  echo "==> Prebuilt images found; skipping the build"
else
  echo "==> Building images (this can be slow on a small server)"
  echo "    If it runs out of memory, build on a bigger machine instead and"
  echo "    load the tarball: ./scripts/build-images.sh, then scp + ./scripts/load-images.sh"
  make prod-build
fi

# ----------------------------------------------------- one-shot signing keys
# Neither of these needs the database, so they can be generated from the
# built image before the rest of the stack (or even .env.prod's DB
# credentials) matters.
# ENTRYPOINT in the image is /app/server, so the CLI must be invoked via
# --entrypoint — passing /app/cli as a bare argument would just hand it to
# the server binary as an argv, not run it.
if grep -q '^CERT_SIGNING_KEY=$' .env.prod; then
  echo "==> Generating the trip-certificate signing key"
  KEY="$(docker run --rm --entrypoint /app/cli "gpstracker-backend:${VERSION:-latest}" cert-keygen | grep -oE 'CERT_SIGNING_KEY=.*' | cut -d= -f2- || true)"
  if [[ -n "$KEY" ]]; then
    sed -i "s|^CERT_SIGNING_KEY=.*|CERT_SIGNING_KEY=${KEY}|" .env.prod
  else
    echo "    Could not parse a key from cert-keygen output; run it manually:"
    echo "    docker run --rm --entrypoint /app/cli gpstracker-backend:${VERSION:-latest} cert-keygen"
  fi
fi

if grep -qE '^VAPID_PUBLIC_KEY=CHANGE_ME$' .env.prod; then
  echo "==> Generating the Web Push (VAPID) key pair"
  OUT="$(docker run --rm --entrypoint /app/cli "gpstracker-backend:${VERSION:-latest}" vapid-keygen || true)"
  PUB="$(echo "$OUT" | grep -oE 'VAPID_PUBLIC_KEY=.*' | cut -d= -f2- || true)"
  PRIV="$(echo "$OUT" | grep -oE 'VAPID_PRIVATE_KEY=.*' | cut -d= -f2- || true)"
  if [[ -n "$PUB" && -n "$PRIV" ]]; then
    sed -i \
      -e "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${PUB}|" \
      -e "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${PRIV}|" \
      -e "s|^VAPID_SUBJECT=.*|VAPID_SUBJECT=mailto:${LETSENCRYPT_EMAIL}|" \
      .env.prod
  else
    echo "    Could not parse VAPID keys from output; run it manually:"
    echo "    docker run --rm --entrypoint /app/cli gpstracker-backend:${VERSION:-latest} vapid-keygen"
    echo "    Leaving it unset just disables push notifications — nothing else breaks."
  fi
fi

# ----------------------------------------------------------------- bring up
echo "==> Starting the stack"
make prod-up

echo "==> Obtaining SSL certificate and configuring host nginx"
make ssl

echo ""
echo "System is up successfully at https://${DOMAIN}"
echo "Check it with:  make deploy-health HOST=https://${DOMAIN}"
echo "Create the first admin with:  make prod-shell CMD='create-admin PHONE=admin PASSWORD=...'"
