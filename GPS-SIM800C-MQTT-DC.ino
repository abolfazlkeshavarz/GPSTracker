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
const char* DEVICE_NAME = "DEVICEADMIN";
const char* DEVICE_SECRET = "357951";

const char* MQTT_TOPIC = "devices/DEVICEADMIN/location";

// ====================== APN ======================
const char apn[]      = "mcinet";
const char gprsUser[] = "";
const char gprsPass[] = "";

// ====================== VARIABLES ======================
unsigned long lastGpsPublish = 0;
unsigned long lastReconnectAttempt = 0;

// =====================================================

void setup() {
  Serial.begin(115200);
  delay(3000);

  Serial.println();
  Serial.println("================================");
  Serial.println("ESP32 + SIM800 MQTT GPS Tracker");
  Serial.println("================================");

  // GPS
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  // SIM800
  simSerial.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);

  delay(3000);

  Serial.println("Initializing modem...");

  modem.restart();

  String modemInfo = modem.getModemInfo();

  Serial.print("Modem: ");
  Serial.println(modemInfo);

  // SIM check
  Serial.print("Waiting for network");

  if (!modem.waitForNetwork(60000L)) {
    Serial.println(" FAILED");
    Serial.println("No network");
    return;
  }

  Serial.println(" OK");

  // Signal quality
  Serial.print("Signal: ");
  Serial.println(modem.getSignalQuality());

  // GPRS connect
  Serial.print("Connecting to APN: ");
  Serial.println(apn);

  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("GPRS FAILED");
    return;
  }

  Serial.println("GPRS connected");

  Serial.print("IP: ");
  Serial.println(modem.localIP());

  // MQTT
  mqttClient.setServer(mqtt_server, mqtt_port);

  // Increase buffer size
  mqttClient.setBufferSize(512);

  connectMQTT();
}

// =====================================================

void loop() {

  // GPS parsing
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  // Reconnect MQTT
  if (!mqttClient.connected()) {

    unsigned long now = millis();

    if (now - lastReconnectAttempt > 10000) {
      lastReconnectAttempt = now;

      connectMQTT();
    }

  } else {

    mqttClient.loop();

    // Publish GPS every 30 sec
    if (millis() - lastGpsPublish > 30000) {

      publishGPS();

      lastGpsPublish = millis();
    }
  }
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

  } else {

    Serial.print("MQTT failed. State=");
    Serial.println(mqttClient.state());

    /*
      STATES:
      -4 MQTT_CONNECTION_TIMEOUT
      -3 MQTT_CONNECTION_LOST
      -2 MQTT_CONNECT_FAILED
      -1 MQTT_DISCONNECTED
       0 MQTT_CONNECTED
       1 MQTT_CONNECT_BAD_PROTOCOL
       2 MQTT_CONNECT_BAD_CLIENT_ID
       3 MQTT_CONNECT_UNAVAILABLE
       4 MQTT_CONNECT_BAD_CREDENTIALS
       5 MQTT_CONNECT_UNAUTHORIZED
    */
  }
}

// =====================================================

void publishGPS() {

  if (!gps.location.isValid()) {
    Serial.println("No GPS fix");
    return;
  }

  if (!mqttClient.connected()) {
    Serial.println("MQTT disconnected");
    return;
  }

  // GSM signal quality (0-31)
  int csq = modem.getSignalQuality();

  // Battery voltage
  float battery = 0.0;

  #ifdef TINY_GSM_MODEM_SIM800
    battery = modem.getBattVoltage() / 1000.0; // mV -> V
  #endif

  // Ignition input
  bool ignition = true;

  StaticJsonDocument<384> doc;

  doc["device"] = DEVICE_NAME;
  doc["secret"] = DEVICE_SECRET;

  doc["lat"] = gps.location.lat();
  doc["lng"] = gps.location.lng();

  doc["speed"] = (int)gps.speed.kmph();
  doc["sat"] = gps.satellites.value();

  doc["csq"] = csq;
  doc["battery"] = battery;
  doc["ignition"] = ignition;

  // Unix timestamp from GPS if available
  if (gps.date.isValid() && gps.time.isValid()) {

    struct tm t;

    t.tm_year = gps.date.year() - 1900;
    t.tm_mon  = gps.date.month() - 1;
    t.tm_mday = gps.date.day();

    t.tm_hour = gps.time.hour();
    t.tm_min  = gps.time.minute();
    t.tm_sec  = gps.time.second();

    doc["timestamp"] = mktime(&t);

  } else {

    doc["timestamp"] = millis() / 1000;
  }

  char payload[384];

  serializeJson(doc, payload, sizeof(payload));

  Serial.println("Publishing GPS...");

  bool ok = mqttClient.publish(
    MQTT_TOPIC,
    payload
  );

  if (ok) {
    Serial.println("Publish OK");
    Serial.println(payload);
  } else {
    Serial.println("Publish FAILED");
  }
}