#!/usr/bin/env bash
# Health check for every GPSTracker dependency.
#
#   bash scripts/health.sh              # check the local dev stack
#   API_URL=https://x REMOTE=1 ...      # check only the public API of a deploy
#
# Exits non-zero if anything required is down, so it is usable as a CI or
# post-deploy gate.

set -uo pipefail

# ------------------------------------------------------------------ config
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT_DIR/.env.docker" ]] && set -a && . "$ROOT_DIR/.env.docker" && set +a

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_NAME="${DB_NAME:-tracking_db}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
TILESERVER_PORT="${TILESERVER_PORT:-8081}"
API_URL="${API_URL:-http://localhost:8080}"
REMOTE="${REMOTE:-}"

PG_CONTAINER="${PG_CONTAINER:-gpstracker-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-gpstracker-redis}"

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'

failures=0
warnings=0

ok()   { echo "  ${GREEN}[OK]${NC}   $1"; }
bad()  { echo "  ${RED}[FAIL]${NC} $1"; failures=$((failures + 1)); }
warn() { echo "  ${YELLOW}[WARN]${NC} $1"; warnings=$((warnings + 1)); }

# Docker Desktop on Windows does not always expose docker on PATH.
DOCKER="$(command -v docker 2>/dev/null || true)"
if [[ -z "$DOCKER" && -x "/c/Users/${USERNAME:-}/AppData/Local/Programs/DockerDesktop/resources/bin/docker" ]]; then
  DOCKER="/c/Users/${USERNAME}/AppData/Local/Programs/DockerDesktop/resources/bin/docker"
fi

# tcp_check host port -- portable "is something listening" without netcat.
tcp_check() {
  local host="$1" port="$2"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 3 "$host" "$port" >/dev/null 2>&1
  else
    # bash's /dev/tcp, available in Git Bash.
    timeout 3 bash -c "exec 3<>/dev/tcp/$host/$port" >/dev/null 2>&1
  fi
}

echo ""
echo "GPSTracker health check"
echo "======================="

# --------------------------------------------------------------- remote API
if [[ -n "$REMOTE" ]]; then
  echo ""
  echo "Remote API ($API_URL)"

  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/health" 2>/dev/null); code=${code:-000}
  if [[ "$code" == "200" ]]; then
    ok "GET /health -> 200"
  else
    bad "GET /health -> $code"
  fi

  # An unauthenticated protected route must be refused.
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/api/devices" 2>/dev/null); code=${code:-000}
  if [[ "$code" == "401" ]]; then
    ok "GET /api/devices without a token -> 401"
  else
    bad "GET /api/devices without a token -> $code (expected 401)"
  fi

  echo ""
  if [[ $failures -gt 0 ]]; then
    echo "${RED}$failures check(s) failed.${NC}"; exit 1
  fi
  echo "${GREEN}Remote API healthy.${NC}"; exit 0
fi

# --------------------------------------------------------------- containers
echo ""
echo "Containers"
if [[ -z "$DOCKER" ]]; then
  warn "docker not found on PATH; skipping container checks"
else
  for c in "$PG_CONTAINER" "$REDIS_CONTAINER"; do
    status=$("$DOCKER" inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo "missing")
    health=$("$DOCKER" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo "none")

    if [[ "$status" == "running" && ( "$health" == "healthy" || "$health" == "none" ) ]]; then
      ok "$c ($status)"
    elif [[ "$status" == "running" ]]; then
      warn "$c running but health=$health"
    else
      bad "$c is $status (try: make up)"
    fi
  done
fi

# ---------------------------------------------------------------- postgres
echo ""
echo "PostgreSQL ($DB_HOST:$DB_PORT/$DB_NAME)"
if ! tcp_check "$DB_HOST" "$DB_PORT"; then
  bad "nothing listening on $DB_HOST:$DB_PORT"
else
  ok "port $DB_PORT open"

  if [[ -n "$DOCKER" ]] && "$DOCKER" ps --format '{{.Names}}' 2>/dev/null | grep -q "^${PG_CONTAINER}$"; then
    psql_run() { "$DOCKER" exec -i -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
  elif command -v psql >/dev/null 2>&1; then
    psql_run() { PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null; }
  else
    psql_run() { return 1; }
  fi

  if [[ "$(psql_run 'SELECT 1')" == "1" ]]; then
    ok "authenticated as $DB_USER"

    # Every table the application actually reads.
    for table in users devices location_history audit_logs; do
      if [[ "$(psql_run "SELECT to_regclass('public.$table') IS NOT NULL")" == "t" ]]; then
        count=$(psql_run "SELECT COUNT(*) FROM $table")
        ok "table $table exists (${count:-?} rows)"
      else
        bad "table $table is missing (try: make db-migrate)"
      fi
    done

    # The column whose absence used to break every login.
    if [[ "$(psql_run "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='users' AND column_name='role'")" == "1" ]]; then
      ok "users.role column present"
    else
      bad "users.role is MISSING - login will fail (try: make db-migrate)"
    fi
  else
    bad "cannot authenticate to $DB_NAME as $DB_USER"
  fi
fi

# ------------------------------------------------------------------- redis
echo ""
echo "Redis ($REDIS_HOST:$REDIS_PORT)"
if ! tcp_check "$REDIS_HOST" "$REDIS_PORT"; then
  bad "nothing listening on $REDIS_HOST:$REDIS_PORT"
else
  ok "port $REDIS_PORT open"
  if [[ -n "$DOCKER" ]] && "$DOCKER" ps --format '{{.Names}}' 2>/dev/null | grep -q "^${REDIS_CONTAINER}$"; then
    if [[ "$("$DOCKER" exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | tr -d '\r')" == "PONG" ]]; then
      ok "PING -> PONG"
      keys=$("$DOCKER" exec "$REDIS_CONTAINER" redis-cli --raw DBSIZE 2>/dev/null | tr -d '\r')
      ok "${keys:-0} key(s) cached"
    else
      bad "PING failed"
    fi
  fi
fi

# -------------------------------------------------------------------- mqtt
echo ""
echo "MQTT ($MQTT_HOST:$MQTT_PORT)"
if ! tcp_check "$MQTT_HOST" "$MQTT_PORT"; then
  bad "nothing listening on $MQTT_HOST:$MQTT_PORT"
else
  ok "port $MQTT_PORT open"
  if command -v mosquitto_sub >/dev/null 2>&1; then
    if timeout 6 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -t '$SYS/broker/version' -C 1 -W 4 >/dev/null 2>&1; then
      ok "broker accepts subscriptions"
    else
      warn "broker did not answer \$SYS within 4s (may require auth)"
    fi
  else
    warn "mosquitto_sub not on PATH; only checked the port"
  fi
fi

# -------------------------------------------------------------- tileserver
echo ""
echo "Tile server (localhost:$TILESERVER_PORT)"
if ! tcp_check localhost "$TILESERVER_PORT"; then
  warn "not running (optional: docker compose up -d tileserver)"
else
  ok "port $TILESERVER_PORT open"
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    "http://localhost:$TILESERVER_PORT/styles/osm-bright/style.json" 2>/dev/null); code=${code:-000}
  if [[ "$code" == "200" ]]; then
    ok "style osm-bright served"
  else
    warn "style osm-bright -> $code"
  fi
fi

# --------------------------------------------------------------- backend API
echo ""
echo "Backend API ($API_URL)"
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$API_URL/health" 2>/dev/null); code=${code:-000}
if [[ "$code" == "200" ]]; then
  ok "GET /health -> 200"

  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$API_URL/api/devices" 2>/dev/null); code=${code:-000}
  if [[ "$code" == "401" ]]; then
    ok "protected route rejects anonymous requests"
  else
    bad "GET /api/devices without a token -> $code (expected 401)"
  fi
else
  warn "not running (start it with: make run)"
fi

# ----------------------------------------------------------------- summary
echo ""
echo "======================="
if [[ $failures -gt 0 ]]; then
  echo "${RED}$failures failed${NC}, $warnings warning(s)"
  exit 1
fi
echo "${GREEN}All required checks passed${NC}, $warnings warning(s)"
