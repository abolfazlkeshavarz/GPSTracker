#!/usr/bin/env bash
#
# Populates a DEPLOYED instance with two virtual devices and enough test
# data to exercise nearly every feature from the UI: movement history, the
# odometer, every alert kind (including the full theft battery), a
# geofence, the device configurator, subscription/warranty, and remote
# control (left running at the end so you can click buttons in the UI and
# watch them get acknowledged live).
#
# Run this on YOUR OWN machine (not the server) from the repo root — it only
# talks to the server over the public API (HTTPS) and the public MQTT port,
# the same way a real device or a real browser would. Needs: curl, a Go
# toolchain (for cmd/mqttsim — the same "go run" the Makefile's mqtt-*
# targets use), and grep -P support (Git Bash on Windows has it).
#
# Required:
#   API_URL         e.g. https://gps.abolfazl.fun
#   MQTT_BROKER     e.g. tcp://gps.abolfazl.fun:1883
#   MQTT_USER       from .env.prod on the server
#   MQTT_PASSWORD   from .env.prod on the server
#   ADMIN_PASSWORD  the admin account's password (see: make prod-shell CMD="create-admin ...")
#
# Optional:
#   ADMIN_PHONE     default: admin
#
# Example:
#   API_URL=https://gps.abolfazl.fun \
#   MQTT_BROKER=tcp://gps.abolfazl.fun:1883 \
#   MQTT_USER=tracker MQTT_PASSWORD=<from .env.prod> \
#   ADMIN_PASSWORD=<your admin password> \
#   ./scripts/demo-data.sh
#
# Safe to re-run: devices/settings/geofences/subscription are all
# create-or-update. Ctrl+C at any point just stops whatever step is running.
set -euo pipefail
cd "$(dirname "$0")/.."

# This runs `go run ./cmd/mqttsim` further down — needs a Go toolchain,
# which the deploy scripts deliberately never install on the server (it
# doesn't need one). Run this from your own machine, not over SSH on the VPS.
command -v go >/dev/null 2>&1 || {
  echo "Error: 'go' not found on PATH." >&2
  echo "This script needs a Go toolchain (for cmd/mqttsim) and only talks to" >&2
  echo "the server over its public API/MQTT ports — run it from your own" >&2
  echo "machine, not the server." >&2
  exit 1
}

: "${API_URL:?API_URL is required, e.g. https://gps.abolfazl.fun}"
: "${MQTT_BROKER:?MQTT_BROKER is required, e.g. tcp://gps.abolfazl.fun:1883}"
: "${MQTT_USER:?MQTT_USER is required — from .env.prod on the server}"
: "${MQTT_PASSWORD:?MQTT_PASSWORD is required — from .env.prod on the server}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
ADMIN_PHONE="${ADMIN_PHONE:-admin}"

DEVICE_1=DEMO-001
SECRET_1=demo-secret-001
DEVICE_2=DEMO-002
SECRET_2=demo-secret-002

# Tehran, matching the rest of the project's sample/demo coordinates.
START_LAT=35.6892
START_LNG=51.3890

echo "================================================================"
echo " GPSTracker demo data"
echo " API:   ${API_URL}"
echo " MQTT:  ${MQTT_BROKER}"
echo "================================================================"

# ------------------------------------------------------------------- helpers
#
# Minimal JSON field extraction via grep -P instead of a jq dependency —
# fine here because we control every response shape we read from.
json_str() { grep -oP "\"$1\":\"\K[^\"]*" ; }
json_num() { grep -oP "\"$1\":\K[0-9]+" ; }

# api METHOD path [json-body]  ->  prints response body, sets $HTTP_STATUS
api() {
  local method="$1" path="$2" body="${3:-}" resp status
  if [[ -n "$body" ]]; then
    resp="$(curl -sS -w '\n%{http_code}' -X "$method" "${API_URL}${path}" \
      -H "Authorization: Bearer ${TOKEN:-}" -H "Content-Type: application/json" \
      -d "$body")"
  else
    resp="$(curl -sS -w '\n%{http_code}' -X "$method" "${API_URL}${path}" \
      -H "Authorization: Bearer ${TOKEN:-}")"
  fi
  status="$(echo "$resp" | tail -1)"
  body="$(echo "$resp" | sed '$d')"
  HTTP_STATUS="$status"
  echo "$body"
}

# ----------------------------------------------------------------- log in
echo ""
echo "==> Logging in as ${ADMIN_PHONE}"
LOGIN_RESP="$(curl -sS -X POST "${API_URL}/api/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"${ADMIN_PHONE}\",\"password\":\"${ADMIN_PASSWORD}\"}")"
TOKEN="$(echo "$LOGIN_RESP" | json_str token)"
ADMIN_ID="$(echo "$LOGIN_RESP" | json_num id)"
if [[ -z "$TOKEN" || -z "$ADMIN_ID" ]]; then
  echo "Login failed. Response was:" >&2
  echo "$LOGIN_RESP" >&2
  exit 1
fi
echo "    Logged in (user id ${ADMIN_ID})"

# ------------------------------------------------------ create + wire up a device
# create_device SERIAL SECRET
create_device() {
  local serial="$1" secret="$2"
  echo "==> Creating device ${serial}"
  api POST "/api/admin/devices" "{\"serial\":\"${serial}\",\"device_secret\":\"${secret}\"}" >/dev/null
  if [[ "$HTTP_STATUS" != "200" && "$HTTP_STATUS" != "201" && "$HTTP_STATUS" != "409" ]]; then
    echo "    Unexpected status ${HTTP_STATUS} creating ${serial}" >&2
  fi

  echo "    Assigning to admin and activating"
  api PUT "/api/admin/devices/${serial}" "{\"user_id\":${ADMIN_ID},\"is_active\":true}" >/dev/null
}

create_device "$DEVICE_1" "$SECRET_1"
create_device "$DEVICE_2" "$SECRET_2"

# ---------------------------------------------------------------- inventory
echo "==> Setting inventory (IMEI/model/warranty) on ${DEVICE_1}"
api PUT "/api/admin/devices/${DEVICE_1}/inventory" \
  '{"imei":"862345061234567","model":"GT06-v2","purchase_date":"2026-01-15","warranty_months":18,"notes":"demo unit"}' >/dev/null

echo "==> Setting inventory on ${DEVICE_2}"
api PUT "/api/admin/devices/${DEVICE_2}/inventory" \
  '{"imei":"862345061234568","model":"GT06-v2","purchase_date":"2025-06-01","warranty_months":12,"notes":"demo unit, older"}' >/dev/null

# -------------------------------------------------------------- subscription
echo "==> Renewing subscription: ${DEVICE_1} -> pro/12mo, ${DEVICE_2} -> basic/1mo"
api POST "/api/admin/devices/${DEVICE_1}/subscription" '{"plan":"pro","months":12}' >/dev/null
api POST "/api/admin/devices/${DEVICE_2}/subscription" '{"plan":"basic","months":1}' >/dev/null

# ----------------------------------------------------------------- settings
# speed_limit_kmh is 0 (disabled) by default; the simulated route drives at
# 30-89 km/h, so a 45 km/h cap guarantees overspeed alerts fire.
echo "==> Lowering ${DEVICE_1}'s speed limit to 45 km/h so overspeed alerts fire"
api PUT "/api/devices/${DEVICE_1}/settings" '{"speed_limit_kmh":45}' >/dev/null

# ---------------------------------------------------------------- geofence
echo "==> Creating a 300m geofence around ${DEVICE_1}'s starting point"
api POST "/api/devices/${DEVICE_1}/geofences" \
  "{\"name\":\"Demo zone\",\"lat\":${START_LAT},\"lng\":${START_LNG},\"radius_m\":300,\"trigger_on\":\"both\"}" >/dev/null

# ================================================================ MQTT phase
cd tracking-backend

MQTT_ARGS_1=(-broker "$MQTT_BROKER" -user "$MQTT_USER" -password "$MQTT_PASSWORD" \
  -device "$DEVICE_1" -secret "$SECRET_1" -lat "$START_LAT" -lng "$START_LNG")
MQTT_ARGS_2=(-broker "$MQTT_BROKER" -user "$MQTT_USER" -password "$MQTT_PASSWORD" \
  -device "$DEVICE_2" -secret "$SECRET_2" -lat "$START_LAT" -lng "$START_LNG")

echo ""
echo "==> [1/4] ${DEVICE_1}: driving a route (movement history, overspeed +"
echo "          geofence-exit alerts, hash chain / record integrity)"
go run ./cmd/mqttsim "${MQTT_ARGS_1[@]}" -count 60 -interval 500ms

echo ""
echo "==> [2/4] ${DEVICE_1}: a clean 2km straight-line run (odometer)"
go run ./cmd/mqttsim "${MQTT_ARGS_1[@]}" -distance-steps 20 -step-meters 100

echo ""
echo "==> [3/4] ${DEVICE_1}: theft scenario — tow, power cut, jamming,"
echo "          ignition, impact (the full critical-alert battery)"
go run ./cmd/mqttsim "${MQTT_ARGS_1[@]}" -theft

echo ""
echo "==> [4/4] ${DEVICE_2}: a coverage gap, then backfilled replay"
echo "          (movement history gap markers)"
go run ./cmd/mqttsim "${MQTT_ARGS_2[@]}" -gap-after 10 -gap-minutes 45 -interval 300ms

# --------------------------------------------------------------- remote control
echo ""
echo "================================================================"
echo " Data loaded. Now in the UI:"
echo "================================================================"
echo "  Dashboard / device list  -> ${DEVICE_1}, ${DEVICE_2}"
echo "  Movement history         -> both devices (note ${DEVICE_2}'s gap)"
echo "  Speed profile            -> ${DEVICE_1}"
echo "  Record integrity         -> either device, any date range covering today"
echo "  Odometer                 -> ${DEVICE_1} (+~2km from the distance run)"
echo "  Alerts                   -> filter by Critical to see the theft battery;"
echo "                               overspeed/geofence-exit show as warning/info"
echo "  Device settings          -> ${DEVICE_1} (speed limit 45, rest are defaults)"
echo "  Subscription/warranty    -> ${DEVICE_1} (pro), ${DEVICE_2} (basic)"
echo "  Remote control           -> ${DEVICE_1}, starting now:"
echo ""
echo "Leaving a virtual ${DEVICE_1} running to answer remote commands."
echo "Try engine cut/restore, door lock/unlock, locate, reboot from the UI —"
echo "each should flip pending -> acked within a few seconds. Ctrl+C to stop."
echo ""

go run ./cmd/mqttsim "${MQTT_ARGS_1[@]}" -obey
