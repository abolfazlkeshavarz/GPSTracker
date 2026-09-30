# GPSTracker mobile

Native Android and iOS app for the GPSTracker platform, written in Flutter
(compiled ahead-of-time to native ARM code on both platforms). It talks to the
same REST API and WebSocket as the web dashboard in `tracking-frontend/`.

Languages: **English**, **فارسی** (full right-to-left layout, Persian digits,
Vazirmatn font) and **Italiano**. The app follows the phone language and can
be switched in Settings.

## What is in it

| Area | What it does |
|---|---|
| **Garage** | Every vehicle on one live map with a swipeable card deck. Live state (moving / engine on / parked / offline) and freshness at a glance. Offline cache: the last known fleet shows even with no network. |
| **Live** | Follow-cam map, a status ring (freshness, GPS quality, cell signal, vehicle battery), one "tracker health" score, and a sensor grid that shows **only the sensors this tracker actually reports**. |
| **Journey** | A day as a story: trips and stops on a timeline, a speed-coloured route, and a replay scrubber that drives the vehicle along the route. Points delivered late through a coverage gap are marked. |
| **Control** | Door lock/unlock, locate, engine restore; engine cut and tracker restart behind a slide-to-confirm (the server still refuses an engine cut above 10 km/h). Command history with delivery status. |
| **Guard mode** | One switch that draws a 150 m "exit" zone around where the car is parked — any movement, towing included, becomes an immediate alert. Uses the existing geofence engine, so it works on every tracker. |
| **Zones** | Long-press the map to add a circular zone; choose alert on arrive, leave or both. |
| **Walk to my car** | Live distance and bearing from your phone to the vehicle. |
| **Alerts** | Real-time over WebSocket, as phone notifications while the app is running, with severity filters and read state. Titles are localised from the alert kind, not the server's English text. |
| **Vehicle settings** | Rename, set odometer, speed-limit alert, reporting interval, silent mode, per-alert toggles. |
| **Security** | Token in the Keychain / Android Keystore (never in plain preferences), optional biometric app lock, HTTPS-only servers in release builds, token sent to the WebSocket in a header rather than the URL, no Android backup of app data. |
| **Server** | Settings → Server connection: change the platform address, with a live connection test. Changing the host signs out, because a token from one server is meaningless to another. |
| **Your map server** | Maps come from the tileserver-gl container on your own VPS (served at `/tiles/` on the platform's domain). An admin can point clients elsewhere in the web Admin panel → Platform. A user can still override it in Settings; OpenStreetMap is used only as a fallback for missing tiles. |

### Works with any tracker hardware

Trackers in the field run several firmware generations (`firmware/v2`–`v4`, the
original `.ino`) and different boards. The app never assumes a sensor exists:
it learns each unit's capabilities from what it actually sends (battery,
ignition, heading, altitude, HDOP, external power, jamming, operator) and
hides what is missing, instead of showing fake zeros. Heading-less units get a
dot marker instead of an arrow; units without HDOP are judged on satellite
count.

## Build locally

```bash
cd mobile
flutter pub get
flutter run                     # debug on a connected phone or emulator
flutter test                    # unit tests
flutter build apk --release     # Android
flutter build ios --release     # iOS (on macOS)
```

Point a build at a different default server:

```bash
flutter build apk --dart-define=DEFAULT_SERVER=https://tracker.example.com
```

Debug builds accept `http://` (for a local backend, e.g.
`http://10.0.2.2:8080` from the Android emulator). Release builds only accept
`https://`.

## CI (GitHub Actions)

`.github/workflows/mobile.yml` runs on every change under `mobile/`:

1. `flutter analyze` and `flutter test`
2. **Android**: per-ABI APKs, a universal APK and an App Bundle (`.aab`)
3. **iOS**: an unsigned `.ipa`

Artifacts are attached to each workflow run. Pushing a tag named
`mobile-v1.2.3` also publishes them as a GitHub Release.

### Signing

- **Android** — add repository secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  Without them, release builds are signed with a debug key (fine for testing,
  not for Play Store).
  Create a key with:
  `keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
  and encode it with `base64 -w0 release.jks`.
- **iOS** — the pipeline builds without signing. Distribution through
  TestFlight / App Store needs an Apple Developer account; re-sign the `.ipa`
  or add a fastlane step with your certificate and provisioning profile.

Optional repository variable `DEFAULT_SERVER` changes the server baked into
CI builds.

## Push notifications — honest status

Alerts reach the phone as notifications **while the app is running** (in the
foreground or recently backgrounded). The backend currently implements only
Web Push (VAPID) for browsers. Delivering alerts to a phone whose app has been
killed requires Firebase Cloud Messaging / APNs on the server side, plus a
Firebase project and Apple push key — that is the next step if closed-app
alerts are needed.
