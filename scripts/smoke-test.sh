#!/usr/bin/env bash
# End-to-end smoke test against a running GPSTracker API.
#
#   make run            # in one terminal
#   make smoke          # in another
#
# Assumes the seed data from `make db-seed`. Covers authentication, the
# authorisation boundary between users, admin access control, and the MQTT
# ingest path. Exits non-zero on the first hard failure category, so it works
# as a deploy gate.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT_DIR/.env.docker" ]] && set -a && . "$ROOT_DIR/.env.docker" && set +a

API_URL="${API_URL:-http://127.0.0.1:8080}"
SEED_PASSWORD="${SEED_PASSWORD:-password123}"
MQTT_HOST="${MQTT_HOST:-127.0.0.1}"
MQTT_PORT="${MQTT_PORT:-1883}"

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'

passed=0
failed=0

pass() { echo "  ${GREEN}[PASS]${NC} $1"; passed=$((passed + 1)); }
fail() { echo "  ${RED}[FAIL]${NC} $1"; failed=$((failed + 1)); }
info() { echo "  ${YELLOW}[..]${NC}   $1"; }

# expect_status <description> <expected> <actual>
expect_status() {
  if [[ "$2" == "$3" ]]; then
    pass "$1 (HTTP $3)"
  else
    fail "$1 — expected HTTP $2, got $3"
  fi
}

# api <method> <path> [body] [token] -> prints "<body>\n<status>"
api() {
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=(-sS -X "$method" --max-time 15 -w $'\n%{http_code}')

  [[ -n "$body" ]] && args+=(-H "Content-Type: application/json" -d "$body")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")

  curl "${args[@]}" "$API_URL$path" 2>/dev/null || echo $'\n000'
}

status_of() { tail -n1 <<<"$1"; }
body_of()   { sed '$d' <<<"$1"; }

# Minimal JSON string extractor, so the test needs no jq dependency.
json_str() {
  sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" <<<"$1" | head -1
}

echo ""
echo "GPSTracker smoke test"
echo "====================="
echo "Target: $API_URL"

# ------------------------------------------------------------- reachability
echo ""
echo "1. Reachability"

resp=$(api GET /health)
health_status=$(status_of "$resp")

if [[ "$health_status" != "200" ]]; then
  echo ""
  echo "${RED}API is not reachable at $API_URL (got HTTP ${health_status:-none}).${NC}"
  echo "Start it with 'make run', or set API_URL to point somewhere else."
  echo ""
  # Show what curl actually said; "000" means the request never completed.
  echo "curl diagnostics:"
  curl -sS -o /dev/null -w '  http_code=%{http_code} exit=%{exitcode} err=%{errormsg}\n' \
      --max-time 15 "$API_URL/health" 2>&1 | sed 's/^/  /' || true
  exit 1
fi
pass "GET /health -> 200"

# ---------------------------------------------------------- authentication
echo ""
echo "2. Authentication"

resp=$(api POST /api/login "{\"phone\":\"admin\",\"password\":\"$SEED_PASSWORD\"}")
ADMIN_TOKEN=$(json_str "$(body_of "$resp")" token)
expect_status "admin logs in" 200 "$(status_of "$resp")"
[[ -n "$ADMIN_TOKEN" ]] && pass "admin received a token" || fail "no token in login response"

resp=$(api POST /api/login "{\"phone\":\"09120000001\",\"password\":\"$SEED_PASSWORD\"}")
USER1_TOKEN=$(json_str "$(body_of "$resp")" token)
expect_status "user1 logs in" 200 "$(status_of "$resp")"

resp=$(api POST /api/login "{\"phone\":\"09120000002\",\"password\":\"$SEED_PASSWORD\"}")
USER2_TOKEN=$(json_str "$(body_of "$resp")" token)
expect_status "user2 logs in" 200 "$(status_of "$resp")"

resp=$(api POST /api/login '{"phone":"admin","password":"definitely-wrong"}')
expect_status "wrong password rejected" 401 "$(status_of "$resp")"

resp=$(api POST /api/login '{"phone":"no-such-user-99999","password":"whatever"}')
expect_status "unknown user rejected" 401 "$(status_of "$resp")"

# The message must not distinguish the two cases, or it enumerates accounts.
if [[ "$(json_str "$(body_of "$resp")" error)" == "Invalid credentials" ]]; then
  pass "login errors do not reveal whether an account exists"
else
  fail "login error message leaks account existence"
fi

resp=$(api POST /api/login '{"phone":"admin"}')
expect_status "login without a password rejected" 400 "$(status_of "$resp")"

# ----------------------------------------------------------- authorisation
echo ""
echo "3. Authorisation"

resp=$(api GET /api/devices)
expect_status "no token rejected" 401 "$(status_of "$resp")"

resp=$(api GET /api/devices "" "not-a-real-jwt")
expect_status "malformed token rejected" 401 "$(status_of "$resp")"

# A token signed with the wrong key must not be accepted.
FORGED='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJleHAiOjQ4NzQzMTM2MDB9.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
resp=$(api GET /api/devices "" "$FORGED")
expect_status "forged signature rejected" 401 "$(status_of "$resp")"

# alg:none must be refused outright.
ALG_NONE='eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyX2lkIjoxLCJleHAiOjQ4NzQzMTM2MDB9.'
resp=$(api GET /api/devices "" "$ALG_NONE")
expect_status "alg=none token rejected" 401 "$(status_of "$resp")"

resp=$(api GET /api/devices "" "$USER1_TOKEN")
expect_status "user1 lists own devices" 200 "$(status_of "$resp")"
if grep -q "TRACKER-001" <<<"$(body_of "$resp")"; then
  pass "user1 sees TRACKER-001"
else
  fail "user1 cannot see their own device"
fi
if grep -q "TRACKER-002" <<<"$(body_of "$resp")"; then
  fail "user1 can see user2's device"
else
  pass "user1 cannot see user2's device"
fi

# The important one: cross-tenant access must be refused, not just hidden.
resp=$(api GET /api/devices/TRACKER-002/latest "" "$USER1_TOKEN")
expect_status "user1 blocked from user2's location" 403 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-002/history "" "$USER1_TOKEN")
expect_status "user1 blocked from user2's history" 403 "$(status_of "$resp")"

resp=$(api GET /api/admin/users "" "$USER1_TOKEN")
expect_status "non-admin blocked from admin API" 403 "$(status_of "$resp")"

resp=$(api GET /api/admin/users "" "$ADMIN_TOKEN")
expect_status "admin reaches admin API" 200 "$(status_of "$resp")"

# --------------------------------------------------------------- device data
echo ""
echo "4. Device data"

resp=$(api GET /api/devices/TRACKER-001/latest "" "$USER1_TOKEN")
expect_status "latest location" 200 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-001/history?hours=24 "" "$USER1_TOKEN")
expect_status "location history" 200 "$(status_of "$resp")"

# Bad query values used to reach Postgres verbatim and produce a 500.
resp=$(api GET "/api/devices/TRACKER-001/history?limit=abc&hours=xyz" "" "$USER1_TOKEN")
expect_status "non-numeric limit/hours handled" 200 "$(status_of "$resp")"

resp=$(api GET "/api/devices/TRACKER-001/history?limit=999999999" "" "$USER1_TOKEN")
expect_status "oversized limit clamped" 200 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-001/status "" "$USER1_TOKEN")
expect_status "device status" 200 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-001/odometer "" "$USER1_TOKEN")
expect_status "odometer read" 200 "$(status_of "$resp")"
if grep -q '"total_km"' <<<"$(body_of "$resp")"; then
  pass "odometer response contains total_km"
else
  fail "odometer response missing total_km"
fi

resp=$(api PUT /api/devices/TRACKER-001/odometer '{"total_km":1234.5}' "$USER1_TOKEN")
expect_status "odometer set" 200 "$(status_of "$resp")"

resp=$(api PUT /api/devices/TRACKER-001/odometer '{"total_km":-5}' "$USER1_TOKEN")
expect_status "negative odometer rejected" 400 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-002/odometer "" "$USER1_TOKEN")
expect_status "user1 blocked from user2's odometer" 403 "$(status_of "$resp")"

# ------------------------------------------------------- device configurator
echo ""
echo "4b. Device settings"

resp=$(api GET /api/devices/TRACKER-001/settings "" "$USER1_TOKEN")
expect_status "settings read" 200 "$(status_of "$resp")"

settings_body=$(body_of "$resp")
for field in '"speed_limit_kmh"' '"alert_tow"' '"alert_power_cut"' '"silent_mode"'; do
  if grep -q "$field" <<<"$settings_body"; then
    pass "settings contain $field"
  else
    fail "settings missing $field"
  fi
done

# A device that has never been configured must report defaults, not 404.
if grep -q '"alert_tow":true' <<<"$settings_body"; then
  pass "unconfigured device reports rules on by default"
else
  fail "unconfigured device does not default its alert rules on"
fi

resp=$(api PUT /api/devices/TRACKER-001/settings '{"speed_limit_kmh":110}' "$USER1_TOKEN")
expect_status "settings update" 200 "$(status_of "$resp")"
if grep -q '"speed_limit_kmh":110' <<<"$(body_of "$resp")"; then
  pass "speed limit persisted"
else
  fail "speed limit was not persisted"
fi

# A partial update must not reset the fields it did not mention.
resp=$(api PUT /api/devices/TRACKER-001/settings '{"silent_mode":true}' "$USER1_TOKEN")
if grep -q '"speed_limit_kmh":110' <<<"$(body_of "$resp")"; then
  pass "partial update leaves other settings alone"
else
  fail "partial update clobbered an unrelated setting"
fi

resp=$(api PUT /api/devices/TRACKER-001/settings '{"speed_limit_kmh":999}' "$USER1_TOKEN")
expect_status "out-of-range speed limit rejected" 400 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-002/settings "" "$USER1_TOKEN")
expect_status "user1 blocked from user2's settings" 403 "$(status_of "$resp")"

# ------------------------------------------------------------ remote control
echo ""
echo "4c. Remote control"

resp=$(api POST /api/devices/TRACKER-001/commands '{"command":"locate"}' "$USER1_TOKEN")
expect_status "locate command queued" 202 "$(status_of "$resp")"

# The dangerous commands must not be issuable without an explicit confirmation.
resp=$(api POST /api/devices/TRACKER-001/commands '{"command":"engine_cut"}' "$USER1_TOKEN")
expect_status "engine cut without confirm rejected" 400 "$(status_of "$resp")"

resp=$(api POST /api/devices/TRACKER-001/commands '{"command":"do_a_barrel_roll"}' "$USER1_TOKEN")
expect_status "unknown command rejected" 400 "$(status_of "$resp")"

resp=$(api POST /api/devices/TRACKER-001/commands '{"command":"set_interval","interval_s":5}' "$USER1_TOKEN")
expect_status "out-of-range interval rejected" 400 "$(status_of "$resp")"

resp=$(api GET /api/devices/TRACKER-001/commands "" "$USER1_TOKEN")
expect_status "command history" 200 "$(status_of "$resp")"

resp=$(api POST /api/devices/TRACKER-002/commands '{"command":"locate"}' "$USER1_TOKEN")
expect_status "user1 blocked from commanding user2's device" 403 "$(status_of "$resp")"

# The full control channel: signed command out, signature checked by the
# device, signed acknowledgement back, status closed out. This is the only
# check that proves the signing format still matches on both sides — break it
# and deployed hardware silently stops obeying commands.
if command -v go >/dev/null 2>&1; then
  info "starting a virtual device that obeys commands..."

  # -run-for, not a background kill: `go run` execs a child, so killing the
  # `go run` process leaves the simulator running as an orphan that keeps
  # publishing long after the test finishes.
  (cd "$ROOT_DIR/tracking-backend" && \
     MQTT_BROKER="tcp://$MQTT_HOST:$MQTT_PORT" \
     go run ./cmd/mqttsim -device DEVICEADMIN -secret 357951 \
       -obey -interval 60s -run-for 25s >/dev/null 2>&1) &

  sleep 12

  resp=$(api POST /api/devices/DEVICEADMIN/commands '{"command":"door_lock"}' "$ADMIN_TOKEN")
  expect_status "command issued to a listening device" 202 "$(status_of "$resp")"
  cmd_id=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' <<<"$(body_of "$resp")" | head -1)

  sleep 4

  resp=$(api GET "/api/devices/DEVICEADMIN/commands?limit=5" "" "$ADMIN_TOKEN")
  if grep -q "\"id\":$cmd_id,[^}]*\"status\":\"acked\"" <<<"$(body_of "$resp")"; then
    pass "the device acknowledged command $cmd_id (signed both ways)"
  else
    fail "command $cmd_id was never acknowledged — check the signing format on both sides"
  fi

  wait 2>/dev/null || true
else
  info "go not on PATH; skipping the control-channel round trip"
fi

# --------------------------------------------------------- plan and warranty
echo ""
echo "4d. Subscription and warranty"

resp=$(api GET /api/devices/TRACKER-001/subscription "" "$USER1_TOKEN")
expect_status "subscription read" 200 "$(status_of "$resp")"

for field in '"subscription"' '"warranty"'; do
  if grep -q "$field" <<<"$(body_of "$resp")"; then
    pass "subscription response contains $field"
  else
    fail "subscription response missing $field"
  fi
done

resp=$(api POST /api/admin/devices/TRACKER-001/subscription '{"plan":"pro","months":12}' "$ADMIN_TOKEN")
expect_status "admin renews a plan" 200 "$(status_of "$resp")"
if grep -q '"plan":"pro"' <<<"$(body_of "$resp")"; then
  pass "renewal applied the new plan"
else
  fail "renewal did not apply the plan"
fi

# A customer must not be able to extend their own subscription.
resp=$(api POST /api/admin/devices/TRACKER-001/subscription '{"plan":"pro","months":12}' "$USER1_TOKEN")
expect_status "non-admin blocked from renewing" 403 "$(status_of "$resp")"

resp=$(api PUT /api/admin/devices/TRACKER-001/inventory '{"imei":"350000000000001","warranty_months":18,"purchase_date":"2026-01-15"}' "$ADMIN_TOKEN")
expect_status "admin sets inventory/warranty" 200 "$(status_of "$resp")"

resp=$(api PUT /api/admin/devices/TRACKER-001/inventory '{"purchase_date":"15-01-2026"}' "$ADMIN_TOKEN")
expect_status "malformed purchase date rejected" 400 "$(status_of "$resp")"

# ---------------------------------------------------------------- web push
echo ""
echo "4e. Web Push"

resp=$(api GET /api/push/vapid-key)
expect_status "VAPID key served unauthenticated" 200 "$(status_of "$resp")"

if grep -q '"enabled":true' <<<"$(body_of "$resp")"; then
  pass "push is configured on this server"
elif grep -q '"enabled":false' <<<"$(body_of "$resp")"; then
  info "push is not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)"
else
  fail "VAPID response is missing the enabled flag"
fi

resp=$(api POST /api/push/subscribe '{"endpoint":"https://example.invalid/smoke","keys":{"p256dh":"x","auth":"y"}}' "$USER1_TOKEN")
expect_status "push subscription saved" 201 "$(status_of "$resp")"

# Re-registering the same endpoint must upsert rather than duplicate.
resp=$(api POST /api/push/subscribe '{"endpoint":"https://example.invalid/smoke","keys":{"p256dh":"x2","auth":"y2"}}' "$USER1_TOKEN")
expect_status "re-registering an endpoint upserts" 201 "$(status_of "$resp")"

resp=$(api POST /api/push/subscribe '{"endpoint":"https://example.invalid/x"}' "$USER1_TOKEN")
expect_status "subscription without keys rejected" 400 "$(status_of "$resp")"

resp=$(api POST /api/push/unsubscribe '{"endpoint":"https://example.invalid/smoke"}' "$USER1_TOKEN")
expect_status "push subscription removed" 200 "$(status_of "$resp")"

resp=$(api POST /api/push/subscribe '{"endpoint":"https://example.invalid/x2","keys":{"p256dh":"a","auth":"b"}}')
expect_status "push subscribe requires a session" 401 "$(status_of "$resp")"

# -------------------------------------------------------------- track/history
echo ""
echo "5. Movement history"

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)

resp=$(api GET "/api/devices/TRACKER-001/track?from=$YESTERDAY&to=$TODAY" "" "$USER1_TOKEN")
expect_status "track for a date range" 200 "$(status_of "$resp")"

track_body=$(body_of "$resp")
for field in '"points"' '"stops"' '"summary"' '"distance_km"' '"moving_duration"' '"stopped_duration"'; do
  if grep -q "$field" <<<"$track_body"; then
    pass "track response contains $field"
  else
    fail "track response missing $field"
  fi
done

# Reversed range must be rejected rather than silently returning nothing.
resp=$(api GET "/api/devices/TRACKER-001/track?from=$TODAY&to=$YESTERDAY" "" "$USER1_TOKEN")
expect_status "reversed date range rejected" 400 "$(status_of "$resp")"

resp=$(api GET "/api/devices/TRACKER-001/track?from=not-a-date&to=$TODAY" "" "$USER1_TOKEN")
expect_status "unparseable date rejected" 400 "$(status_of "$resp")"

resp=$(api GET "/api/devices/TRACKER-001/track?from=2000-01-01&to=$TODAY" "" "$USER1_TOKEN")
expect_status "excessive range rejected" 400 "$(status_of "$resp")"

resp=$(api GET "/api/devices/TRACKER-002/track?from=$YESTERDAY&to=$TODAY" "" "$USER1_TOKEN")
expect_status "user1 blocked from user2's track" 403 "$(status_of "$resp")"

# TRACKER-002 carries the seeded journey, which has three deliberate stops.
resp=$(api GET "/api/devices/TRACKER-002/track?from=$YESTERDAY&to=$TODAY" "" "$USER2_TOKEN")
if [[ "$(status_of "$resp")" == "200" ]]; then
  stop_count=$(grep -o '"arrived_at"' <<<"$(body_of "$resp")" | wc -l | tr -d ' ')
  if (( stop_count >= 1 )); then
    pass "stop detection found $stop_count stop(s) in the seeded journey"
  else
    info "no stops found — run 'make db-journey' to load the sample journey"
  fi

  # A 90-second pause is seeded to confirm short dwells are filtered out.
  loose=$(api GET "/api/devices/TRACKER-002/track?from=$YESTERDAY&to=$TODAY&min_stop=60" "" "$USER2_TOKEN")
  loose_count=$(grep -o '"arrived_at"' <<<"$(body_of "$loose")" | wc -l | tr -d ' ')
  if (( loose_count > stop_count )); then
    pass "lowering min_stop surfaces shorter dwells ($stop_count -> $loose_count)"
  elif (( stop_count > 0 )); then
    info "min_stop tuning produced no extra stops (journey data may be stale)"
  fi
fi

# --------------------------------------------------------------- activation
echo ""
echo "6. Device activation"

resp=$(api POST /api/activate '{"serial":"TRACKER-003","secret":"wrong-secret"}' "$USER2_TOKEN")
expect_status "wrong device secret rejected" 401 "$(status_of "$resp")"

resp=$(api POST /api/activate '{"serial":"NO-SUCH-DEVICE","secret":"x"}' "$USER2_TOKEN")
expect_status "unknown device rejected" 404 "$(status_of "$resp")"

resp=$(api POST /api/activate '{"serial":"TRACKER-001","secret":"secret-001"}' "$USER2_TOKEN")
expect_status "already-activated device rejected" 409 "$(status_of "$resp")"

# ------------------------------------------------------------- admin routes
echo ""
echo "7. Admin routes"

for path in /api/admin/devices /api/admin/logs /api/admin/stats; do
  resp=$(api GET "$path" "" "$ADMIN_TOKEN")
  expect_status "GET $path" 200 "$(status_of "$resp")"
done

resp=$(api GET "/api/admin/users/not-a-number" "" "$ADMIN_TOKEN")
expect_status "non-numeric user id rejected" 400 "$(status_of "$resp")"

resp=$(api PUT "/api/admin/users/2" '{"role":"superuser"}' "$ADMIN_TOKEN")
expect_status "invalid role rejected" 400 "$(status_of "$resp")"

# ---------------------------------------------------------------- MQTT flow
echo ""
echo "8. MQTT ingest"

if command -v go >/dev/null 2>&1; then
  before=$(api GET "/api/devices/DEVICEADMIN/history?hours=1&limit=1000" "" "$ADMIN_TOKEN")
  before_count=$(grep -o '"recorded_at"' <<<"$(body_of "$before")" | wc -l | tr -d ' ')

  info "publishing 3 simulated GPS points..."
  (cd "$ROOT_DIR/tracking-backend" && \
     MQTT_BROKER="tcp://$MQTT_HOST:$MQTT_PORT" \
     go run ./cmd/mqttsim -device DEVICEADMIN -secret 357951 -count 3 -interval 300ms >/dev/null 2>&1)

  sleep 2

  after=$(api GET "/api/devices/DEVICEADMIN/history?hours=1&limit=1000" "" "$ADMIN_TOKEN")
  after_count=$(grep -o '"recorded_at"' <<<"$(body_of "$after")" | wc -l | tr -d ' ')

  if (( after_count > before_count )); then
    pass "published points reached the database ($before_count -> $after_count)"
  else
    fail "published points did not reach the database ($before_count -> $after_count)"
  fi

  # A bad secret must be dropped by the subscriber.
  info "publishing 2 points with an invalid secret..."
  (cd "$ROOT_DIR/tracking-backend" && \
     MQTT_BROKER="tcp://$MQTT_HOST:$MQTT_PORT" \
     go run ./cmd/mqttsim -device DEVICEADMIN -bad-secret -count 2 -interval 300ms >/dev/null 2>&1)

  sleep 2

  final=$(api GET "/api/devices/DEVICEADMIN/history?hours=1&limit=1000" "" "$ADMIN_TOKEN")
  final_count=$(grep -o '"recorded_at"' <<<"$(body_of "$final")" | wc -l | tr -d ' ')

  if (( final_count == after_count )); then
    pass "points with an invalid secret were rejected"
  else
    fail "invalid-secret points were stored ($after_count -> $final_count)"
  fi

  # Odometer: a straight run of known length moves the lifetime total by
  # roughly that distance. 6 points 100 m apart => ~500 m expected gain.
  odo_before=$(api GET "/api/devices/DEVICEADMIN/odometer" "" "$ADMIN_TOKEN")
  before_m=$(sed -n 's/.*"total_meters"[[:space:]]*:[[:space:]]*\([0-9.]*\).*/\1/p' <<<"$(body_of "$odo_before")")

  info "driving a ~500 m straight line for the odometer..."
  (cd "$ROOT_DIR/tracking-backend" && \
     MQTT_BROKER="tcp://$MQTT_HOST:$MQTT_PORT" \
     go run ./cmd/mqttsim -device DEVICEADMIN -secret 357951 \
       -distance-steps 6 -step-meters 100 >/dev/null 2>&1)

  sleep 2

  odo_after=$(api GET "/api/devices/DEVICEADMIN/odometer" "" "$ADMIN_TOKEN")
  after_m=$(sed -n 's/.*"total_meters"[[:space:]]*:[[:space:]]*\([0-9.]*\).*/\1/p' <<<"$(body_of "$odo_after")")

  gain=$(awk -v a="${after_m:-0}" -v b="${before_m:-0}" 'BEGIN { printf "%.0f", a - b }')
  if (( gain >= 300 && gain <= 800 )); then
    pass "odometer advanced by ${gain} m over a ~500 m run"
  else
    fail "odometer gain ${gain} m is outside the expected 300-800 m band"
  fi

  # The alert engine, end to end. Each rule in the scenario fires on a
  # transition, so this also proves the baselines are being recorded — a rule
  # that never establishes one silently never fires.
  info "running the theft scenario (tow, power cut, jamming, impact)..."
  (cd "$ROOT_DIR/tracking-backend" && \
     MQTT_BROKER="tcp://$MQTT_HOST:$MQTT_PORT" \
     go run ./cmd/mqttsim -device DEVICEADMIN -secret 357951 -theft >/dev/null 2>&1)

  sleep 3

  alerts=$(api GET "/api/alerts?limit=100" "" "$ADMIN_TOKEN")
  alerts_body=$(body_of "$alerts")

  for kind in tow power_cut jamming impact ignition_on; do
    if grep -q "\"kind\":\"$kind\"" <<<"$alerts_body"; then
      pass "alert engine raised $kind"
    else
      fail "alert engine did not raise $kind"
    fi
  done

  # Severity is what drives push urgency and how the UI shouts; a theft alert
  # landing as 'info' would be delivered late and shown quietly.
  if grep -q '"severity":"critical"' <<<"$alerts_body"; then
    pass "theft-grade alerts are marked critical"
  else
    fail "no critical severity found among the theft alerts"
  fi

  resp=$(api GET "/api/alerts?severity=critical&limit=100" "" "$ADMIN_TOKEN")
  expect_status "alerts filter by severity" 200 "$(status_of "$resp")"
  if grep -q '"severity":"info"' <<<"$(body_of "$resp")"; then
    fail "the critical filter returned non-critical alerts"
  else
    pass "the critical filter excludes routine alerts"
  fi
else
  info "go not on PATH; skipping MQTT checks"
fi

# ------------------------------------------------------------ rate limiting
echo ""
echo "9. Rate limiting"

limited=0
for _ in $(seq 1 25); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    -X POST -H "Content-Type: application/json" \
    -d '{"phone":"admin","password":"wrong"}' \
    "$API_URL/api/login" 2>/dev/null || echo "000")
  [[ "$code" == "429" ]] && { limited=1; break; }
done

if [[ $limited == 1 ]]; then
  pass "repeated failed logins are rate limited (429)"
else
  fail "25 failed logins in a row were never rate limited"
fi


# ------------------------------------------------------- integrity / backfill
echo ""
echo "10. Tamper-evident history"

resp=$(api GET "/api/devices/TRACKER-001/verify?from=$YESTERDAY&to=$TODAY" "" "$USER1_TOKEN")
expect_status "chain verification" 200 "$(status_of "$resp")"

verify_body=$(body_of "$resp")
for field in '"valid"' '"hmac_count"' '"unprotected_count"' '"head_hash"'; do
  if grep -q "$field" <<<"$verify_body"; then
    pass "verification reports $field"
  else
    fail "verification missing $field"
  fi
done

resp=$(api GET "/api/devices/TRACKER-002/verify?from=$YESTERDAY&to=$TODAY" "" "$USER1_TOKEN")
expect_status "cross-tenant verification blocked" 403 "$(status_of "$resp")"

# The public key must be reachable without a token: a third party verifying a
# certificate has no account here.
resp=$(api GET /api/certificate-key)
expect_status "public key served unauthenticated" 200 "$(status_of "$resp")"

if grep -q '"algorithm":"Ed25519"' <<<"$(body_of "$resp")"; then
  pass "public key advertises Ed25519"
else
  fail "public key response missing the algorithm"
fi

resp=$(api GET "/api/devices/TRACKER-001/certificate?from=$YESTERDAY&to=$TODAY" "" "$USER1_TOKEN")
cert_status=$(status_of "$resp")

if [[ "$cert_status" == "501" ]]; then
  info "certificate signing not configured (set CERT_SIGNING_KEY to enable)"
else
  expect_status "certificate issued" 200 "$cert_status"

  cert_body=$(body_of "$resp")
  for field in '"signature"' '"public_key"' '"chain_start"' '"chain_end"' '"disclaimer"'; do
    if grep -q "$field" <<<"$cert_body"; then
      pass "certificate contains $field"
    else
      fail "certificate missing $field"
    fi
  done

  # The document must state what it does not prove. Dropping that line would
  # let it be read as proof the vehicle was physically there.
  if grep -q "not proof of the physical location" <<<"$cert_body"; then
    pass "certificate states the limits of its claim"
  else
    fail "certificate disclaimer is missing or reworded"
  fi
fi

resp=$(api GET "/api/devices/TRACKER-002/certificate?from=$YESTERDAY&to=$TODAY" "" "$USER1_TOKEN")
expect_status "cross-tenant certificate blocked" 403 "$(status_of "$resp")"

# ----------------------------------------------------------------- summary
echo ""
echo "====================="
echo "Passed: ${GREEN}$passed${NC}   Failed: ${RED}$failed${NC}"
echo ""

if (( failed > 0 )); then
  echo "${RED}Smoke test FAILED${NC}"
  exit 1
fi
echo "${GREEN}Smoke test PASSED${NC}"
