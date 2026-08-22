/*
 * ESP32 + SIM800C GPS tracker — revision 3.
 *
 * Adds the two things the platform is built around:
 *
 *   1. GAP-FREE TRACKING. Points recorded while the network is unreachable are
 *      written to flash and replayed, oldest first, once the link comes back.
 *      Each carries its own GPS timestamp, so the server files it at the
 *      moment it happened rather than the moment it arrived. Tunnels,
 *      underground parking and rural dead zones stop leaving holes in the map.
 *
 *   2. HMAC AUTHENTICATION. The device signs each payload with its secret
 *      instead of transmitting the secret. Previously the secret travelled in
 *      cleartext in every single message, so anyone able to read the broker
 *      could impersonate the device forever.
 *
 * Requires, in addition to rev 2's libraries:
 *   - LittleFS (bundled with the ESP32 core)
 *   - mbedtls  (bundled with the ESP32 core; used for HMAC-SHA256)
 *
 * See firmware/GPS-SIM800C-MQTT-DC-v2.ino for the bug fixes this builds on
 * (the setup() early-return that bricked the device, the 1970 timestamp
 * fallback, hardcoded ignition, and the UTC conversion).
 */

#define TINY_GSM_MODEM_SIM800

#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <mbedtls/md.h>

// ====================== PIN DEFINITIONS ======================
#define GPS_RX 14
#define GPS_TX 15

#define SIM_RX 13
#define SIM_TX 12

#define IGNITION_PIN 34
#define IGNITION_ACTIVE_LOW false

// ====================== SERIALS ======================
HardwareSerial gpsSerial(1);
HardwareSerial simSerial(2);

// ====================== OBJECTS ======================
TinyGPSPlus gps;
TinyGsm modem(simSerial);
TinyGsmClient gsmClient(modem);
PubSubClient mqttClient(gsmClient);

// ====================== MQTT CONFIG ======================
const char* mqtt_server   = "85.9.123.30";
const int   mqtt_port     = 1883;
const char* mqtt_username = "testquitto";
const char* mqtt_password = "admin";

// ====================== DEVICE INFO ======================
const char* DEVICE_NAME   = "DEVICEADMIN";
const char* DEVICE_SECRET = "357951";
const char* MQTT_TOPIC    = "devices/DEVICEADMIN/location";

// ====================== APN ======================
const char apn[]      = "mcinet";
const char gprsUser[] = "";
const char gprsPass[] = "";

// ====================== TIMING ======================
const unsigned long PUBLISH_INTERVAL_MS   = 30000UL;
const unsigned long RECONNECT_INTERVAL_MS = 10000UL;
const unsigned long NETWORK_RETRY_MS      = 30000UL;
const unsigned long STALE_FIX_MS          = 60000UL;

// ====================== STORE AND FORWARD ======================
//
// A line-delimited JSON queue on LittleFS. One record per line keeps append
// and replay trivial, and a corrupt tail costs one point rather than the file.
const char* QUEUE_PATH = "/queue.jsonl";

// Hard cap on the queue. At ~200 bytes per record this is roughly 400 KB —
// comfortable on a 1.5 MB SPIFFS partition, and about 28 hours of buffering
// at one point every 30s.
const size_t  MAX_QUEUED_RECORDS = 2000;
const size_t  MAX_QUEUE_BYTES    = 400UL * 1024UL;

// Points released per loop while draining. Small enough that GPS parsing and
// MQTT keepalives still get serviced between sends.
const int DRAIN_BATCH = 5;

// ====================== STATE ======================
unsigned long lastGpsPublish       = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long lastNetworkAttempt   = 0;

bool   modemReady   = false;
bool   fsReady      = false;
String cachedOperator = "";

// =====================================================

void setup() {
  Serial.begin(115200);
  delay(3000);

  Serial.println();
  Serial.println("================================");
  Serial.println("ESP32 + SIM800 MQTT GPS Tracker");
  Serial.println("rev 3 - store & forward + HMAC");
  Serial.println("================================");

  pinMode(IGNITION_PIN, INPUT);

  // Format on failure: a corrupt filesystem must not stop the tracker from
  // working, it should just start with an empty queue.
  fsReady = LittleFS.begin(true);
  if (fsReady) {
    Serial.printf("LittleFS ready. Queued points: %u\n", (unsigned)queueCount());
  } else {
    Serial.println("LittleFS FAILED - running without offline buffering");
  }

  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  simSerial.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(3000);

  Serial.println("Initializing modem...");
  modem.restart();
  Serial.print("Modem: ");
  Serial.println(modem.getModemInfo());

  // Configured unconditionally: rev 1 only reached this line when the network
  // came up first try, and skipping it left the client permanently unable to
  // connect.
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setBufferSize(512);

  bringUpNetwork();
}

// =====================================================

void loop() {

  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  if (!modemReady) {
    if (millis() - lastNetworkAttempt > NETWORK_RETRY_MS) {
      lastNetworkAttempt = millis();
      bringUpNetwork();
    }
    // Still record position while offline — that is the entire point.
    captureIfDue();
    return;
  }

  if (!mqttClient.connected()) {
    if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = millis();
      connectMQTT();
    }
    captureIfDue();
    return;
  }

  mqttClient.loop();

  // Drain the backlog before adding to it, so the history fills in oldest
  // first and the queue cannot grow while the link is healthy.
  drainQueue();

  captureIfDue();
}

// captureIfDue builds a point on schedule and either sends or queues it.
void captureIfDue() {
  if (millis() - lastGpsPublish <= PUBLISH_INTERVAL_MS) return;
  lastGpsPublish = millis();

  String payload = buildPayload();
  if (payload.length() == 0) return;

  if (mqttClient.connected() && mqttClient.publish(MQTT_TOPIC, payload.c_str())) {
    Serial.println("Published live");
    return;
  }

  Serial.println("Offline - queueing point");
  enqueue(payload);
}

// =====================================================

bool bringUpNetwork() {

  Serial.print("Waiting for network");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println(" FAILED");
    modemReady = false;
    return false;
  }
  Serial.println(" OK");

  Serial.print("Signal: ");
  Serial.println(modem.getSignalQuality());

  Serial.print("Connecting to APN: ");
  Serial.println(apn);

  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("GPRS FAILED");
    modemReady = false;
    return false;
  }

  Serial.println("GPRS connected");
  Serial.print("IP: ");
  Serial.println(modem.localIP());

  cachedOperator = modem.getOperator();
  Serial.print("Operator: ");
  Serial.println(cachedOperator);

  modemReady = true;
  return true;
}

void connectMQTT() {

  Serial.println();
  Serial.println("Connecting to MQTT...");

  String clientId = "ESP32SIM800-";
  clientId += String(random(0xffff), HEX);

  if (mqttClient.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
    Serial.println("MQTT connected");
    return;
  }

  int state = mqttClient.state();
  Serial.print("MQTT failed. State=");
  Serial.println(state);

  // -3/-4 usually mean the GPRS context died underneath us; re-register
  // rather than hammering MQTT against a dead bearer.
  if ((state == -3 || state == -4) && !modem.isGprsConnected()) {
    Serial.println("GPRS is down; will re-register");
    modemReady = false;
  }
}

// =====================================================
// HMAC-SHA256
// =====================================================

// hmacSha256Hex signs a message with the device secret.
//
// The string signed here must match the server byte for byte:
//     device|timestamp|lat|lng      with lat/lng at 6 decimal places
// See SignPayload in internal/integrity/chain.go.
String hmacSha256Hex(const char* key, const String& message) {
  byte hmacResult[32];

  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);

  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&ctx, hmacResult);
  mbedtls_md_free(&ctx);

  char hex[65];
  for (int i = 0; i < 32; i++) {
    sprintf(hex + (i * 2), "%02x", hmacResult[i]);
  }
  hex[64] = '\0';

  return String(hex);
}

// =====================================================

bool readIgnition() {
  int raw = digitalRead(IGNITION_PIN);
  return IGNITION_ACTIVE_LOW ? (raw == LOW) : (raw == HIGH);
}

// utcFromGps converts the GPS date/time to a real Unix timestamp.
//
// mktime() is wrong here: it reads struct tm as local time while GPS supplies
// UTC. This uses days-from-civil so the result never depends on a timezone
// setting the device does not have.
uint32_t utcFromGps() {
  int y = gps.date.year();
  unsigned m = gps.date.month();
  unsigned d = gps.date.day();

  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const long days = (long)era * 146097 + (long)doe - 719468;

  return (uint32_t)days * 86400UL
       + (uint32_t)gps.time.hour() * 3600UL
       + (uint32_t)gps.time.minute() * 60UL
       + (uint32_t)gps.time.second();
}

// buildPayload renders the current fix as a signed JSON message.
//
// Returns an empty string when the point is not worth storing.
String buildPayload() {

  // A queued point needs a real timestamp, or the server cannot place it in
  // history. Without a GPS clock there is nothing to buffer.
  bool haveClock = gps.date.isValid() && gps.time.isValid() && gps.date.year() >= 2020;

  StaticJsonDocument<512> doc;

  doc["device"] = DEVICE_NAME;
  doc["csq"]    = modem.getSignalQuality();

  #ifdef TINY_GSM_MODEM_SIM800
    doc["battery"] = modem.getBattVoltage() / 1000.0;
  #endif

  doc["ignition"] = readIgnition();

  if (cachedOperator.length() > 0) {
    doc["operator"] = cachedOperator;
  }

  if (!gps.location.isValid() || !haveClock) {
    // Heartbeat: proves the device is alive with no sky view. Not queued —
    // an un-timestamped heartbeat replayed hours later means nothing.
    if (!mqttClient.connected()) return "";

    doc["no_fix"] = true;

    String out;
    serializeJson(doc, out);
    return out;
  }

  uint32_t ts = utcFromGps();

  // Round to 6 decimal places BEFORE both signing and serialising.
  //
  // The server re-signs using the lat/lng it parsed out of the JSON, at
  // "%.6f". If the device signed an unrounded value, a coordinate sitting on
  // a rounding boundary could serialise one way and re-round the other,
  // producing an HMAC mismatch on a perfectly valid point. Signing exactly
  // what is transmitted removes the whole class of bug.
  double la = round(gps.location.lat()  * 1000000.0) / 1000000.0;
  double ln = round(gps.location.lng() * 1000000.0) / 1000000.0;

  doc["lat"] = la;
  doc["lng"] = ln;
  doc["speed"] = (int)gps.speed.kmph();
  doc["sat"]   = gps.satellites.value();
  doc["timestamp"] = ts;

  // Heading is noise below walking pace, so it is only sent while moving.
  if (gps.course.isValid() && gps.speed.kmph() > 3.0) {
    doc["heading"] = gps.course.deg();
  }
  if (gps.altitude.isValid()) {
    doc["altitude"] = gps.altitude.meters();
  }
  if (gps.hdop.isValid()) {
    doc["hdop"] = gps.hdop.hdop();
  }

  unsigned long fixAge = gps.location.age();
  doc["fix_age_ms"] = (uint32_t)fixAge;
  if (fixAge > STALE_FIX_MS) {
    doc["stale"] = true;
  }

  // Sign, and do NOT include the secret. Must match the server's format
  // exactly: device|timestamp|lat|lng, 6 decimal places on the coordinates.
  char signable[96];
  snprintf(signable, sizeof(signable), "%s|%lu|%.6f|%.6f",
           DEVICE_NAME, (unsigned long)ts, la, ln);

  doc["sig"] = hmacSha256Hex(DEVICE_SECRET, String(signable));

  String out;
  serializeJson(doc, out);
  return out;
}

// =====================================================
// Queue
// =====================================================

size_t queueCount() {
  if (!fsReady) return 0;

  File f = LittleFS.open(QUEUE_PATH, "r");
  if (!f) return 0;

  size_t n = 0;
  while (f.available()) {
    if (f.read() == '\n') n++;
  }
  f.close();

  return n;
}

// enqueue appends one payload to the flash buffer.
void enqueue(const String& payload) {
  if (!fsReady) return;

  File check = LittleFS.open(QUEUE_PATH, "r");
  size_t size = check ? check.size() : 0;
  if (check) check.close();

  // Drop the oldest half when full. Losing the start of a long outage beats
  // losing the most recent positions, which are the ones anyone will ask
  // about first.
  if (size > MAX_QUEUE_BYTES || queueCount() >= MAX_QUEUED_RECORDS) {
    Serial.println("Queue full - discarding oldest half");
    trimOldest(MAX_QUEUED_RECORDS / 2);
  }

  File f = LittleFS.open(QUEUE_PATH, "a");
  if (!f) {
    Serial.println("Could not open queue for append");
    return;
  }

  f.println(payload);
  f.close();
}

// drainQueue republishes buffered points, oldest first.
//
// Only the successfully sent prefix is removed, so a link that drops halfway
// through resumes exactly where it stopped instead of losing the batch.
void drainQueue() {
  if (!fsReady) return;

  File f = LittleFS.open(QUEUE_PATH, "r");
  if (!f) return;
  if (f.size() == 0) {
    f.close();
    return;
  }

  int sent = 0;
  bool failed = false;

  while (f.available() && sent < DRAIN_BATCH) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    if (!mqttClient.connected() || !mqttClient.publish(MQTT_TOPIC, line.c_str())) {
      failed = true;
      break;
    }

    sent++;
  }

  if (sent == 0) {
    f.close();
    return;
  }

  // Copy whatever is left to a temp file and swap. LittleFS cannot truncate
  // from the front.
  File tmp = LittleFS.open("/queue.tmp", "w");
  if (!tmp) {
    f.close();
    return;
  }

  while (f.available()) {
    tmp.write(f.read());
  }

  f.close();
  tmp.close();

  LittleFS.remove(QUEUE_PATH);
  LittleFS.rename("/queue.tmp", QUEUE_PATH);

  Serial.printf("Replayed %d buffered point(s)%s. Remaining: %u\n",
                sent, failed ? " (link dropped mid-batch)" : "",
                (unsigned)queueCount());
}

// trimOldest drops the first n lines of the queue.
void trimOldest(size_t n) {
  File f = LittleFS.open(QUEUE_PATH, "r");
  if (!f) return;

  File tmp = LittleFS.open("/queue.tmp", "w");
  if (!tmp) {
    f.close();
    return;
  }

  size_t skipped = 0;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (skipped < n) {
      skipped++;
      continue;
    }
    tmp.println(line);
  }

  f.close();
  tmp.close();

  LittleFS.remove(QUEUE_PATH);
  LittleFS.rename("/queue.tmp", QUEUE_PATH);
}
