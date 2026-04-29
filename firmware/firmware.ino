#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoMqttClient.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <Update.h>
#include <math.h>
#include <esp_system.h>
#include "config.h"

#define VERSION "v1.0"

// ---------------- PINS ----------------
#define RELAY1 26
#define RELAY2 27
#define RELAY3 14

#define CURRENT1 34
#define CURRENT2 35
#define CURRENT3 32
#define VOLT_PIN 33

// ---------------- WIFI ----------------
const bool force_wifi_portal = FORCE_WIFI_PORTAL;
const char wifi_portal_name[] = WIFI_PORTAL_NAME;
const char wifi_portal_pass[] = WIFI_PORTAL_PASS;

// ---------------- RELAY ----------------
const int RELAY_ON = LOW;
const int RELAY_OFF = HIGH;

// ---------------- SENSOR CONFIG ----------------
float currentSensitivity = 0.185;   // ACS712-5A
float voltageCalibration = 0.73;
float currentNoiseThreshold = 0.06;
float powerNoiseThreshold = 8.0;

// ---------------- INTERVALS ----------------
unsigned long MQTT_TELEMETRY_INTERVAL_MS = 2000;
unsigned long SUPABASE_SEND_INTERVAL_MS = 60000;
unsigned long STATUS_INTERVAL_MS = 15000;
const unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;
const unsigned long OTA_WINDOW_MS = 5UL * 60UL * 1000UL;

// ---------------- MQTT ----------------
WiFiClientSecure mqttNet;
MqttClient mqttClient(mqttNet);

const char TOPIC_PLUG1_CONTROL[] = "home/plug_1/control";
const char TOPIC_PLUG2_CONTROL[] = "home/plug_2/control";
const char TOPIC_PLUG3_CONTROL[] = "home/plug_3/control";

const char TOPIC_PLUG1_STATE[] = "home/plug_1/state";
const char TOPIC_PLUG2_STATE[] = "home/plug_2/state";
const char TOPIC_PLUG3_STATE[] = "home/plug_3/state";

const char TOPIC_TELEMETRY[] = "home/telemetry";
const char TOPIC_COMMAND[] = "home/device/command";
const char TOPIC_STATUS[] = "home/device/status";
const char TOPIC_OTA_STATUS[] = "home/device/ota/status";

String mqttClientId = "";

// ---------------- SUPABASE ----------------
WiFiClientSecure supabaseNet;

const String SUPABASE_READINGS_URL = String(SUPABASE_BASE_URL) + "readings";

// ---------------- OTA WEB SERVER ----------------
WebServer server(80);

bool otaEnabled = false;
unsigned long otaEnabledAt = 0;

// ---------------- STATES ----------------
bool r1 = false;
bool r2 = false;
bool r3 = false;

float lastVoltage = 0;
float lastC1 = 0;
float lastC2 = 0;
float lastC3 = 0;
float lastP1 = 0;
float lastP2 = 0;
float lastP3 = 0;

int lastSupabaseCode = 0;

unsigned long lastMqttTelemetryTime = 0;
unsigned long lastSupabaseSendTime = 0;
unsigned long lastStatusTime = 0;
unsigned long lastMqttReconnectAttempt = 0;

// =====================================================
// RESET REASON
// =====================================================
String resetReasonToString(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    default: return "UNKNOWN";
  }
}

// =====================================================
// MQTT PUBLISH HELPERS
// =====================================================
void publishText(const char* topic, const String& message, bool retained = false) {
  if (!mqttClient.connected()) return;
  if (message.length() > 1024) {
    Serial.print("[WARN] Large MQTT payload (");
    Serial.print(message.length());
    Serial.print(" bytes) on topic: ");
    Serial.println(topic);
  }
  mqttClient.beginMessage(topic, message.length(), retained);
  mqttClient.print(message);
  mqttClient.endMessage();
}

void publishState(const char* topic, bool state) {
  publishText(topic, state ? "ON" : "OFF", true);
}

// =====================================================
// SUPABASE PATCH DEVICE STATE
// =====================================================
bool updateDeviceStateInSupabase(const String& deviceId, bool state) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  supabaseNet.setInsecure();

  String url = String(SUPABASE_BASE_URL) + "devices?id=eq." + deviceId;

  if (!http.begin(supabaseNet, url)) {
    Serial.println("Supabase device PATCH begin failed.");
    return false;
  }

  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_API_KEY));
  http.addHeader("Prefer", "return=minimal");

  String json = "{";
  json += "\"relay_state\":";
  json += state ? "true" : "false";
  json += "}";

  int code = http.PATCH(json);
  lastSupabaseCode = code;

  if (code < 200 || code >= 300) {
    Serial.print("Supabase device PATCH failed for ");
    Serial.print(deviceId);
    Serial.print(" code=");
    Serial.println(code);
    Serial.println(http.getString());
    http.end();
    return false;
  }

  Serial.print("Supabase state updated: ");
  Serial.print(deviceId);
  Serial.print(" = ");
  Serial.println(state ? "ON" : "OFF");

  http.end();
  return true;
}

// =====================================================
// RELAY HELPERS
// =====================================================
void applyRelayState(int relayPin, bool state) {
  digitalWrite(relayPin, state ? RELAY_ON : RELAY_OFF);
}

void setPlugState(int plugNumber, bool state, bool publishAck = true, bool syncSupabase = true) {
  if (plugNumber == 1) {
    r1 = state;
    applyRelayState(RELAY1, r1);
    Serial.print("Plug 1 -> ");
    Serial.println(r1 ? "ON" : "OFF");
    if (publishAck) publishState(TOPIC_PLUG1_STATE, r1);
    if (syncSupabase) updateDeviceStateInSupabase("plug_1", r1);
  }

  if (plugNumber == 2) {
    r2 = state;
    applyRelayState(RELAY2, r2);
    Serial.print("Plug 2 -> ");
    Serial.println(r2 ? "ON" : "OFF");
    if (publishAck) publishState(TOPIC_PLUG2_STATE, r2);
    if (syncSupabase) updateDeviceStateInSupabase("plug_2", r2);
  }

  if (plugNumber == 3) {
    r3 = state;
    applyRelayState(RELAY3, r3);
    Serial.print("Plug 3 -> ");
    Serial.println(r3 ? "ON" : "OFF");
    if (publishAck) publishState(TOPIC_PLUG3_STATE, r3);
    if (syncSupabase) updateDeviceStateInSupabase("plug_3", r3);
  }
}

void safeOff(bool syncSupabase = true) {
  setPlugState(1, false, true, syncSupabase);
  setPlugState(2, false, true, syncSupabase);
  setPlugState(3, false, true, syncSupabase);
}

// =====================================================
// SUPABASE RESTORE STATES ON BOOT
// =====================================================
bool parseRelayStateFromJson(const String& json, const String& deviceId, bool& outState) {
  int idIndex = json.indexOf("\"id\":\"" + deviceId + "\"");
  if (idIndex < 0) return false;

  int stateIndex = json.indexOf("\"relay_state\":", idIndex);
  if (stateIndex < 0) return false;

  int valueStart = stateIndex + String("\"relay_state\":").length();
  String value = json.substring(valueStart, valueStart + 5);
  value.trim();

  outState = value.startsWith("true");
  return true;
}

bool restoreStatesFromSupabase() {
  if (WiFi.status() != WL_CONNECTED) return false;

  Serial.println("Restoring relay states from Supabase...");

  HTTPClient http;
  supabaseNet.setInsecure();

  String url = String(SUPABASE_BASE_URL) + "devices?select=id,relay_state";

  if (!http.begin(supabaseNet, url)) {
    Serial.println("Supabase restore begin failed.");
    return false;
  }

  http.setTimeout(8000);
  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_API_KEY));

  int code = http.GET();
  lastSupabaseCode = code;

  if (code < 200 || code >= 300) {
    Serial.print("Supabase restore failed code=");
    Serial.println(code);
    Serial.println(http.getString());
    http.end();
    return false;
  }

  String json = http.getString();
  http.end();

  bool s1, s2, s3;
  bool ok1 = parseRelayStateFromJson(json, "plug_1", s1);
  bool ok2 = parseRelayStateFromJson(json, "plug_2", s2);
  bool ok3 = parseRelayStateFromJson(json, "plug_3", s3);

  if (ok1) setPlugState(1, s1, true, false);
  if (ok2) setPlugState(2, s2, true, false);
  if (ok3) setPlugState(3, s3, true, false);

  Serial.println("Restore complete.");
  return ok1 || ok2 || ok3;
}

void syncCurrentStatesToSupabase() {
  updateDeviceStateInSupabase("plug_1", r1);
  updateDeviceStateInSupabase("plug_2", r2);
  updateDeviceStateInSupabase("plug_3", r3);
}

// =====================================================
// WIFI
// =====================================================
void setupWiFi() {
  Serial.println();
  Serial.println("=== WiFi setup ===");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  WiFiManager wm;
  wm.setConnectTimeout(15);
  wm.setConfigPortalTimeout(180);

  bool connected = false;

  if (FORCE_WIFI_PORTAL) {
    Serial.println("FORCE_WIFI_PORTAL = true");
    wm.resetSettings();
    connected = wm.startConfigPortal(WIFI_PORTAL_NAME, WIFI_PORTAL_PASS);
  } else {
    Serial.println("Trying saved WiFi first. Portal opens only if saved WiFi fails.");
    connected = wm.autoConnect(WIFI_PORTAL_NAME, WIFI_PORTAL_PASS);
  }

  if (!connected) {
    Serial.println("WiFi failed. Restarting...");
    delay(2000);
    ESP.restart();
  }

  Serial.println("WiFi connected!");
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================================
// OTA WEB UPDATE
// =====================================================
void publishOtaStatus(const String& status) {
  publishText(TOPIC_OTA_STATUS, status, true);
}

void handleRoot() {
  String msg = "PowerIOT ESP32\n";
  msg += "Version: " + String(VERSION) + "\n";
  msg += "IP: " + WiFi.localIP().toString() + "\n";
  msg += "OTA enabled: " + String(otaEnabled ? "YES" : "NO") + "\n";
  server.send(200, "text/plain", msg);
}

void handleUpdatePage() {
  if (!otaEnabled) {
    server.send(403, "text/plain", "OTA is disabled. Send MQTT command ENABLE_OTA first.");
    return;
  }

  if (!server.authenticate(OTA_USER, OTA_PASS)) {
    return server.requestAuthentication();
  }

  String html =
    "<!DOCTYPE html><html><head><title>PowerIOT OTA</title></head><body>"
    "<h2>PowerIOT OTA Update</h2>"
    "<p>Upload only the .ino.bin firmware file.</p>"
    "<form method='POST' action='/update' enctype='multipart/form-data'>"
    "<input type='file' name='update'>"
    "<input type='submit' value='Update'>"
    "</form>"
    "</body></html>";

  server.send(200, "text/html", html);
}

void handleUpdateFinished() {
  if (!otaEnabled) {
    server.send(403, "text/plain", "OTA disabled.");
    return;
  }

  if (!server.authenticate(OTA_USER, OTA_PASS)) {
    return server.requestAuthentication();
  }

  if (Update.hasError()) {
    publishOtaStatus("OTA_FAILED");
    server.send(500, "text/plain", "OTA failed.");
  } else {
    publishOtaStatus("OTA_SUCCESS_RESTARTING");
    server.send(200, "text/plain", "OTA success. Restarting...");
    delay(1000);
    ESP.restart();
  }
}

void handleUpdateUpload() {
  if (!otaEnabled) return;

  HTTPUpload& upload = server.upload();

  if (upload.status == UPLOAD_FILE_START) {
    Serial.print("OTA upload start: ");
    Serial.println(upload.filename);
    publishOtaStatus("OTA_STARTED");

    safeOff(true);

    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
      Update.printError(Serial);
    }
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      Update.printError(Serial);
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    if (Update.end(true)) {
      Serial.print("OTA upload complete. Size: ");
      Serial.println(upload.totalSize);
    } else {
      Update.printError(Serial);
    }
  }
}

void setupOtaServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/update", HTTP_GET, handleUpdatePage);
  server.on("/update", HTTP_POST, handleUpdateFinished, handleUpdateUpload);
  server.begin();
  Serial.println("Local web server started.");
}

void enableOtaWindow() {
  safeOff(true);
  otaEnabled = true;
  otaEnabledAt = millis();

  String msg = "OTA_ENABLED at http://" + WiFi.localIP().toString() + "/update user=" + String(OTA_USER);
  Serial.println(msg);
  publishOtaStatus(msg);
}

void disableOtaWindow() {
  otaEnabled = false;
  publishOtaStatus("OTA_DISABLED");
  Serial.println("OTA disabled.");
}

void maintainOtaServer() {
  if (otaEnabled) {
    server.handleClient();

    if (millis() - otaEnabledAt > OTA_WINDOW_MS) {
      disableOtaWindow();
    }
  }
}

// =====================================================
// SENSORS
// =====================================================
float readCurrent(int pin) {
  const int samples = 600;

  float baseline = 0;
  for (int i = 0; i < samples; i++) {
    baseline += analogRead(pin);
    delayMicroseconds(200);
  }
  baseline /= samples;

  float sumSq = 0;
  for (int i = 0; i < samples; i++) {
    float raw = analogRead(pin) - baseline;
    float sensorVoltage = raw * (3.3 / 4095.0);
    float current = sensorVoltage / currentSensitivity;
    sumSq += current * current;
    delayMicroseconds(200);
  }

  float rms = sqrt(sumSq / samples);
  if (rms < currentNoiseThreshold) return 0.0;
  return rms;
}

float getFinalCurrent(int pin, bool relayState) {
  if (!relayState) return 0.0;
  float current = readCurrent(pin);
  if (current < currentNoiseThreshold) return 0.0;
  return current;
}

float readVoltage() {
  const int samples = 800;

  float sum = 0;
  int valid = 0;

  for (int i = 0; i < samples; i++) {
    int raw = analogRead(VOLT_PIN);
    if (raw > 10 && raw < 4090) {
      sum += raw;
      valid++;
    }
    delayMicroseconds(200);
  }

  if (valid < 100) return 0.0;

  float offset = sum / valid;
  float sumSq = 0;
  valid = 0;

  for (int i = 0; i < samples; i++) {
    int raw = analogRead(VOLT_PIN);
    if (raw > 10 && raw < 4090) {
      float centeredRaw = raw - offset;
      float centeredVoltage = centeredRaw * (3.3 / 4095.0);
      sumSq += centeredVoltage * centeredVoltage;
      valid++;
    }
    delayMicroseconds(200);
  }

  if (valid < 100) return 0.0;

  float sensorRms = sqrt(sumSq / valid);
  float mainsVoltage = sensorRms * (230.0 / 0.5) * voltageCalibration;

  if (mainsVoltage < 100 || mainsVoltage > 300) return 0.0;
  return mainsVoltage;
}

void readAllSensors() {
  float voltage = readVoltage();
  if (voltage <= 0) voltage = 230.0;

  float c1 = getFinalCurrent(CURRENT1, r1);
  float c2 = getFinalCurrent(CURRENT2, r2);
  float c3 = getFinalCurrent(CURRENT3, r3);

  float p1 = voltage * c1;
  float p2 = voltage * c2;
  float p3 = voltage * c3;

  if (p1 < powerNoiseThreshold) { c1 = 0; p1 = 0; }
  if (p2 < powerNoiseThreshold) { c2 = 0; p2 = 0; }
  if (p3 < powerNoiseThreshold) { c3 = 0; p3 = 0; }

  lastVoltage = voltage;
  lastC1 = c1;
  lastC2 = c2;
  lastC3 = c3;
  lastP1 = p1;
  lastP2 = p2;
  lastP3 = p3;

  Serial.print("V=");
  Serial.print(lastVoltage, 2);
  Serial.print(" P1=");
  Serial.print(lastP1, 2);
  Serial.print(" P2=");
  Serial.print(lastP2, 2);
  Serial.print(" P3=");
  Serial.println(lastP3, 2);
}

// =====================================================
// SUPABASE READINGS INSERT
// =====================================================
bool sendReadingToSupabase(const String& deviceId, float voltage, float current, float power) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  supabaseNet.setInsecure();

  if (!http.begin(supabaseNet, SUPABASE_READINGS_URL)) return false;

  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_API_KEY));
  http.addHeader("Prefer", "return=minimal");

  String json = "{";
  json += "\"device_id\":\"" + deviceId + "\",";
  json += "\"voltage\":" + String(voltage, 2) + ",";
  json += "\"current\":" + String(current, 3) + ",";
  json += "\"power\":" + String(power, 2);
  json += "}";

  int code = http.POST(json);
  lastSupabaseCode = code;

  if (code < 200 || code >= 300) {
    Serial.print("Reading POST failed ");
    Serial.print(deviceId);
    Serial.print(" code=");
    Serial.println(code);
    Serial.println(http.getString());
    http.end();
    return false;
  }

  http.end();
  return true;
}

void sendReadingsToSupabase() {
  sendReadingToSupabase("plug_1", lastVoltage, lastC1, lastP1);
  sendReadingToSupabase("plug_2", lastVoltage, lastC2, lastP2);
  sendReadingToSupabase("plug_3", lastVoltage, lastC3, lastP3);
  Serial.println("Supabase history readings inserted.");
}

// =====================================================
// MQTT TELEMETRY + STATUS
// =====================================================
String telemetryJson() {
  float totalPower = lastP1 + lastP2 + lastP3;

  String json = "{";
  json += "\"version\":\"" + String(VERSION) + "\",";
  json += "\"voltage\":" + String(lastVoltage, 2) + ",";
  json += "\"plug_1\":{\"state\":\"" + String(r1 ? "ON" : "OFF") + "\",\"current\":" + String(lastC1, 3) + ",\"power\":" + String(lastP1, 2) + "},";
  json += "\"plug_2\":{\"state\":\"" + String(r2 ? "ON" : "OFF") + "\",\"current\":" + String(lastC2, 3) + ",\"power\":" + String(lastP2, 2) + "},";
  json += "\"plug_3\":{\"state\":\"" + String(r3 ? "ON" : "OFF") + "\",\"current\":" + String(lastC3, 3) + ",\"power\":" + String(lastP3, 2) + "},";
  json += "\"totalPower\":" + String(totalPower, 2);
  json += "}";
  return json;
}

void publishTelemetry() {
  publishText(TOPIC_TELEMETRY, telemetryJson(), false);
}

void publishStatus(bool full = false) {
  String json = "{";
  json += "\"version\":\"" + String(VERSION) + "\",";
  json += "\"ssid\":\"" + WiFi.SSID() + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"mqttConnected\":" + String(mqttClient.connected() ? "true" : "false") + ",";
  json += "\"uptimeMs\":" + String(millis()) + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"resetReason\":\"" + resetReasonToString(esp_reset_reason()) + "\",";
  json += "\"otaEnabled\":" + String(otaEnabled ? "true" : "false") + ",";
  json += "\"relay1\":" + String(r1 ? "true" : "false") + ",";
  json += "\"relay2\":" + String(r2 ? "true" : "false") + ",";
  json += "\"relay3\":" + String(r3 ? "true" : "false") + ",";
  json += "\"lastSupabaseCode\":" + String(lastSupabaseCode) + ",";
  json += "\"lastVoltage\":" + String(lastVoltage, 2);

  if (full) {
    json += ",\"liveIntervalMs\":" + String(MQTT_TELEMETRY_INTERVAL_MS);
    json += ",\"dbIntervalMs\":" + String(SUPABASE_SEND_INTERVAL_MS);
    json += ",\"powerNoiseThreshold\":" + String(powerNoiseThreshold, 2);
    json += ",\"telemetry\":" + telemetryJson();
  }

  json += "}";

  publishText(TOPIC_STATUS, json, true);
  Serial.println(json);
}

// =====================================================
// MQTT
// =====================================================
void handleDeviceCommand(String payload) {
  payload.trim();

  String upper = payload;
  upper.toUpperCase();

  if (upper == "STATUS" || upper == "PING") {
    publishStatus(false);
    return;
  }

  if (upper == "DIAGNOSTIC_FULL") {
    publishStatus(true);
    return;
  }

  if (upper == "ENABLE_OTA") {
    enableOtaWindow();
    return;
  }

  if (upper == "DISABLE_OTA") {
    disableOtaWindow();
    return;
  }

  if (upper == "SAFE_OFF") {
    safeOff(true);
    publishStatus(false);
    return;
  }

  if (upper == "RESTORE_STATES") {
    restoreStatesFromSupabase();
    publishStatus(false);
    return;
  }

  if (upper == "SYNC_STATES") {
    syncCurrentStatesToSupabase();
    publishStatus(false);
    return;
  }

  if (upper == "RESTART") {
    publishText(TOPIC_STATUS, "RESTARTING", true);
    safeOff(true);
    delay(1000);
    ESP.restart();
  }

  if (upper == "WIFI_RESET") {
    publishText(TOPIC_STATUS, "WIFI_RESET_RESTARTING", true);
    WiFiManager wm;
    wm.resetSettings();
    delay(1000);
    ESP.restart();
  }

  if (upper.startsWith("SET_DB_INTERVAL:")) {
    SUPABASE_SEND_INTERVAL_MS = upper.substring(String("SET_DB_INTERVAL:").length()).toInt();
    publishStatus(true);
    return;
  }

  if (upper.startsWith("SET_LIVE_INTERVAL:")) {
    MQTT_TELEMETRY_INTERVAL_MS = upper.substring(String("SET_LIVE_INTERVAL:").length()).toInt();
    publishStatus(true);
    return;
  }

  if (upper.startsWith("SET_POWER_THRESHOLD:")) {
    powerNoiseThreshold = upper.substring(String("SET_POWER_THRESHOLD:").length()).toFloat();
    publishStatus(true);
    return;
  }

  publishText(TOPIC_STATUS, "UNKNOWN_COMMAND:" + payload, false);
}

void onMqttMessage(int messageSize) {
  String topic = mqttClient.messageTopic();
  String payload = "";

  while (mqttClient.available()) {
    payload += (char)mqttClient.read();
  }

  payload.trim();

  Serial.print("MQTT received: ");
  Serial.print(topic);
  Serial.print(" => ");
  Serial.println(payload);

  String upper = payload;
  upper.toUpperCase();

  if (topic == TOPIC_COMMAND) {
    handleDeviceCommand(payload);
    return;
  }

  bool turnOn;

  if (upper == "ON" || upper == "1" || upper == "TRUE") {
    turnOn = true;
  } else if (upper == "OFF" || upper == "0" || upper == "FALSE") {
    turnOn = false;
  } else {
    publishText(TOPIC_STATUS, "INVALID_CONTROL_PAYLOAD:" + payload, false);
    return;
  }

  if (topic == TOPIC_PLUG1_CONTROL) setPlugState(1, turnOn);
  else if (topic == TOPIC_PLUG2_CONTROL) setPlugState(2, turnOn);
  else if (topic == TOPIC_PLUG3_CONTROL) setPlugState(3, turnOn);
}

bool connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return false;

  Serial.print("Connecting MQTT to ");
  Serial.println(MQTT_BROKER);

  mqttNet.setInsecure();

  mqttClientId = "smart-extension-" + WiFi.macAddress();
  mqttClientId.replace(":", "");

  mqttClient.setId(mqttClientId.c_str());
  mqttClient.setUsernamePassword(MQTT_USERNAME, MQTT_PASSWORD);
  mqttClient.onMessage(onMqttMessage);

  if (!mqttClient.connect(MQTT_BROKER, MQTT_PORT)) {
    Serial.print("MQTT failed code=");
    Serial.println(mqttClient.connectError());
    return false;
  }

  mqttClient.subscribe(TOPIC_PLUG1_CONTROL);
  mqttClient.subscribe(TOPIC_PLUG2_CONTROL);
  mqttClient.subscribe(TOPIC_PLUG3_CONTROL);
  mqttClient.subscribe(TOPIC_COMMAND);

  publishState(TOPIC_PLUG1_STATE, r1);
  publishState(TOPIC_PLUG2_STATE, r2);
  publishState(TOPIC_PLUG3_STATE, r3);
  publishStatus(true);

  Serial.println("MQTT connected and subscribed.");
  return true;
}

void maintainMQTT() {
  if (mqttClient.connected()) {
    mqttClient.poll();
    return;
  }

  if (millis() - lastMqttReconnectAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
    lastMqttReconnectAttempt = millis();
    connectMQTT();
  }
}

// =====================================================
// SETUP / LOOP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println(VERSION);

  analogReadResolution(12);
  analogSetPinAttenuation(CURRENT1, ADC_11db);
  analogSetPinAttenuation(CURRENT2, ADC_11db);
  analogSetPinAttenuation(CURRENT3, ADC_11db);
  analogSetPinAttenuation(VOLT_PIN, ADC_11db);

  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);
  pinMode(RELAY3, OUTPUT);

  digitalWrite(RELAY1, RELAY_OFF);
  digitalWrite(RELAY2, RELAY_OFF);
  digitalWrite(RELAY3, RELAY_OFF);

  setupWiFi();
  setupOtaServer();
  connectMQTT();

  restoreStatesFromSupabase();

  readAllSensors();
  publishTelemetry();
  publishStatus(true);

  lastMqttTelemetryTime = millis();
  lastSupabaseSendTime = millis();
  lastStatusTime = millis();
}

void loop() {
  maintainMQTT();
  maintainOtaServer();

  unsigned long now = millis();

  if (now - lastMqttTelemetryTime >= MQTT_TELEMETRY_INTERVAL_MS) {
    lastMqttTelemetryTime = now;
    readAllSensors();
    publishTelemetry();
  }

  if (now - lastSupabaseSendTime >= SUPABASE_SEND_INTERVAL_MS) {
    lastSupabaseSendTime = now;
    sendReadingsToSupabase();
  }

  if (now - lastStatusTime >= STATUS_INTERVAL_MS) {
    lastStatusTime = now;
    publishStatus(false);
  }
}