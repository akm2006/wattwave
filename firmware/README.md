# 🧠 WattWave Firmware: High-Precision ESP32 Energy Logic

This directory contains the core intelligence of the WattWave ecosystem. The firmware is a robust, event-driven C++ application designed for high-precision power monitoring, secure remote control, and seamless cloud synchronization.

> [!CAUTION]
> **ELECTRICAL HAZARD**: This firmware is designed for use with ACS712 and ZMPT101B sensors. Improper wiring to AC mains can result in equipment damage, fire, or fatal injury. Always use an isolation transformer for testing and ensure all mains connections are properly insulated.

---

## ✨ Key Features

### 1. Advanced Energy Analytics
- **True RMS Calculation**: Implements a high-frequency sampling buffer (600-800 samples per cycle) to calculate True RMS voltage and current, ensuring accuracy even with non-sinusoidal loads.
- **Dual-Path Telemetry**:
    - **Real-Time (MQTT)**: Broadcasts full energy metrics every 2 seconds for live dashboard visualization.
    - **Historical (Supabase)**: Performs direct HTTP POST operations every 60 seconds (configurable) for persistent trend logging.
- **Zero-Crossing Independent**: Uses peak-to-peak and offset-based math to remain accurate across varying grid frequencies.

### 2. Intelligent Connectivity
- **Zero-Config WiFi**: Powered by `WiFiManager`. If the device cannot connect to saved networks, it automatically opens a Captive Portal named `WattWave-Setup` for mobile configuration.
- **Auto-Healing MQTT**: Background task monitors broker connectivity and performs exponential backoff reconnections without blocking sensor reads.
- **Supabase State Sync**: On boot, the device fetches its last known relay states from the Supabase `devices` table, ensuring continuity after power interruptions.

### 3. Remote Management & OTA
- **Secure Web OTA**: Enables Over-The-Air updates via a password-protected web portal (`/update`). The portal is disabled by default and must be explicitly enabled via an MQTT command for security.
- **MQTT Command Interface**: Supports a wide range of remote operations:
    - `SAFE_OFF`: Instantly kills all relays.
    - `DIAGNOSTIC_FULL`: Returns detailed system health (Heap, RSSI, Uptime, Reset Reason).
    - `SET_LIVE_INTERVAL`: Adjusts real-time reporting speed.
    - `RESTART` / `WIFI_RESET`: Remote maintenance commands.

---

## 🛠️ Hardware Specification

### Pin Mapping (Default)
| Component | ESP32 Pin | Type |
|---|---|---|
| **Relay 1** | GPIO 26 | Output |
| **Relay 2** | GPIO 27 | Output |
| **Relay 3** | GPIO 14 | Output |
| **Current 1 (ACS712)** | GPIO 34 | ADC (Analog) |
| **Current 2 (ACS712)** | GPIO 35 | ADC (Analog) |
| **Current 3 (ACS712)** | GPIO 32 | ADC (Analog) |
| **Voltage (ZMPT101B)** | GPIO 33 | ADC (Analog) |

### Calibration Parameters
Adjust these in `wattwave.ino` to match your specific sensor tolerances:
- `currentSensitivity`: mV per Amp (Default: 0.185 for 5A ACS712).
- `voltageCalibration`: Multiplier to match your multimeter reference.
- `powerNoiseThreshold`: Minimum wattage to report (filters out low-level sensor noise).

---

## ⚙️ Configuration

WattWave uses a modular configuration system to keep your credentials separate from the logic.

1. **Setup**: Copy `config.h.example` to `config.h`.
2. **WiFi**: Set `FORCE_WIFI_PORTAL` to `true` only if you need to bypass saved credentials.
3. **MQTT**: Provide your broker URL (HiveMQ/EMQX), Port (8883 for TLS), and Credentials.
4. **Supabase**: Provide your Project URL and Anon Key.

---

## 📦 Dependencies

The following libraries are required (install via Library Manager):
- **PubSubClient**: MQTT communication.
- **ArduinoJson**: Payload parsing.
- **WiFiManager**: Smart WiFi provisioning.
- **WebServer / Update**: Local OTA functionality.

---

## 🛡️ Fail-Safe & Noise Filtering
- **Noise Cancellation**: The ACS712 sensor is sensitive to magnetic interference. This firmware implements two layers of software filtering:
    - **Current Gate**: Values below `currentNoiseThreshold` are zeroed out (see `wattwave.ino:479`).
    - **Power Gate**: Calculated power below `powerNoiseThreshold` (8.0W default) is suppressed to prevent "phantom consumption" on the dashboard (see `wattwave.ino:543-545`).
- **OTA Safe-Mode**: Relays are automatically turned OFF when a firmware update begins.
- **Reset Diagnostics**: Transmits reset reasons (Brownout, WDT, etc.) to help debug power supply issues.

---

## 📈 Scaling & Future-Proofing
While this version is optimized for a 3-relay setup with ACS712 sensors, it is built for expansion:
- **Upgrading Sensors**: To use high-precision modules like the **PZEM-004T**, simply replace the `readVoltage()` and `readCurrent()` logic with the PZEM library calls.
- **Adding Relays**: If you need 8+ channels, integrate an **MCP23017 I2C expander**. You would only need to update the `setPlugState()` function to address the I2C registers instead of direct GPIOs.
