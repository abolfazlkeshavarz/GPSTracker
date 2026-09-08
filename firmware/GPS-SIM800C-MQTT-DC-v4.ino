/*
 * ESP32 + SIM800C GPS tracker — revision 4.
 *
 * Adds everything the platform needs to be sold as a security product rather
 * than a breadcrumb logger:
 *
 *   1. REMOTE CONTROL. The device subscribes to devices/<serial>/commands and
 *      acts on signed instructions: cut/restore the engine, lock/unlock the
 *      doors, report now, reboot, change the reporting interval. Every command
 *      is acknowledged on devices/<serial>/ack so the server can say whether
 *      the vehicle actually did it.
 *
 *   2. ANTI-THEFT TELEMETRY. External power sense (a cut battery is reported,
 *      not merely inferred from silence), GSM jamming detection, and an
 *      accelerometer for impact and dangerous-driving events.
 *
 *   3. AN SOS BUTTON.
 *
 * ---------------------------------------------------------------------------
 * SAFETY — read before wiring the immobiliser relay.
 *
 * The engine-cut output must be wired to interrupt the STARTER or the fuel
 * pump ENABLE line, never the ignition coil or the ECU supply of a moving
 * vehicle. This firmware additionally refuses to cut while the vehicle is
 * moving faster than IMMOBILISER_MAX_KMH, and the server refuses to send the
 * command in the same circumstances. Both checks exist because either one
 * alone is a single point of failure between a security feature and a way to
 * kill somebody.
 * ---------------------------------------------------------------------------
 *
 * Requires, in addition to rev 3's libraries:
 *   - Adafruit_MPU6050 + Adafruit_Sensor (accelerometer)
 *   - Wire (bundled)
 */

#define TINY_GSM_MODEM_SIM800

#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <mbedtls/md.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ====================== PIN DEFINITIONS ======================
//
// ESP32-S3-WROOM-1 on carrier RG-CARR-01 (see hardware/README.md).

#define GPS_RX 17          // ESP32 RX  <- NEO-6M TX
#define GPS_TX 18          // ESP32 TX  -> NEO-6M RX

#define SIM_RX 5           // ESP32 RX  <- SIM800C TXD (2.8 V clears S3 VIH)
#define SIM_TX 4           // ESP32 TX  -> SIM800C RXD (through 1k/2.7k divider)

// Ignition sense, via a 100k/22k divider from the 12 V accessory line.
// Must be ADC1 (GPIO1-10): ADC2 is unusable whenever WiFi is active.
#define IGNITION_PIN 1
#define IGNITION_ACTIVE_LOW false

// External power sense: the permanent 12 V feed, through its own divider.
// Reads low when the main lead is cut and the unit falls back to its internal
// cell — which is the whole point of having one.
#define EXT_POWER_PIN 2

// SOS button to ground, with the internal pull-up.
#define SOS_PIN 3

// Outputs. All drive opto-isolated relay modules; none switch a load directly.
#define RELAY_ENGINE_PIN 15   // immobiliser: see the safety note above
#define RELAY_LOCK_PIN   16    // central locking - lock pulse
#define RELAY_UNLOCK_PIN 6     // central locking - unlock pulse

// Relay boards on this carrier are active-low.
#define RELAY_ACTIVE_LOW true

// I2C for the accelerometer.
#define I2C_SDA 8
#define I2C_SCL 9

// ====================== SERIALS ======================
HardwareSerial gpsSerial(1);
HardwareSerial simSerial(2);

// ====================== OBJECTS ======================
TinyGPSPlus gps;
TinyGsm modem(simSerial);
TinyGsmClient gsmClient(modem);
PubSubClient mqttClient(gsmClient);
Adafruit_MPU6050 mpu;

// ====================== MQTT CONFIG ======================
const char* mqtt_server   = "85.9.123.30";
const int   mqtt_port     = 1883;
const char* mqtt_username = "testquitto";
const char* mqtt_password = "admin";

// ====================== DEVICE INFO ======================
const char* DEVICE_NAME   = "DEVICEADMIN";
const char* DEVICE_SECRET = "357951";
const char* MQTT_TOPIC    = "devices/DEVICEADMIN/location";
const char* CMD_TOPIC     = "devices/DEVICEADMIN/commands";
const char* ACK_TOPIC     = "devices/DEVICEADMIN/ack";

// ====================== APN ======================
const char apn[]      = "mcinet";
const char gprsUser[] = "";
const char gprsPass[] = "";

// ====================== TIMING ======================
unsigned long publishIntervalMs = 30000UL;   // mutable: set_interval changes it
const unsigned long RECONNECT_INTERVAL_MS = 10000UL;
const unsigned long NETWORK_RETRY_MS      = 30000UL;
const unsigned long STALE_FIX_MS          = 60000UL;
const unsigned long SENSOR_POLL_MS        = 50UL;

// ====================== SAFETY / THRESHOLDS ======================

// The firmware half of the immobiliser interlock. The server enforces the
// same limit; neither is allowed to be the only check.
const int IMMOBILISER_MAX_KMH = 10;

// Impact is a collision-grade shock. 4g is well above speed bumps and kerbs
// but comfortably below the 15-20g of a serious crash, so it catches the
// low-speed knocks an owner actually wants to hear about.
const float IMPACT_G          = 4.0;
const float HARSH_ACCEL_G     = 0.45;
const float HARSH_BRAKE_G     = 0.45;
const float HARSH_CORNER_G    = 0.50;

// One event per window: a single pothole otherwise produces a burst.
const unsigned long EVENT_COOLDOWN_MS = 20000UL;

// Jamming heuristic. A SIM800 has no dedicated jam-detect line, so this infers
// it: registered to a network a moment ago, now reporting no usable signal at
// all, for several consecutive reads. A genuine tunnel clears within a read or
// two; a jammer does not.
const int JAMMING_CONSECUTIVE_READS = 4;

// ====================== STORE AND FORWARD ======================
const char* QUEUE_PATH = "/queue.jsonl";
const size_t MAX_QUEUED_RECORDS = 2000;
const size_t MAX_QUEUE_BYTES    = 400UL * 1024UL;
const int    DRAIN_BATCH        = 5;

// ====================== STATE ======================
unsigned long lastGpsPublish       = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long lastNetworkAttempt   = 0;
unsigned long lastSensorPoll       = 0;
unsigned long lastEventAt          = 0;

bool   modemReady     = false;
bool   fsReady        = false;
bool   mpuReady       = false;
String cachedOperator = "";

// Engine-cut state survives a reset: a thief must not be able to restore a
// stolen car's engine by pulling the tracker's fuse.
bool engineCut = false;
const char* ENGINE_STATE_PATH = "/engine_cut";

// One-shot event queued by the sensor poll, drained by the next publish.
String pendingEvent = "";
float  pendingEventG = 0;

int  jammingStreak = 0;
bool jammingActive = false;

// A command asking for an immediate report.
bool reportNow = false;

// =====================================================

void setup() {
  Serial.begin(115200);
  delay(3000);

  Serial.println();
  Serial.println("================================");
  Serial.println("ESP32 + SIM800 MQTT GPS Tracker");
  Serial.println("rev 4 - control, anti-theft, SOS");
  Serial.println("================================");

  pinMode(IGNITION_PIN, INPUT);
  pinMode(EXT_POWER_PIN, INPUT);
  pinMode(SOS_PIN, INPUT_PULLUP);

  // Drive the relays to their inactive state BEFORE setting them as outputs,
  // or the pin glitches through active for a few microseconds on boot — long
  // enough for a relay to chatter, and on the engine output that is a stall.
  digitalWrite(RELAY_ENGINE_PIN, relayLevel(false));
  digitalWrite(RELAY_LOCK_PIN,   relayLevel(false));
  digitalWrite(RELAY_UNLOCK_PIN, relayLevel(false));
  pinMode(RELAY_ENGINE_PIN, OUTPUT);
  pinMode(RELAY_LOCK_PIN,   OUTPUT);
  pinMode(RELAY_UNLOCK_PIN, OUTPUT);

  fsReady = LittleFS.begin(true);
  if (fsReady) {
    Serial.printf("LittleFS ready. Queued points: %u\n", (unsigned)queueCount());
    engineCut = LittleFS.exists(ENGINE_STATE_PATH);
    if (engineCut) {
      Serial.println("Engine cut state restored from flash - re-applying");
      applyEngineCut(true);
    }
  } else {
    Serial.println("LittleFS FAILED - running without offline buffering");
  }

  Wire.begin(I2C_SDA, I2C_SCL);
  mpuReady = mpu.begin();
  if (mpuReady) {
    mpu.setAccelerometerRange(MPU6050_RANGE_16_G);  // headroom for a real crash
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);     // rejects engine vibration
    Serial.println("MPU6050 ready");
  } else {
    Serial.println("MPU6050 not found - impact and driving events disabled");
  }

  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  simSerial.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(3000);

  Serial.println("Initializing modem...");
  modem.restart();
  Serial.print("Modem: ");
  Serial.println(modem.getModemInfo());

  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(onMqttMessage);
  // Commands carry a signature and parameters; 512 is not enough headroom.
  mqttClient.setBufferSize(1024);

  bringUpNetwork();
}

// =====================================================

void loop() {

  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  pollSensors();

  if (!modemReady) {
    if (millis() - lastNetworkAttempt > NETWORK_RETRY_MS) {
      lastNetworkAttempt = millis();
      bringUpNetwork();
    }
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
  drainQueue();
  captureIfDue();
}

// captureIfDue builds a point on schedule and either sends or queues it.
void captureIfDue() {
  bool due = (millis() - lastGpsPublish > publishIntervalMs);

  // An event or a "locate now" command must not wait out the interval — the
  // whole value of an impact alert is that it arrives immediately.
  if (!due && pendingEvent.length() == 0 && !reportNow) return;

  lastGpsPublish = millis();
  reportNow = false;

  String payload = buildPayload();
  if (payload.length() == 0) return;

  if (mqttClient.connected() && mqttClient.publish(MQTT_TOPIC, payload.c_str())) {
    Serial.println("Published live");
    pendingEvent = "";
    pendingEventG = 0;
    return;
  }

  Serial.println("Offline - queueing point");
  enqueue(payload);
  pendingEvent = "";
  pendingEventG = 0;
}

// =====================================================
// Sensors
// =====================================================

bool readIgnition() {
  int raw = digitalRead(IGNITION_PIN);
  return IGNITION_ACTIVE_LOW ? (raw == LOW) : (raw == HIGH);
}

bool readExtPower() {
  return digitalRead(EXT_POWER_PIN) == HIGH;
}

// pollSensors watches the accelerometer, the SOS button and the GSM signal.
//
// Runs every loop rather than once per publish: a collision lasts about
// 100 ms, so sampling at the 30-second reporting interval would miss it.
void pollSensors() {
  if (millis() - lastSensorPoll < SENSOR_POLL_MS) return;
  lastSensorPoll = millis();

  // SOS first: it outranks everything else queued.
  if (digitalRead(SOS_PIN) == LOW) {
    queueEvent("sos", 0);
    return;
  }

  if (!mpuReady) return;

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Convert to g and remove the 1g the sensor reads while sitting still.
  float ax = a.acceleration.x / 9.80665;
  float ay = a.acceleration.y / 9.80665;
  float az = a.acceleration.z / 9.80665;

  float magnitude = sqrt(ax * ax + ay * ay + az * az);
  float net = fabs(magnitude - 1.0);

  if (net >= IMPACT_G) {
    queueEvent("impact", net);
    return;
  }

  // Only classify driving events while actually driving; a phone knocking the
  // unit in a parked car is not harsh braking.
  if (!gps.speed.isValid() || gps.speed.kmph() < 5) return;

  // Mounting orientation: X forward, Y lateral. Re-map these if the unit is
  // fitted on a different axis, or every event will be the wrong kind.
  if (ax >= HARSH_ACCEL_G)        queueEvent("harsh_accel", ax);
  else if (ax <= -HARSH_BRAKE_G)  queueEvent("harsh_brake", fabs(ax));
  else if (fabs(ay) >= HARSH_CORNER_G) queueEvent("harsh_corner", fabs(ay));
}

// queueEvent records a one-shot event for the next publish.
//
// An impact always wins: overwriting a queued harsh-braking event with the
// collision that followed it is the correct outcome, and the reverse is not.
void queueEvent(const char* name, float g) {
  bool isImpact = (strcmp(name, "impact") == 0) || (strcmp(name, "sos") == 0);

  if (!isImpact && millis() - lastEventAt < EVENT_COOLDOWN_MS) return;
  if (pendingEvent == "impact" && !isImpact) return;

  pendingEvent = name;
  pendingEventG = g;
  lastEventAt = millis();

  Serial.printf("Event: %s (%.2fg)\n", name, g);
}

// updateJamming infers interference from the signal quality history.
void updateJamming() {
  int csq = modem.getSignalQuality();

  // 99 is "not known or not detectable"; 0 is no signal at all.
  bool noSignal = (csq == 99 || csq == 0);

  if (noSignal) {
    if (jammingStreak < JAMMING_CONSECUTIVE_READS) jammingStreak++;
  } else {
    jammingStreak = 0;
  }

  jammingActive = (jammingStreak >= JAMMING_CONSECUTIVE_READS);
}

// =====================================================
// Network
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

    // QoS 1: a control command must not be dropped silently. Re-subscribed on
    // every reconnect, for the same reason the server re-subscribes.
    if (mqttClient.subscribe(CMD_TOPIC, 1)) {
      Serial.print("Subscribed to ");
      Serial.println(CMD_TOPIC);
    } else {
      Serial.println("Command subscribe FAILED - remote control is unavailable");
    }
    return;
  }

  int state = mqttClient.state();
  Serial.print("MQTT failed. State=");
  Serial.println(state);

  if ((state == -3 || state == -4) && !modem.isGprsConnected()) {
    Serial.println("GPRS is down; will re-register");
    modemReady = false;
  }
}

// =====================================================
// HMAC-SHA256
// =====================================================

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
  for (int i = 0; i < 32; i++) sprintf(hex + (i * 2), "%02x", hmacResult[i]);
  hex[64] = '\0';

  return String(hex);
}

// constantTimeEquals compares two hex digests without leaking through timing.
bool constantTimeEquals(const String& a, const String& b) {
  if (a.length() != b.length()) return false;

  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) diff |= (uint8_t)(a[i] ^ b[i]);

  return diff == 0;
}

// =====================================================
// Commands
// =====================================================

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, CMD_TOPIC) != 0) return;

  StaticJsonDocument<640> doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.println("Command parse error");
    return;
  }

  long   id      = doc["id"] | 0L;
  const char* device  = doc["device"] | "";
  const char* command = doc["command"] | "";
  long   ts      = doc["ts"] | 0L;
  const char* sig = doc["sig"] | "";

  if (strcmp(device, DEVICE_NAME) != 0) {
    Serial.println("Command for a different device - ignored");
    return;
  }

  // Verify before acting. Without this, anyone able to publish to the broker
  // could stop any vehicle on it.
  //
  // Must match SignMessage in internal/integrity/chain.go byte for byte:
  //     device|id|command|ts
  char signable[160];
  snprintf(signable, sizeof(signable), "%s|%ld|%s|%ld", device, id, command, ts);

  String expected = hmacSha256Hex(DEVICE_SECRET, String(signable));
  if (!constantTimeEquals(expected, String(sig))) {
    Serial.println("Command signature INVALID - ignored");
    return;
  }

  Serial.printf("Command %ld: %s\n", id, command);
  handleCommand(id, command, doc);
}

void handleCommand(long id, const char* command, JsonDocument& doc) {

  if (strcmp(command, "engine_cut") == 0) {
    // The firmware half of the interlock. The server refuses to send this
    // above the same threshold; both checks exist so that neither is the only
    // thing standing between a security feature and a moving vehicle.
    if (gps.speed.isValid() && gps.speed.kmph() > IMMOBILISER_MAX_KMH) {
      sendAck(id, "error", "Refused: vehicle is moving");
      Serial.println("Engine cut REFUSED - vehicle is moving");
      return;
    }
    applyEngineCut(true);
    persistEngineCut(true);
    sendAck(id, "ok", "Engine cut");
    return;
  }

  if (strcmp(command, "engine_restore") == 0) {
    applyEngineCut(false);
    persistEngineCut(false);
    sendAck(id, "ok", "Engine restored");
    return;
  }

  if (strcmp(command, "door_lock") == 0) {
    pulseRelay(RELAY_LOCK_PIN, 400);
    sendAck(id, "ok", "Doors locked");
    return;
  }

  if (strcmp(command, "door_unlock") == 0) {
    pulseRelay(RELAY_UNLOCK_PIN, 400);
    sendAck(id, "ok", "Doors unlocked");
    return;
  }

  if (strcmp(command, "locate") == 0) {
    reportNow = true;
    sendAck(id, "ok", "Reporting now");
    return;
  }

  if (strcmp(command, "set_interval") == 0) {
    long seconds = doc["params"]["interval_s"] | 0L;
    if (seconds < 10 || seconds > 3600) {
      sendAck(id, "error", "interval out of range");
      return;
    }
    publishIntervalMs = (unsigned long)seconds * 1000UL;
    sendAck(id, "ok", "Interval updated");
    return;
  }

  if (strcmp(command, "reboot") == 0) {
    // Acknowledge BEFORE restarting: after ESP.restart() there is no chance to.
    sendAck(id, "ok", "Rebooting");
    delay(500);
    ESP.restart();
    return;
  }

  sendAck(id, "error", "Unknown command");
}

// sendAck confirms what the device actually did, signed the same way.
void sendAck(long id, const char* status, const char* result) {
  if (!mqttClient.connected()) return;

  long ts = (long)(gps.date.isValid() && gps.date.year() >= 2020 ? utcFromGps() : 0);

  StaticJsonDocument<320> doc;
  doc["device"] = DEVICE_NAME;
  doc["id"]     = id;
  doc["status"] = status;
  doc["result"] = result;
  doc["ts"]     = ts;

  char signable[160];
  snprintf(signable, sizeof(signable), "%s|%ld|%s|%ld", DEVICE_NAME, id, status, ts);
  doc["sig"] = hmacSha256Hex(DEVICE_SECRET, String(signable));

  String out;
  serializeJson(doc, out);

  mqttClient.publish(ACK_TOPIC, out.c_str());
  Serial.printf("Ack %ld: %s (%s)\n", id, status, result);
}

// =====================================================
// Outputs
// =====================================================

int relayLevel(bool active) {
  if (RELAY_ACTIVE_LOW) return active ? LOW : HIGH;
  return active ? HIGH : LOW;
}

void applyEngineCut(bool cut) {
  digitalWrite(RELAY_ENGINE_PIN, relayLevel(cut));
  engineCut = cut;
  Serial.printf("Engine relay: %s\n", cut ? "CUT" : "RESTORED");
}

// persistEngineCut keeps the immobiliser engaged across a power cycle, so
// pulling the tracker's fuse does not release a stolen vehicle.
void persistEngineCut(bool cut) {
  if (!fsReady) return;

  if (cut) {
    File f = LittleFS.open(ENGINE_STATE_PATH, "w");
    if (f) { f.print("1"); f.close(); }
  } else {
    LittleFS.remove(ENGINE_STATE_PATH);
  }
}

// pulseRelay drives a momentary output, as central locking actuators expect.
void pulseRelay(int pin, int ms) {
  digitalWrite(pin, relayLevel(true));
  delay(ms);
  digitalWrite(pin, relayLevel(false));
}

// =====================================================
// Payload
// =====================================================

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

String buildPayload() {

  bool haveClock = gps.date.isValid() && gps.time.isValid() && gps.date.year() >= 2020;

  updateJamming();

  StaticJsonDocument<640> doc;

  doc["device"] = DEVICE_NAME;
  doc["csq"]    = modem.getSignalQuality();

  #ifdef TINY_GSM_MODEM_SIM800
    doc["battery"] = modem.getBattVoltage() / 1000.0;
  #endif

  doc["ignition"]  = readIgnition();
  doc["ext_power"] = readExtPower();
  doc["jamming"]   = jammingActive;

  if (pendingEvent.length() > 0) {
    doc["event"] = pendingEvent;
    if (pendingEventG > 0) doc["accel_g"] = pendingEventG;
  }

  if (cachedOperator.length() > 0) {
    doc["operator"] = cachedOperator;
  }

  if (!gps.location.isValid() || !haveClock) {
    // Heartbeat: proves the device is alive with no sky view. Not queued — an
    // un-timestamped heartbeat replayed hours later means nothing.
    if (!mqttClient.connected()) return "";

    doc["no_fix"] = true;

    String out;
    serializeJson(doc, out);
    return out;
  }

  uint32_t ts = utcFromGps();

  // Round to 6 dp BEFORE both signing and serialising, so the server re-signs
  // exactly what was transmitted.
  double la = round(gps.location.lat()  * 1000000.0) / 1000000.0;
  double ln = round(gps.location.lng() * 1000000.0) / 1000000.0;

  doc["lat"] = la;
  doc["lng"] = ln;
  doc["speed"] = (int)gps.speed.kmph();
  doc["sat"]   = gps.satellites.value();
  doc["timestamp"] = ts;

  if (gps.course.isValid() && gps.speed.kmph() > 3.0) {
    doc["heading"] = gps.course.deg();
  }
  if (gps.altitude.isValid()) doc["altitude"] = gps.altitude.meters();
  if (gps.hdop.isValid())     doc["hdop"] = gps.hdop.hdop();

  unsigned long fixAge = gps.location.age();
  doc["fix_age_ms"] = (uint32_t)fixAge;
  if (fixAge > STALE_FIX_MS) doc["stale"] = true;

  // Must match SignPayload in internal/integrity/chain.go exactly:
  //     device|timestamp|lat|lng   with 6 decimal places on the coordinates.
  char signable[96];
  snprintf(signable, sizeof(signable), "%s|%lu|%.6f|%.6f",
           DEVICE_NAME, (unsigned long)ts, la, ln);

  doc["sig"] = hmacSha256Hex(DEVICE_SECRET, String(signable));

  String out;
  serializeJson(doc, out);
  return out;
}

// =====================================================
// Queue (unchanged from rev 3)
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

void enqueue(const String& payload) {
  if (!fsReady) return;

  File check = LittleFS.open(QUEUE_PATH, "r");
  size_t size = check ? check.size() : 0;
  if (check) check.close();

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

void drainQueue() {
  if (!fsReady) return;

  File f = LittleFS.open(QUEUE_PATH, "r");
  if (!f) return;
  if (f.size() == 0) { f.close(); return; }

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

  if (sent == 0) { f.close(); return; }

  File tmp = LittleFS.open("/queue.tmp", "w");
  if (!tmp) { f.close(); return; }

  while (f.available()) tmp.write(f.read());

  f.close();
  tmp.close();

  LittleFS.remove(QUEUE_PATH);
  LittleFS.rename("/queue.tmp", QUEUE_PATH);

  Serial.printf("Replayed %d buffered point(s)%s. Remaining: %u\n",
                sent, failed ? " (link dropped mid-batch)" : "",
                (unsigned)queueCount());
}

void trimOldest(size_t n) {
  File f = LittleFS.open(QUEUE_PATH, "r");
  if (!f) return;

  File tmp = LittleFS.open("/queue.tmp", "w");
  if (!tmp) { f.close(); return; }

  size_t skipped = 0;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (skipped < n) { skipped++; continue; }
    tmp.println(line);
  }

  f.close();
  tmp.close();

  LittleFS.remove(QUEUE_PATH);
  LittleFS.rename("/queue.tmp", QUEUE_PATH);
}
