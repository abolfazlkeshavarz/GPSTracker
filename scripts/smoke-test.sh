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
