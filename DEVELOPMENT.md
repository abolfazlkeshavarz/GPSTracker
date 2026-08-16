# GPSTracker — development guide

Local setup, day-to-day commands, deployment, and an honest list of what is
still missing.

---

## Quick start

```bash
make up          # Postgres + Redis + tileserver-gl in Docker
make db-reset    # create the database, apply the schema, load sample data
make run         # start the API on :8080
```

In a second terminal:

```bash
make run-frontend    # Vite dev server on :5173
make mqtt-test       # publish simulated GPS data
```

Then open <http://localhost:5173> and log in as **admin / password123**.

Verify everything at once:

```bash
make health   # is every dependency up?
make smoke    # ~49 end-to-end API assertions
```

---

## What runs where

| Service     | Port   | Source                                    |
|-------------|--------|-------------------------------------------|
| API         | 8080   | `make run`                                |
| Frontend    | 5173   | `make run-frontend`                       |
| PostgreSQL  | 5433   | Docker (`gpstracker-postgres`)            |
| Redis       | 6379   | Docker (`gpstracker-redis`)               |
| MQTT        | 1883   | **native Mosquitto service** on this machine |
| Tile server | 8081   | Docker (`gpstracker-tileserver`)          |

Two deliberate deviations from the defaults, both because this machine already
has something on the standard port:

- **Postgres is on 5433**, not 5432 — a native PostgreSQL 18 already owns 5432.
  The Makefile exports `DB_PORT=5433`, and since `godotenv` never overwrites a
  variable that is already set, that beats `tracking-backend/.env`.
- **MQTT uses the native Mosquitto service**, so the compose broker sits behind
  a profile. If you ever need the containerised one, stop the Windows service
  first and run `docker compose --profile broker up -d mosquitto`.

Settings live in `.env.docker`, read by both `docker-compose.yml` and the
Makefile.

---

## Common commands

`make help` lists everything. The ones you will actually use:

### Database
```bash
make db-create     # create the database if absent
make db-migrate    # apply schema.sql (idempotent, safe to re-run)
make db-seed       # + sample users, devices and location history
make db-reset      # drop and rebuild from scratch
make db-shell      # psql prompt
make db-dump FILE=backup.sql
```

### Users, devices, and other entities

Always go through these — they hash passwords with bcrypt. A hand-written
`INSERT` with a plaintext `password_hash` produces an account nobody can log
into.

```bash
make create-admin  PHONE=admin PASSWORD=secret123
make create-user   PHONE=09120000003 PASSWORD=secret123 ROLE=user
make create-device SERIAL=TRACKER-004 SECRET=s3cret USER=09120000003 ACTIVE=1
make assign-device SERIAL=TRACKER-004 USER=09120000003
make list-users
make list-devices SECRETS=1
make stats
```

All of it is `tracking-backend/cmd/cli`; run `go run ./cmd/cli` for the full
command list. This replaced `create_admin.go`, which had the DSN and the admin
password hardcoded and could only do one thing.

### Simulated hardware
```bash
make mqtt-test                          # stream until interrupted
make mqtt-test COUNT=5 INTERVAL=500ms   # publish 5 points and stop
make mqtt-test-bad                      # wrong secret; must be rejected
make mqtt-sub                           # watch raw broker traffic
```

`cmd/mqttsim` emits the exact JSON shape `publishGPS()` produces in
`GPS-SIM800C-MQTT-DC.ino`, so the ingest path is exercised for real.

### Deployment
```bash
make deploy-check                          # pre-flight: secrets, build, schema
make deploy-db DATABASE_URL=postgres://... # apply schema to a remote database
make deploy-health HOST=https://your.domain
```

`deploy-check` is a gate, not advice: it exits non-zero on committed `.env`
files, a hardcoded signing key, code that does not compile, or generated files
that shadow real config.

---

## Sample data

`make db-seed` creates (all passwords `password123`):

| Phone         | Role  | Devices                          |
|---------------|-------|----------------------------------|
| `admin`       | admin | `DEVICEADMIN` (secret `357951`)  |
| `09120000001` | user  | `TRACKER-001`                    |
| `09120000002` | user  | `TRACKER-002`                    |

`TRACKER-003` is left unassigned and inactive so the activation flow can be
tested. `DEVICEADMIN` / `357951` match the firmware constants, so real hardware
works against a seeded database.

**Never load `seed.sql` into production** — these credentials are public.

---

## Verified working

Confirmed by running it, not by reading it:

- MQTT → Postgres → Redis → WebSocket → React. Publishing moved the dashboard
  from `35.6905, 51.3902` to `40.1247, 60.9890` live, with no page reload.
- Messages carrying a wrong device secret are dropped by the subscriber.
- Cross-tenant access is refused: user1 gets 403 on user2's device, not just a
  filtered list.
- Forged-signature and `alg=none` tokens are rejected.
- Repeated failed logins hit the rate limiter and return 429.
- The tile server serves `style.json`, vector tiles and glyphs from the local
  container.

**Not verified:** the map's visual rendering. The headless browser pane reports
`document.hidden === true` and never fires `requestAnimationFrame`, so MapLibre
never composites. Every network resource the map needs returns 200, but whether
it *draws* correctly needs a real browser.

---

## Movement history

`/device/:serial/history` shows a recorded journey: the route drawn on the map,
a marker for every stop, and a summary.

Backed by `GET /api/devices/:serial/track?from=&to=`. Both dates accept
`YYYY-MM-DD` or RFC3339; a bare `to` date covers that whole day.

### How stops are detected

The firmware has no "parked" signal, so a stop is inferred. `BuildTrack` in
`internal/services/track.go` sweeps the fixes in time order and greedily
extends a cluster while every point stays within `stop_radius` of the cluster's
anchor. A cluster lasting at least `min_stop` becomes a stop.

Two defaults matter:

- **`stop_radius` = 60 m.** A stationary consumer GPS drifts 10–40 m. A tighter
  radius splits one parking event into several.
- **`min_stop` = 3 min.** Lower, and traffic lights dominate the results. The
  UI exposes this as "Count as a stop after".

Distance ignores movement *within* a single stop, and hops under 8 m. Without
that, a vehicle parked overnight accumulates kilometres of phantom travel from
drift alone — there is a regression test for exactly this.

`make db-journey` loads a day of driving for `TRACKER-002` with three real
stops plus a 90-second traffic-light pause that must *not* be reported.

## Interface

### Design tokens

Colours, shadows and radii live in `src/styles/tokens.css` as `R G B` triplets,
surfaced through `tailwind.config.js` as semantic names — `bg-surface`,
`text-content-muted`, `border-line`, `text-status-critical`. Pages should use
those, not raw palette classes like `bg-gray-100`, or dark mode silently breaks.

Dark mode is driven by `data-theme` on `<html>`. Every token is declared under
both a `prefers-color-scheme` media query and a `[data-theme]` selector so the
in-app toggle can override the OS in either direction. An inline script in
`index.html` resolves the theme before first paint — without it the page renders
light and then flips, which is a visible flash on every load.

### Data-mark colours are not free choices

`--series-*` and `--status-*` come from a palette checked for colour-vision
deficiency against these exact surfaces (worst adjacent pair ΔE 9.1 light /
8.4 dark; ≥8 is the target). Re-run the validator if they ever change.

Two rules follow from that, and both are load-bearing:

- **Status is never colour alone.** `Badge` requires children and `Meter` takes
  a label for this reason — several status hues are indistinguishable under
  common CVD, and two sit below 3:1 contrast on the light surface. The words
  are the accessible channel.
- **A single number is a tile, not a chart.** The KPI row uses `StatTile`; one
  value with no series has nothing to plot.

### Primitives

`src/components/ui` holds `Button`, `Card`, `Badge`, `StatTile`, `Input`,
`Skeleton`, `EmptyState`, `Meter`, `StatusDot`. Reach for these before writing
new Tailwind strings.

## Realtime connection

One WebSocket for the whole app, owned by `RealtimeProvider` above the router.
Pages subscribe with `useDeviceUpdates(...)`; they never open a socket.

This matters because the socket used to live inside `useWebSocket()`, called
from `Dashboard` and `DeviceDetails` — which tied the connection's lifetime to a
*page component*. It was torn down and rebuilt by things unrelated to the
network:

- navigating between the dashboard and a device
- `ResponsiveLayout` swapping the desktop and mobile layouts at 768px, which
  unmounted the whole subtree
- StrictMode's double mount in development

Measured against the server log, three client-side navigations now produce
**zero** new connections.

The provider also handles what a bare socket does not: exponential backoff with
jitter, reconnect on `visibilitychange` (a socket suspended by a background tab
often returns dead without ever firing `onclose`), `online`/`offline` events, and
a distinct `unauthorized` state that stops retrying instead of hammering the
server with a token that will never be valid.

Server side, `streamDeviceUpdates` now sends a real close frame. Previously it
dropped the TCP connection, so every client saw code 1006 — indistinguishable
from a crash or a proxy timeout.

### Diagnosing a dropped connection

`cmd/wsprobe` connects and reports open time, every frame, and the close code:

```bash
cd tracking-backend
go run ./cmd/wsprobe -duration 90s                      # straight to the API
go run ./cmd/wsprobe -api http://127.0.0.1:5173 -duration 90s   # via Vite
```

Run it against both to tell a backend problem from a proxy problem. The browser
cannot: it reports 1006 for every abnormal close.

## Device telemetry

The firmware sends more than it used to. Fields added in
`firmware/GPS-SIM800C-MQTT-DC-v2.ino`:

| Field | Why it matters |
|---|---|
| `heading` | Course over ground. Orients the vehicle icon and gives direction along a trail. Only sent above 3 km/h — a stationary receiver produces random headings from noise. |
| `hdop` | Horizontal dilution of precision: a real accuracy estimate. Satellite count alone does not tell you how good a fix is. |
| `altitude` | Metres above sea level. |
| `operator` | GSM network name. The backend already had this field and never received it. |
| `fix_age_ms` | How stale the fix was. Without it, a device that lost GPS lock keeps republishing its last position with a fresh timestamp, and the map shows the vehicle parked somewhere it left. |

All are nullable: NULL means "not reported", which stays distinguishable from a
genuine zero. That matters most for `heading`, where 0 means due north.

The old firmware remains compatible — the new fields are simply absent.

## What is still incomplete

### Missing features

- **No "change my password" for ordinary users.** Only an admin can reset a
  password, via the admin panel.
- **No `GET /api/me`.** The frontend trusts the `user` object cached in
  localStorage. If an admin changes someone's role, that user's UI keeps showing
  the old one until they log out and back in. (The server always re-checks, so
  this is cosmetic, not a security hole.)
- **No logout on the server.** Tokens stay valid for their full 72 hours; there
  is no revocation list, so a stolen token cannot be cut off early.
- **Signal bars are computed only on the MQTT path.** When `/signal` falls back
  to Postgres, it returns `gps_bars: 0, gprs_bars: 0` instead of recomputing
  them from satellites/CSQ. `calculateGPSBars`/`calculateGPRSBars` in the mqtt
  package would need to move somewhere both paths can reach.
- No geofencing, trip segmentation, alerts, or reporting.

### Engineering gaps

- **Thin test coverage.** `internal/services` has unit tests for stop detection
  and the smoke script covers 49 API assertions, but there are no handler tests
  and no frontend component tests.
- **No offline buffering in the firmware.** Points are dropped when MQTT is
  unreachable (tunnels, dead zones), leaving holes in the history. Fixing it
  means a RAM or SPIFFS ring buffer that drains on reconnect.
- **ESLint `no-explicit-any` errors** across the API layer and page components.
  Pre-existing; the payload types are largely untyped.
- **A 1.4 MB JS bundle**, unsplit. Both `mapbox-gl` and `maplibre-gl` are
  dependencies, plus `leaflet` and `react-leaflet`, but only `maplibre-gl` is
  used. Dropping the other three is easy dead weight to shed.
- **A compiled binary is committed** at `VPS/tracking-backend/server`.
- **The rate limiter is per-process.** Fine on one host; behind more than one
  backend instance the effective limit multiplies. Move it to Redis or the
  reverse proxy if you scale out.
- **Device secrets are stored in plaintext** and travel in every MQTT payload.
  Hashing them would break the firmware, so it is a protocol-level decision, but
  it does mean broker access equals device impersonation.

### Outstanding security actions

1. **Rotate every committed secret.** `tracking-backend/.env` and
   `VPS/tracking-backend/.env` are in git history with the JWT secret and the
   `admin` database and MQTT passwords. Adding them to `.gitignore` does not
   remove them from history. `make deploy-check` blocks on this.
2. **`deploy.sh` still has `DB_PASSWORD="admin"` and `MQTT_PASSWORD="admin"`.**
   The JWT secret is now generated properly, but these two are unchanged —
   rotating the database password needs a coordinated `ALTER USER`.

---

## Deploying as containers

The whole application runs as containers — `docker-compose.prod.yml` builds and
wires all six services.

```bash
cp .env.prod.example .env.prod          # then edit every CHANGE_ME
make mqtt-passwd MQTT_USER=tracker MQTT_PASSWORD=<strong-password>
make prod-up
make deploy-health HOST=http://localhost
```

| Service | Image | Exposed |
|---|---|---|
| frontend | built from `tracking-frontend/Dockerfile` (nginx) | **:80** |
| backend | built from `tracking-backend/Dockerfile` (~64 MB) | internal only |
| postgres | `postgres:16-alpine` | internal only |
| redis | `redis:7-alpine`, password-protected | internal only |
| mosquitto | `eclipse-mosquitto:2`, auth required | **:1883** (devices need it) |
| tileserver | `maptiler/tileserver-gl` | internal only |

Only nginx and the MQTT broker are published. Postgres and Redis are not
reachable from outside the Docker network even if the host firewall is wrong.

Notes on the setup:

- The backend image runs `go vet` and `go test` during the build, so a broken
  commit cannot produce an image.
- Both images run as a **non-root** user (uid 10001).
- nginx serves the SPA and proxies `/api` and `/tiles`, so everything is
  same-origin and CORS never applies. WebSocket upgrade is configured.
- `APP_ENV=production` makes the backend **refuse to start** without a
  `JWT_SECRET` of at least 32 characters.
- `VITE_*` variables are inlined at build time, so changing the map URL needs a
  rebuild, not a restart.

Run the admin CLI inside the running stack:

```bash
make prod-shell CMD="create-admin -phone admin -password <password>"
```

**Not yet included: TLS.** The frontend container serves plain HTTP on :80.
Terminate TLS in front of it — a host nginx, Caddy, or Traefik with Let's
Encrypt. Until then, bearer tokens travel in clear text. `VPS/deploy.sh`
provisions certificates for the non-containerised deployment; that part has not
been ported to compose.

## Troubleshooting

**`make up` fails with a port bind error.** Something already owns the port.
Find it with `Get-NetTCPConnection -LocalPort 5432 -State Listen` and either
stop it or change the port in `.env.docker`.

**Login returns 500.** The database predates the `role` column. Run
`make db-migrate` — it patches existing databases in place.

**The frontend loads but every request 404s.** `vite.config.js` has reappeared.
It is generated by `tsc -b` and Vite resolves `.js` before `.ts`, so it shadows
the real config. Delete it; `tsconfig.node.json` now emits elsewhere to prevent
this.

**The map is blank.** Check `VITE_MAP_STYLE_URL` in
`tracking-frontend/.env.development` and that the tileserver container is up.
`curl http://localhost:8081/styles/osm-bright/style.json` should return 200.
