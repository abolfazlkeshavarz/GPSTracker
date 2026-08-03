/*
 * ESP32 + SIM800C GPS tracker — revision 2.
 *
 * Kept as a separate file rather than overwriting the working sketch, so the
 * changes can be reviewed and diffed before anything is flashed.
 *
 * ── BUGS FIXED ────────────────────────────────────────────────────────────
 *
 * 1. setup() used `return` when the network or GPRS failed. That skipped
 *    mqttClient.setServer(), so loop() then called connectMQTT() forever
 *    against an unconfigured server — the device was bricked until someone
 *    power-cycled it. Boot failures now retry inside loop() instead.
 *
 * 2. `bool ignition = true;` was hardcoded, so the ignition field was always
 *    true and carried no information. Now read from a real input pin.
 *
 * 3. The timestamp fallback `millis()/1000` produced seconds-since-boot (a
 *    number like 45), which decodes to 1970-01-01. Now the field is omitted
 *    entirely when GPS time is unavailable, so the server can tell.
 *
 * 4. publishGPS() returned early with no GPS fix, so a device parked in a
 *    basement went completely silent and looked offline even though it was
 *    connected. It now sends a heartbeat with no coordinates.
 *
 * 5. mktime() interprets struct tm as LOCAL time, but GPS supplies UTC.
 *    Replaced with an explicit days-from-civil conversion.
 *
 * ── NEW TELEMETRY ─────────────────────────────────────────────────────────
 *
 *   heading     course over ground, degrees. Lets the map orient the vehicle
 *               icon and draw direction along a history trail.
 *   hdop        horizontal dilution of precision — a real accuracy estimate.
 *               Satellite count alone does not tell you how good a fix is.
 *   altitude    metres above sea level.
 *   operator    GSM network name. The backend already had a field for this
 *               and never received it.
 *   fix_age_ms  how stale the fix was when published. Without it, a device
 *               that lost GPS lock keeps republishing its last position with
 *               a fresh timestamp, and the map shows the vehicle parked
 *               somewhere it left long ago.
 *
 * ── STILL NOT IMPLEMENTED ─────────────────────────────────────────────────
 *
 *   Offline buffering. Points are still dropped when MQTT is unreachable
 *   (tunnels, dead zones), leaving holes in the history. Fixing it properly
 *   means a RAM or SPIFFS ring buffer that drains on reconnect — a larger
 *   change, deliberately left out of this revision.
 */

#define TINY_GSM_MODEM_SIM800

#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// ====================== PIN DEFINITIONS ======================
#define GPS_RX 14
#define GPS_TX 15

#define SIM_RX 13
#define SIM_TX 12

// Ignition sense input. Wire through a divider so the pin never sees more
// than 3.3 V from the 12 V accessory line.
#define IGNITION_PIN 34
// Set to true if the input is pulled low when the ignition is ON.
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

const char* MQTT_TOPIC = "devices/DEVICEADMIN/location";

// ====================== APN ======================
const char apn[]      = "mcinet";
const char gprsUser[] = "";
const char gprsPass[] = "";

// ====================== TIMING ======================
const unsigned long PUBLISH_INTERVAL_MS   = 30000UL;
const unsigned long RECONNECT_INTERVAL_MS = 10000UL;
const unsigned long NETWORK_RETRY_MS      = 30000UL;

// A fix older than this is reported but flagged, so the server can tell a
// live position from a remembered one.
const unsigned long STALE_FIX_MS = 60000UL;

// ====================== STATE ======================
unsigned long lastGpsPublish      = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long lastNetworkAttempt   = 0;

bool modemReady = false;   // network registered and GPRS up
String cachedOperator = "";

// =====================================================

void setup() {
  Serial.begin(115200);
  delay(3000);

  Serial.println();
  Serial.println("================================");
  Serial.println("ESP32 + SIM800 MQTT GPS Tracker");
  Serial.println("rev 2");
  Serial.println("================================");

  pinMode(IGNITION_PIN, INPUT);

  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  simSerial.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);

  delay(3000);

  Serial.println("Initializing modem...");
  modem.restart();
  Serial.print("Modem: ");
  Serial.println(modem.getModemInfo());

  // Configure MQTT unconditionally. Previously this was only reached when
  // the network came up on the first try; if it did not, the client was
  // never given a server address and could never connect.
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setBufferSize(512);

  // A failure here is not fatal — loop() keeps retrying.
  bringUpNetwork();
}

// =====================================================

void loop() {

  // Feed the GPS parser continuously.
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  // Bring the modem back if the network dropped.
  if (!modemReady) {
    if (millis() - lastNetworkAttempt > NETWORK_RETRY_MS) {
      lastNetworkAttempt = millis();
      bringUpNetwork();
    }
    return;
  }

  if (!mqttClient.connected()) {
    if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = millis();
      connectMQTT();
    }
    return;
  }

  mqttClient.loop();

  if (millis() - lastGpsPublish > PUBLISH_INTERVAL_MS) {
    publishGPS();
    lastGpsPublish = millis();
  }
}

// =====================================================

// bringUpNetwork registers on the network and opens the GPRS context.
// Returns false on failure; the caller retries later rather than giving up.
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

  // Cache the operator name; querying it on every publish is slow and the
  // value rarely changes.
  cachedOperator = modem.getOperator();
  Serial.print("Operator: ");
  Serial.println(cachedOperator);

  modemReady = true;
  return true;
}

// =====================================================

void connectMQTT() {

  Serial.println();
  Serial.println("Connecting to MQTT...");

  String clientId = "ESP32SIM800-";
  clientId += String(random(0xffff), HEX);

  bool status = mqttClient.connect(
    clientId.c_str(),
    mqtt_username,
    mqtt_password
  );

  if (status) {
    Serial.println("MQTT connected");
    return;
  }

  Serial.print("MQTT failed. State=");
  Serial.println(mqttClient.state());

  // -3 (connection lost) and -4 (timeout) usually mean the GPRS context
  // dropped underneath us; force a re-registration rather than hammering
  // MQTT against a dead bearer.
  int state = mqttClient.state();
  if (state == -3 || state == -4) {
    if (!modem.isGprsConnected()) {
      Serial.println("GPRS is down; will re-register");
      modemReady = false;
    }
  }
}

// =====================================================

bool readIgnition() {
  int raw = digitalRead(IGNITION_PIN);
  return IGNITION_ACTIVE_LOW ? (raw == LOW) : (raw == HIGH);
}

// utcFromGps converts the GPS date/time to a real Unix timestamp.
//
// mktime() was wrong here: it interprets struct tm as local time, while GPS
// always supplies UTC. This uses the standard days-from-civil algorithm so
// the result does not depend on the device's timezone setting.
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

// =====================================================

void publishGPS() {

  if (!mqttClient.connected()) {
    Serial.println("MQTT disconnected");
    return;
  }

  StaticJsonDocument<512> doc;

  doc["device"] = DEVICE_NAME;
  doc["secret"] = DEVICE_SECRET;

  // GSM signal quality (0-31, or 99 = unknown)
  doc["csq"] = modem.getSignalQuality();

  #ifdef TINY_GSM_MODEM_SIM800
    doc["battery"] = modem.getBattVoltage() / 1000.0;  // mV -> V
  #endif

  doc["ignition"] = readIgnition();

  if (cachedOperator.length() > 0) {
    doc["operator"] = cachedOperator;
  }

  if (!gps.location.isValid()) {
    // Heartbeat with no position. Previously this case published nothing at
    // all, so a device with no sky view was indistinguishable from one that
    // had lost power.
    doc["no_fix"] = true;

    char payload[512];
    serializeJson(doc, payload, sizeof(payload));

    Serial.println("No GPS fix — sending heartbeat");
    mqttClient.publish(MQTT_TOPIC, payload);
    return;
  }

  unsigned long fixAge = gps.location.age();

  doc["lat"] = gps.location.lat();
  doc["lng"] = gps.location.lng();

  doc["speed"] = (int)gps.speed.kmph();
  doc["sat"]   = gps.satellites.value();

  // Course over ground. Only meaningful while actually moving: a stationary
  // receiver produces a random heading from noise.
  if (gps.course.isValid() && gps.speed.kmph() > 3.0) {
    doc["heading"] = gps.course.deg();
  }

  if (gps.altitude.isValid()) {
    doc["altitude"] = gps.altitude.meters();
  }

  // Lower is better: <2 excellent, 2-5 good, 5-10 moderate, >10 poor.
  if (gps.hdop.isValid()) {
    doc["hdop"] = gps.hdop.hdop();
  }

  doc["fix_age_ms"] = (uint32_t)fixAge;

  if (fixAge > STALE_FIX_MS) {
    doc["stale"] = true;
  }

  // Only send a timestamp we can actually trust. The old millis()/1000
  // fallback produced a 1970 date that looked like real data.
  if (gps.date.isValid() && gps.time.isValid() && gps.date.year() >= 2020) {
    doc["timestamp"] = utcFromGps();
  }

  char payload[512];
  serializeJson(doc, payload, sizeof(payload));

  Serial.println("Publishing GPS...");

  if (mqttClient.publish(MQTT_TOPIC, payload)) {
    Serial.println("Publish OK");
    Serial.println(payload);
  } else {
    Serial.println("Publish FAILED");
  }
}
