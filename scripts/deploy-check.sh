#!/usr/bin/env bash
# Pre-flight checks to run before deploying GPSTracker to a server.
#
#   make deploy-check
#
# Catches the mistakes that are cheap to find here and expensive to find in
# production: secrets committed to the repository, a weak signing key, code
# that does not compile, a schema that does not apply.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'

errors=0
warnings=0

ok()   { echo "  ${GREEN}[OK]${NC}    $1"; }
bad()  { echo "  ${RED}[BLOCK]${NC} $1"; errors=$((errors + 1)); }
warn() { echo "  ${YELLOW}[WARN]${NC}  $1"; warnings=$((warnings + 1)); }

echo ""
echo "GPSTracker deploy pre-flight"
echo "============================"

# ---------------------------------------------------------------- secrets
echo ""
echo "1. Secrets"

if git ls-files --error-unmatch tracking-backend/.env >/dev/null 2>&1; then
  bad "tracking-backend/.env is tracked by git — it contains credentials"
  echo "         fix: git rm --cached tracking-backend/.env"
else
  ok "tracking-backend/.env is not tracked"
fi

if git ls-files --error-unmatch VPS/tracking-backend/.env >/dev/null 2>&1; then
  bad "VPS/tracking-backend/.env is tracked by git"
  echo "         fix: git rm --cached VPS/tracking-backend/.env"
else
  ok "VPS/tracking-backend/.env is not tracked"
fi

# The literal that used to be hardcoded in config.go and deploy.sh.
if grep -rIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist \
     --exclude="*.md" --exclude="deploy-check.sh" \
     'Whoknowwho' . >/dev/null 2>&1; then
  bad "the old hardcoded JWT secret 'Whoknowwho' still appears in the tree:"
  grep -rIln --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist \
    --exclude="*.md" --exclude="deploy-check.sh" 'Whoknowwho' . 2>/dev/null | sed 's/^/           /'
else
  ok "no hardcoded JWT secret in the working tree"
fi

if grep -qE '^\s*JWT_SECRET="?\$\(|^\s*JWT_SECRET="?\$\{|openssl rand' VPS/deploy.sh 2>/dev/null; then
  ok "deploy.sh generates the JWT secret at deploy time"
else
  bad "deploy.sh appears to hardcode JWT_SECRET"
fi

for var in DB_PASSWORD MQTT_PASSWORD; do
  value=$(grep -oP "^${var}=\"?\K[^\"]*" VPS/deploy.sh 2>/dev/null | head -1)
  if [[ "$value" == "admin" || "$value" == "password" || "$value" == "postgres" ]]; then
    warn "deploy.sh sets $var to a default value ('$value') — change it before deploying"
  fi
done

# ------------------------------------------------------------------ build
echo ""
echo "2. Build"

if (cd tracking-backend && go build ./... >/dev/null 2>&1); then
  ok "backend compiles"
else
  bad "backend does NOT compile (run: cd tracking-backend && go build ./...)"
fi

if (cd tracking-backend && go vet ./... >/dev/null 2>&1); then
  ok "go vet is clean"
else
  warn "go vet reported issues (run: cd tracking-backend && go vet ./...)"
fi

if [[ -d tracking-frontend/node_modules ]]; then
  if (cd tracking-frontend && npx tsc -b --pretty false >/dev/null 2>&1); then
    ok "frontend typechecks"
  else
    bad "frontend does NOT typecheck (run: cd tracking-frontend && npx tsc -b)"
  fi
else
  warn "tracking-frontend/node_modules missing; run npm install to check the frontend"
fi

# ----------------------------------------------------------------- schema
echo ""
echo "3. Schema"

for f in tracking-backend/scripts/schema.sql tracking-backend/scripts/seed.sql; do
  [[ -f "$f" ]] && ok "$f present" || bad "$f is missing"
done

# The seed must never reach production: its passwords are public.
if [[ -n "${ALLOW_SEED:-}" ]]; then
  warn "ALLOW_SEED is set — sample data WILL be loaded. Never do this in production."
else
  ok "sample data will not be loaded (set ALLOW_SEED=1 to override)"
fi

# --------------------------------------------------------------- artifacts
echo ""
echo "4. Repository hygiene"

if git ls-files --error-unmatch VPS/tracking-backend/server >/dev/null 2>&1; then
  warn "a compiled binary (VPS/tracking-backend/server) is committed; build on the server instead"
else
  ok "no compiled server binary committed"
fi

if git ls-files --error-unmatch tracking-frontend/vite.config.js >/dev/null 2>&1; then
  bad "tracking-frontend/vite.config.js is committed and shadows vite.config.ts"
else
  ok "no generated vite.config.js committed"
fi

uncommitted=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [[ "$uncommitted" != "0" ]]; then
  warn "$uncommitted uncommitted change(s) — deploy builds from the working tree"
fi

# ----------------------------------------------------------------- summary
echo ""
echo "============================"
if (( errors > 0 )); then
  echo "${RED}$errors blocker(s)${NC}, $warnings warning(s) — do not deploy yet"
  exit 1
fi
echo "${GREEN}No blockers${NC}, $warnings warning(s)"
echo ""
echo "Next:  scp the repo to the server, then run  sudo bash VPS/deploy.sh"
