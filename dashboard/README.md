# Wattwave

Wattwave is a matte-black smart energy console for ESP32-powered outlets, MQTT live streaming, and Supabase historical storage.

## Architecture

```
ESP32  ──▶  HiveMQ MQTT Broker  ◀──▶  Browser (mqtt.js over WSS)
  │                                         │
  └──▶  Supabase (readings every ~60s)  ◀───┘  (historical charts + fallback)
```

- **Live data**: MQTT over secure WebSocket directly in the browser (~2s updates)
- **Historical data**: Supabase `readings` table (~60s inserts from ESP32)
- **Relay control**: MQTT publish to `home/plug_X/control` with `ON`/`OFF`
- **No backend proxy**: MQTT runs client-side only, safe for Vercel deployment

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in your values
cp .env.example .env.local

# 3. Run dev server
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_MQTT_PROTOCOL` | `wss` (required for HTTPS) |
| `NEXT_PUBLIC_MQTT_HOST` | HiveMQ cluster hostname |
| `NEXT_PUBLIC_MQTT_PORT` | WebSocket port (typically `8884`) |
| `NEXT_PUBLIC_MQTT_PATH` | WebSocket path (typically `/mqtt`) |
| `NEXT_PUBLIC_MQTT_USERNAME` | MQTT username |
| `NEXT_PUBLIC_MQTT_PASSWORD` | MQTT password |

> **Security**: `NEXT_PUBLIC_` variables are exposed to the browser. Use a dedicated MQTT user with minimal permissions for the frontend.

## MQTT Topics

### Subscribe (browser listens)
| Topic | Payload |
|---|---|
| `home/telemetry` | JSON: voltage, per-plug state/current/power, totalPower |
| `home/plug_1/state` | `ON` or `OFF` |
| `home/plug_2/state` | `ON` or `OFF` |
| `home/plug_3/state` | `ON` or `OFF` |
| `home/device/status` | JSON: WiFi, IP, RSSI, uptime, heap, OTA status, etc. |
| `home/device/ota/status` | OTA progress text |

### Publish (browser sends)
| Topic | Payload |
|---|---|
| `home/plug_1/control` | `ON` or `OFF` |
| `home/plug_2/control` | `ON` or `OFF` |
| `home/plug_3/control` | `ON` or `OFF` |
| `home/device/command` | `STATUS`, `DIAGNOSTIC_FULL`, `SAFE_OFF`, `ENABLE_OTA`, `DISABLE_OTA`, `RESTORE_STATES`, `SYNC_STATES`, `RESTART`, `WIFI_RESET` |

## Supabase vs MQTT

| Aspect | MQTT (live) | Supabase (historical) |
|---|---|---|
| Update rate | ~2 seconds | ~60 seconds |
| Data source | Browser ← MQTT broker | Browser ← Supabase REST |
| Relay control | Primary (MQTT publish) | Fallback/saved state |
| Chart data | In-memory buffer (5 min) | `readings` table |
| Storage | None (browser memory) | Persistent |

## OTA Update

1. Send `ENABLE_OTA` command from the dashboard
2. Navigate to `http://<device-ip>/update` 
3. Credentials: `admin` / `admin`
4. Upload **only** the `.ino.bin` file (not SPIFFS or bootloader)
5. Send `DISABLE_OTA` when done

## Testing with HiveMQ Web Client

1. Go to [HiveMQ WebSocket Client](http://www.hivemq.com/demos/websocket-client/)
2. Enter your cluster URL, port 8884, and credentials
3. Connect and subscribe to `home/#` to see all messages
4. Publish to `home/plug_1/control` with payload `ON` to test relay control

## Deploy on Vercel

1. Push to GitHub
2. Import in Vercel
3. Add all `NEXT_PUBLIC_*` env variables in Vercel dashboard
4. Deploy – no server functions needed for MQTT

## Manual Test Plan

1. Start ESP32 → connects to WiFi and MQTT
2. Open Wattwave → shows "Connected" + "Live" status
3. Telemetry updates every ~2 seconds on live chart
4. Toggle Plug 1 ON → UI shows "PENDING…" → confirmed after ack
5. Supabase `devices.relay_state` updates when ESP32 PATCHes
6. Historical chart updates after ~60s DB interval
7. Press "Request Status" → device info panel populates
8. Press "Full Diagnostics" → expanded status received
9. Press "Enable OTA" → OTA info panel shows update URL
10. Press "Safe OFF" → all relays turn off
11. Press "Restart" → device restarts and restores states from Supabase
12. WiFi Reset requires typing `WIFI_RESET` to confirm

## Tech Stack

ESP32 · ACS712 · ZMPT101B · MQTT (HiveMQ) · Supabase · Next.js · Recharts · Vercel
