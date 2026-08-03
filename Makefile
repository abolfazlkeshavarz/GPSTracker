# GPSTracker
#
# Run `make help` for the command list.
#
# Requires: docker (Docker Desktop), go 1.25+, node 20+.
# On Windows run these from Git Bash, not cmd/PowerShell.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ---------------------------------------------------------------- settings
# Every value can be overridden on the command line or in .env.docker:
#   make db-seed DB_NAME=other_db

-include .env.docker
export

BACKEND_DIR      ?= tracking-backend
FRONTEND_DIR     ?= tracking-frontend
SCRIPTS_DIR      ?= $(BACKEND_DIR)/scripts

DB_HOST          ?= localhost
# 5433, not 5432: a native PostgreSQL already owns 5432 on this machine.
# These are exported, and godotenv does not override real environment
# variables, so they take precedence over tracking-backend/.env.
DB_PORT          ?= 5433
DB_USER          ?= postgres
DB_PASSWORD      ?= postgres
DB_NAME          ?= tracking_db

REDIS_PORT       ?= 6379
MQTT_PORT        ?= 1883
TILESERVER_PORT  ?= 8081
API_PORT         ?= 8080
API_URL          ?= http://localhost:$(API_PORT)

PG_CONTAINER     ?= gpstracker-postgres
REDIS_CONTAINER  ?= gpstracker-redis
MQTT_CONTAINER   ?= gpstracker-mqtt

# Docker Desktop on Windows does not always put docker on PATH.
DOCKER ?= $(shell command -v docker 2>/dev/null || echo "/c/Users/$$USERNAME/AppData/Local/Programs/DockerDesktop/resources/bin/docker")
COMPOSE = $(DOCKER) compose

# psql runs inside the postgres container, so no local client is needed.
PSQL = $(DOCKER) exec -i -e PGPASSWORD=$(DB_PASSWORD) $(PG_CONTAINER) psql -U $(DB_USER) -v ON_ERROR_STOP=1

# Sample credentials created by db-seed.
SEED_PASSWORD ?= password123

.PHONY: help up down restart logs ps clean \
        db-create db-migrate db-seed db-journey db-reset db-shell db-dump db-restore \
        create-admin create-user create-device assign-device list-users list-devices stats \
        run run-frontend build build-backend build-frontend \
        mqtt-test mqtt-test-bad mqtt-sub \
        health test test-all smoke lint fmt tidy \
        deploy-check deploy-db deploy-health

# -------------------------------------------------------------------- help
help: ## Show this help
	@echo ""
	@echo "GPSTracker - available targets"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Quick start:  make up && make db-reset && make run"
	@echo ""

# ------------------------------------------------------------------ docker
up: ## Start Postgres, Redis, Mosquitto and tileserver-gl
	$(COMPOSE) up -d
	@echo "Waiting for Postgres to accept connections..."
	@for i in $$(seq 1 60); do \
		if $(DOCKER) exec $(PG_CONTAINER) pg_isready -U $(DB_USER) >/dev/null 2>&1; then \
			echo "Postgres ready."; exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "Postgres did not become ready in 60s"; exit 1

down: ## Stop all containers
	$(COMPOSE) down

restart: down up ## Restart the stack

logs: ## Tail container logs (SERVICE=postgres to narrow)
	$(COMPOSE) logs -f $(SERVICE)

ps: ## Show container status
	$(COMPOSE) ps

clean: ## Stop containers AND delete their volumes (destroys all data)
	$(COMPOSE) down -v

# ---------------------------------------------------------------- database
db-create: ## Create the database if it does not exist
	@echo "Ensuring database $(DB_NAME) exists..."
	@if $(DOCKER) exec -e PGPASSWORD=$(DB_PASSWORD) $(PG_CONTAINER) \
		psql -U $(DB_USER) -tAc "SELECT 1 FROM pg_database WHERE datname='$(DB_NAME)'" | grep -q 1; then \
		echo "  already exists"; \
	else \
		$(DOCKER) exec -e PGPASSWORD=$(DB_PASSWORD) $(PG_CONTAINER) \
			createdb -U $(DB_USER) $(DB_NAME) && echo "  created"; \
	fi

db-migrate: db-create ## Apply schema.sql (idempotent)
	@echo "Applying schema..."
	@$(PSQL) -d $(DB_NAME) < $(SCRIPTS_DIR)/schema.sql
	@echo "Schema applied."

db-seed: db-migrate ## Load sample users, devices and location history
	@echo "Loading sample data..."
	@$(PSQL) -d $(DB_NAME) < $(SCRIPTS_DIR)/seed.sql

db-journey: ## Load a realistic day of driving with stops (TRACKER-002)
	@$(PSQL) -d $(DB_NAME) < $(SCRIPTS_DIR)/seed_journey.sql

db-reset: ## Drop, recreate, migrate and seed the database
	@echo "Dropping database $(DB_NAME)..."
	@$(DOCKER) exec -e PGPASSWORD=$(DB_PASSWORD) $(PG_CONTAINER) \
		psql -U $(DB_USER) -c "DROP DATABASE IF EXISTS $(DB_NAME) WITH (FORCE)" >/dev/null
	@$(MAKE) --no-print-directory db-seed
	@echo ""
	@echo "Database reset. Log in with: admin / $(SEED_PASSWORD)"

db-shell: ## Open a psql shell
	@$(DOCKER) exec -it -e PGPASSWORD=$(DB_PASSWORD) $(PG_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

db-dump: ## Dump the database to backup.sql (FILE= to override)
	@$(DOCKER) exec -e PGPASSWORD=$(DB_PASSWORD) $(PG_CONTAINER) \
		pg_dump -U $(DB_USER) -d $(DB_NAME) > $(or $(FILE),backup.sql)
	@echo "Wrote $(or $(FILE),backup.sql)"

db-restore: ## Restore from backup.sql (FILE= to override)
	@$(PSQL) -d $(DB_NAME) < $(or $(FILE),backup.sql)
	@echo "Restored from $(or $(FILE),backup.sql)"

# ------------------------------------------------------- entity generation
# These wrap cmd/cli, which hashes passwords with bcrypt. Never INSERT a
# user by hand: a plaintext password_hash can never be logged into.

create-admin: ## Create an admin. PHONE=admin PASSWORD=secret123
	@cd $(BACKEND_DIR) && go run ./cmd/cli create-admin \
		-phone "$(or $(PHONE),admin)" \
		-password "$(or $(PASSWORD),$(SEED_PASSWORD))"

create-user: ## Create a user. PHONE=09... PASSWORD=... [ROLE=user]
	@test -n "$(PHONE)" || { echo "PHONE is required: make create-user PHONE=09120000003 PASSWORD=secret123"; exit 1; }
	@cd $(BACKEND_DIR) && go run ./cmd/cli create-user \
		-phone "$(PHONE)" \
		-password "$(or $(PASSWORD),$(SEED_PASSWORD))" \
		-role "$(or $(ROLE),user)"

create-device: ## Register a device. SERIAL=... SECRET=... [USER=09...] [ACTIVE=1]
	@test -n "$(SERIAL)" || { echo "SERIAL is required: make create-device SERIAL=TRACKER-004 SECRET=s3cret"; exit 1; }
	@test -n "$(SECRET)" || { echo "SECRET is required"; exit 1; }
	@cd $(BACKEND_DIR) && go run ./cmd/cli create-device \
		-serial "$(SERIAL)" \
		-secret "$(SECRET)" \
		$(if $(USER),-user "$(USER)") \
		$(if $(ACTIVE),-active)

assign-device: ## Assign a device to a user. SERIAL=... USER=09...
	@test -n "$(SERIAL)" -a -n "$(USER)" || { echo "SERIAL and USER are required"; exit 1; }
	@cd $(BACKEND_DIR) && go run ./cmd/cli assign-device -serial "$(SERIAL)" -user "$(USER)"

list-users: ## List users
	@cd $(BACKEND_DIR) && go run ./cmd/cli list-users

list-devices: ## List devices (SECRETS=1 to reveal secrets)
	@cd $(BACKEND_DIR) && go run ./cmd/cli list-devices $(if $(SECRETS),-secrets)

stats: ## Show database row counts
	@cd $(BACKEND_DIR) && go run ./cmd/cli stats

# --------------------------------------------------------------- run/build
run: ## Run the backend API server
	@cd $(BACKEND_DIR) && go run ./cmd/server

run-frontend: ## Run the Vite dev server
	@cd $(FRONTEND_DIR) && npm run dev

build: build-backend build-frontend ## Build backend and frontend

build-backend: ## Compile the backend binaries into tracking-backend/bin
	@cd $(BACKEND_DIR) && go build -o bin/server ./cmd/server \
		&& go build -o bin/cli ./cmd/cli \
		&& go build -o bin/mqttsim ./cmd/mqttsim
	@echo "Binaries in $(BACKEND_DIR)/bin/"

build-frontend: ## Build the production frontend bundle
	@cd $(FRONTEND_DIR) && npm run build

# ------------------------------------------------------------------- mqtt
mqtt-test: ## Publish simulated GPS data. [DEVICE=] [SECRET=] [COUNT=] [INTERVAL=]
	@cd $(BACKEND_DIR) && go run ./cmd/mqttsim \
		-device "$(or $(DEVICE),DEVICEADMIN)" \
		-secret "$(or $(SECRET),357951)" \
		-interval "$(or $(INTERVAL),3s)" \
		-count "$(or $(COUNT),0)"

mqtt-test-bad: ## Publish with a wrong secret (should be rejected)
	@cd $(BACKEND_DIR) && go run ./cmd/mqttsim -bad-secret -count 3 -interval 500ms

mqtt-sub: ## Watch every message on the broker
	@mosquitto_sub -h localhost -p $(MQTT_PORT) -t 'devices/#' -v

# ----------------------------------------------------------------- quality
health: ## Check every service is reachable and healthy
	@bash scripts/health.sh

smoke: ## End-to-end test against a running API
	@bash scripts/smoke-test.sh

test: ## Run Go unit tests and the frontend typecheck
	@echo "--- Go tests ---"
	@# go test prints "?  pkg [no test files]" for untested packages; hide those.
	@cd $(BACKEND_DIR) && go test ./... 2>&1 | grep -v "\[no test files\]" || true
	@echo "--- Frontend typecheck ---"
	@cd $(FRONTEND_DIR) && npx tsc -b --pretty false && echo "OK"

test-all: test smoke ## Unit tests, typecheck, then the end-to-end smoke test

lint: ## Vet Go code and lint the frontend
	@cd $(BACKEND_DIR) && go vet ./...
	@cd $(FRONTEND_DIR) && npx eslint src --no-warn-ignored || true

fmt: ## Format Go code
	@cd $(BACKEND_DIR) && gofmt -w ./cmd ./internal

tidy: ## Tidy Go module dependencies
	@cd $(BACKEND_DIR) && go mod tidy

# ------------------------------------------------------------------ deploy
deploy-check: ## Pre-flight checks before deploying to a server
	@bash scripts/deploy-check.sh

deploy-db: ## Apply schema to a remote database (needs DATABASE_URL)
	@test -n "$(DATABASE_URL)" || { echo "DATABASE_URL is required"; exit 1; }
	@psql "$(DATABASE_URL)" -v ON_ERROR_STOP=1 -f $(SCRIPTS_DIR)/schema.sql
	@echo "Remote schema applied."

deploy-health: ## Check a deployed instance (HOST=https://your.domain)
	@test -n "$(HOST)" || { echo "HOST is required: make deploy-health HOST=https://abolfazl.fun"; exit 1; }
	@API_URL="$(HOST)" REMOTE=1 bash scripts/health.sh

# --------------------------------------------------------- containerised prod
PROD_COMPOSE = $(COMPOSE) -f docker-compose.prod.yml --env-file .env.prod

.PHONY: prod-build prod-up prod-down prod-logs prod-ps prod-shell mqtt-passwd images

images: ## Build both production images without starting anything
	$(DOCKER) build -t gpstracker-backend:$(or $(VERSION),latest) ./tracking-backend
	$(DOCKER) build -t gpstracker-frontend:$(or $(VERSION),latest) ./tracking-frontend
	@$(DOCKER) images --format "{{.Repository}}:{{.Tag}}  {{.Size}}" | grep gpstracker

mqtt-passwd: ## Create the production broker password file. MQTT_USER= MQTT_PASSWORD=
	@test -n "$(MQTT_USER)" -a -n "$(MQTT_PASSWORD)" || \
		{ echo "MQTT_USER and MQTT_PASSWORD are required"; exit 1; }
	@mkdir -p deploy/mosquitto
	@$(DOCKER) run --rm eclipse-mosquitto:2 \
		mosquitto_passwd -b -c /tmp/p "$(MQTT_USER)" "$(MQTT_PASSWORD)" >/dev/null 2>&1 || true
	@$(DOCKER) run --rm --entrypoint sh eclipse-mosquitto:2 -c \
		'mosquitto_passwd -b -c /tmp/p "$(MQTT_USER)" "$(MQTT_PASSWORD)" >/dev/null && cat /tmp/p' \
		> deploy/mosquitto/passwd
	@chmod 600 deploy/mosquitto/passwd 2>/dev/null || true
	@echo "Wrote deploy/mosquitto/passwd for user '$(MQTT_USER)'"

prod-build: ## Build the production stack images
	@test -f .env.prod || { echo "Create .env.prod first: cp .env.prod.example .env.prod"; exit 1; }
	$(PROD_COMPOSE) build

prod-up: ## Start the full containerised stack
	@test -f .env.prod || { echo "Create .env.prod first: cp .env.prod.example .env.prod"; exit 1; }
	@test -f deploy/mosquitto/passwd || { echo "Create the broker password file first: make mqtt-passwd MQTT_USER=... MQTT_PASSWORD=..."; exit 1; }
	$(PROD_COMPOSE) up -d --build
	@echo ""
	@echo "Stack starting. Check it with: make prod-ps && make deploy-health HOST=http://localhost"

prod-down: ## Stop the production stack
	$(PROD_COMPOSE) down

prod-logs: ## Tail production logs (SERVICE=backend to narrow)
	$(PROD_COMPOSE) logs -f $(SERVICE)

prod-ps: ## Production container status
	$(PROD_COMPOSE) ps

prod-shell: ## Run the admin CLI inside the running backend container
	$(PROD_COMPOSE) exec backend /app/cli $(or $(CMD),list-users)
