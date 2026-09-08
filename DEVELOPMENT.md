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
make smoke    # 63 end-to-end API assertions
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

## Gap-free tracking

The differentiator: **no missing kilometres**. Points recorded while the
network is unreachable are buffered on the device and replayed when it
reconnects, so tunnels, underground parking and rural dead zones stop leaving
holes in the history.

Three pieces have to agree for this to work:

1. **The firmware buffers to flash.** `firmware/GPS-SIM800C-MQTT-DC-v3.ino`
   keeps a line-delimited JSON queue on LittleFS, drains it oldest-first on
   reconnect, and removes only the prefix it actually delivered — so a link
   that drops mid-drain resumes rather than losing the batch.

2. **`recorded_at` is the device clock, not the server clock.** This was the
   blocker: the old ingest hardcoded `NOW()`, so a point replayed twenty
   minutes late was filed as *now* and the vehicle appeared to teleport.
   `resolveTimestamp` in `internal/mqtt/ingest.go` now trusts the device time
   within limits — nothing before 2020, nothing more than 5 minutes in the
   future, nothing older than 30 days — and falls back to the server clock
   outside them.

3. **Replay is idempotent.** A unique index on `(device_serial, recorded_at)`
   plus `ON CONFLICT DO NOTHING` means a device re-sending a point it already
   delivered creates nothing. Verified: sending the same five points twice
   leaves the row count unchanged.

A backfilled point is stored in history but deliberately **not** written to the
Redis `latest:` key and **not** broadcast over the WebSocket. Both would drag
the live marker backwards to a position the vehicle left long ago.

```bash
make mqtt-gap GAP_MINUTES=20   # live points, an outage, then the replay
make mqtt-replay               # send the same points twice; no duplicates
```

The UI marks recovered stretches with a dashed amber line on the history map
and says how many points were recovered, so nobody wonders why the map filled
in after the fact.

## Odometer

A monotonic **lifetime distance counter** per device, in its own
`device_odometer` table. Unlike the per-range distance in a track summary
(re-summed from history on every request), this is a running total folded in
one fix at a time on the ingest path.

`UpdateOdometer` in `internal/services/odometer.go` runs after every stored
**live** point:

- The hop from the last counted position is added when it is between the
  **8 m noise floor** and a **10 km max-hop** ceiling.
- Below 8 m the anchor does not move, so a parked vehicle cannot drift up
  kilometres one sub-threshold step at a time (same noise floor `BuildTrack`
  uses).
- Above 10 km it is treated as a teleport — GPS glitch, or a cold start
  somewhere new: the anchor jumps to the new position but the distance is not
  counted.

Backfilled points are deliberately **excluded**: they arrive out of
chronological order, so measuring their hop from the last-counted position
would zig-zag the total. Kilometres driven through a coverage gap are still
recovered by `BuildTrack` over the replayed history.

```
GET /api/devices/:serial/odometer      -> { total_meters, total_km, updated_at }
PUT /api/devices/:serial/odometer      { "total_km": 48210 }
```

`PUT` overwrites the reading — to match the vehicle dashboard when a tracker
is fitted, or to reset to `0` — and leaves the last-counted anchor untouched,
so the next point does not make the counter jump.

```bash
make mqtt-odometer                       # drive 1 km in 100 m steps
make mqtt-odometer STEPS=21 STEP_METERS=250
```

`cmd/mqttsim -distance-steps N` walks due east in fixed ground steps with
timestamps 5 s apart, so the expected gain is `(N-1) * step-meters`. Keep `N`
at 30 or below to stay inside the 3-minute backfill threshold.

## The alert engine

Every rule answers a question an owner actually asks, and each is evaluated
against a single live point on the MQTT ingest path
(`internal/mqtt/alerts.go`).

| Rule | Fires on | Severity |
|---|---|---|
| `tow` | movement ≥ 8 km/h with the ignition **off** | critical |
| `power_cut` / `power_restored` | `ext_power` transition | critical / info |
| `impact` | device-reported shock ≥ 4 g | critical |
| `jamming` | modem reports no usable signal for 4 consecutive reads | critical |
| `sos` | panic button | critical |
| `overspeed` | speed above the per-device limit | warning |
| `harsh_accel` / `harsh_brake` / `harsh_corner` | accelerometer thresholds | warning |
| `ignition_on` / `ignition_off` | ignition transition | info |
| `geofence_enter` / `geofence_exit`, `low_battery`, `offline` / `back_online` | as before | mixed |

Three properties are load-bearing across all of them:

1. **Rules fire on transitions, not states.** A device with the ignition on
   reports that every 30 seconds; alerting on the state would produce 120
   notifications an hour. The state is recorded *even when the rule is switched
   off*, so re-enabling it does not immediately fire against a stale baseline.

2. **Rules that cannot be a transition are debounced** with a per-rule cooldown
   claimed in a single `UPDATE ... RETURNING`. Doing the check and the stamp as
   two statements lets two points arriving together both pass.

3. **Everything except SOS is switchable per device.** A panic button that a
   settings screen can disable is a liability.

`severityFor` derives severity from the kind rather than storing it per rule,
so the two cannot disagree — and it drives push urgency, so a theft alert
demoted to `info` would be *delivered late*, not merely shown quietly.

```bash
make mqtt-theft   # tow -> power cut -> jamming -> ignition -> impact
```

## Remote control

Commands travel `devices/<serial>/commands`; acknowledgements come back on
`devices/<serial>/ack`. Both directions are **HMAC-signed with the device
secret** — without that, anyone able to write to the broker could stop any
vehicle on it.

Commands are **queued in Postgres**, not fired and forgotten. A device on GPRS
is routinely unreachable for a minute, and the one question this feature must
answer honestly is "did the engine actually cut?". `pending → sent → acked`
can answer that; a publish call cannot. Undelivered commands are retried by a
sweeper and **expire after 30 minutes** — silently executing a stale
engine-cut when a unit finally reconnects would be worse than dropping it.

### The immobiliser interlock

Engine cut-off is refused above 10 km/h, **in both the server and the
firmware**. An immobiliser that can stop a car at 90 km/h is a way to kill
someone; neither check is allowed to be the only one. The server also requires
`confirm: true` on the API call, so the confirmation the UI shows cannot be
bypassed by calling the endpoint directly.

If the device has no current fix the cut is *allowed* — a stolen vehicle whose
tracker has just been jammed is exactly when an owner most needs it to work.

```bash
make mqtt-obey    # a virtual device that verifies signatures and acks
make mqtt-commands # watch the downlink and the acks
```

## Notifications (PWA + Web Push)

The WebSocket reaches a tab that is already open. Web Push is the only thing
that reaches someone whose phone is in their pocket at 3am, which is precisely
when the theft alerts matter — so both run, and they are complementary rather
than redundant.

```bash
make vapid-keygen   # once per environment
```

Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. **Without them
push stays disabled** and the rest of the app is unaffected. Note they belong
in `.env.docker` locally, not `tracking-backend/.env`: the Makefile exports
every variable it knows about, and an exported-but-empty one still counts as
set, which stops `godotenv` loading the real value.

The service worker (`src/sw.ts`, built with `injectManifest` — a generated
worker cannot handle `push`) does three things, in order of importance:
push notifications, the offline app shell, and update handling.

Details worth keeping:

- **Permission is only ever requested from a click.** Browsers permanently
  deny an origin that prompts on load, and a denied origin cannot ask again —
  which would remove the only channel that reaches a closed app.
- **Critical alerts get `requireInteraction`, a distinct vibration pattern and
  `Urgency: high`**; routine ones get `Urgency: low` so they do not wake the
  radio.
- **Notifications collapse by `kind`+`device`**, so a flapping geofence leaves
  one notification rather than forty — except impact, SOS, power-cut and tow,
  which are deliberately uncollapsed so a second one is never swallowed.
- **Dead endpoints are pruned** on HTTP 404/410, or the server retries a dead
  browser forever.
- **The subscription is re-synced on every session start** and on
  `pushsubscriptionchange`. A browser can rotate or drop a subscription on its
  own, and the failure mode is silent: notifications simply stop.
- **`registerType: 'prompt'`**, not `autoUpdate`: a shell that swaps itself
  mid-session can end up running against an API it was not built for.

On **iOS, Web Push only works once the app is installed to the Home Screen**,
and there is no `beforeinstallprompt` to raise — so the install banner detects
iOS and gives Share-menu instructions instead.

### Verifying it

The dev server serves a stand-in worker; the real one only exists in a build.
`npm run preview` serves `dist/` with the same `/api` proxy, which is where to
test registration, precaching and push for real.

## Selling and managing a unit

Two clocks, deliberately modelled apart because they are easy to conflate:

- **Subscription** — platform access, sold per unit. Every device gets a
  **90-day trial** on activation (`services.EnsureTrial`, idempotent, so
  re-registering does not hand out another three months). Renewal *adds* to
  remaining time if the plan is live and starts from now if it lapsed, so a
  customer who forgot for a month does not pay for that month.
- **Warranty** — hardware cover, **18 months from the purchase date**, not
  from activation: a unit that sat in a drawer for two months has sixteen
  months left. Calendar months, not 30-day arithmetic.

A sweeper warns 7 days ahead and again on expiry, once each per cycle — the
`warned_at` / `expired_at` markers are what stop a daily sweep training people
to ignore the reminder.

Admin-only: `POST /api/admin/devices/:serial/subscription` and
`PUT /api/admin/devices/:serial/inventory` (IMEI, model, SIM, purchase date,
warranty months). A customer extending their own subscription would make the
whole thing decorative.

## Tamper-evident history

The second differentiator: history that can be **shown** to be unaltered,
rather than merely asserted.

Two independent mechanisms, kept separate because they prove different things:

| Mechanism | Proves | Does not prove |
|---|---|---|
| **HMAC** on each payload | the point came from something holding the device secret, unmodified in flight | anything about what happened after storage |
| **Hash chain** over stored rows | nothing was edited, deleted or reordered after storage — including by someone with database access | that the point was genuine to begin with |

### The chain

Every stored point is hashed together with the hash before it, inside the same
transaction as the insert, with the per-device chain head locked `FOR UPDATE`
so concurrent inserts cannot fork it.

It is ordered by **arrival**, not by `recorded_at`. Backfilled points
legitimately arrive out of chronological order, so the claim the chain supports
is exactly: *these records were received in this order and have not been
modified since*.

Rows stored before this feature existed have no hash. They are reported as
`unprotected_count` and excluded from the verified set — never silently counted
as verified. Claiming rows are tamper-proof when they were never hashed is the
one thing this feature must not do.

### Certificates

`GET /api/devices/:serial/certificate` issues a signed JSON document: the
points, the chain endpoints, a distance and duration summary, and an **Ed25519**
signature.

Asymmetric on purpose. An HMAC could only be checked by someone holding the
same secret — i.e. the operator verifying their own claim. With Ed25519 the
public key is published at `GET /api/certificate-key` (unauthenticated), so an
insurer, a customer's auditor or a court expert can verify the document without
an account here and without being able to forge one.

Every certificate carries a disclaimer stating what it does not prove: a device
can be moved, its secret extracted, or its GPS spoofed. It is evidence about the
recorded data, not about the world.

```bash
make cert-keygen                        # once per environment
make verify-chain SERIAL=DEVICEADMIN    # replay the chain from the database
make cert-verify FILE=certificate.json  # verify a document with no database
```

### Firmware authentication

Rev 3 signs each payload instead of transmitting the secret. Previously the
device secret travelled in cleartext in **every** message, so anyone able to
read the broker could impersonate the device permanently.

Legacy firmware still works — a payload with no `sig` falls back to the
plaintext secret — but those points are recorded as `auth_method = 'secret'`
and reported separately everywhere, because they are weaker evidence.

The signing format is a hard contract between C++ and Go:

```
device|timestamp|lat|lng        coordinates at exactly 6 decimal places
```

`internal/integrity/vectors_test.go` pins it. If that test fails, deployed
devices will stop authenticating until they are reflashed.

### Verified by running it

- 21-point chain across a simulated 10-minute gap: verifies clean.
- Editing one latitude in the database: caught, with the exact record id.
- Deleting a row, reordering rows, clearing a hash: all caught.
- Editing a certificate's distance, or moving a point inside it: signature
  invalid.
- Verifying a certificate against an unrelated public key: rejected.
- Mixed HMAC and legacy points in one chain: still verifies.

## Interface

The visual direction was resolved with the `ui-ux-pro-max` plugin and is
recorded in `design-system/gpstracker/MASTER.md`, including the places the
build deliberately departs from the generated output and why. Read that file
before changing the look of anything.

**Style:** Data-Dense Dashboard (`accessibility risk: low`, built for
operational dashboards). **Density:** 8/10. **Motion:** standard tier, ~400ms.

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

### Two conventions worth keeping

- **Reserve space for anything async.** `StatTile` renders a non-breaking
  space when it has no hint, and the section header has a `min-h`. Without
  that, a value arriving after load shifts every tile in the row.
- **Announce state as a sentence.** The device count is
  `role="status" aria-atomic="true"` reading "2 of 3 devices reporting", not a
  bare number — a screen reader announcing "2" on its own means nothing.

### Verified in the browser

Light mode: every sampled text pair ≥ 4.76:1. Dark mode: ≥ 6.03:1. Sidebar
navigation items are 44px tall; the mobile bar is 52px.

One gotcha when testing in a headless pane: it does not composite, so CSS
transitions freeze mid-flight and `getComputedStyle` reports the *pre-toggle*
colour. Dark mode looks broken and contrast looks like it fails. Inject
`*{transition:none!important}` before measuring.

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
- No trip segmentation or scheduled reporting. Geofencing, the alert engine,
  remote control, the odometer, subscriptions and push notifications are
  implemented (see the sections above).
- **Push cannot be verified in a headless pane.** Service-worker registration
  and `Notification.permission` are both blocked there, so the worker is
  checked statically (it parses, the precache manifest is injected, the
  handlers are present) and the enrolment endpoints are covered by `make
  smoke`. Actual delivery needs a real browser.
- **The jamming signal is a heuristic**, not a dedicated detector: the SIM800
  has no jam-detect line, so it is inferred from consecutive no-signal reads.
  A long tunnel with a dead cell at the end can produce a false positive.
- **`set_interval` is stored server-side and pushed best-effort.** A device
  that never comes back online keeps its old interval; the stored value is
  authoritative and re-applied on the next successful delivery.

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
