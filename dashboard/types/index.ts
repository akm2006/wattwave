/* ═══════════════════════════════════════════════════════════════
   IoT Energy Monitor – Type Definitions
   ═══════════════════════════════════════════════════════════════ */

// ── Plug IDs ──────────────────────────────────────────────────
export type PlugId = "plug_1" | "plug_2" | "plug_3";
export const PLUG_IDS: readonly PlugId[] = ["plug_1", "plug_2", "plug_3"] as const;

export const PLUG_LABELS: Record<PlugId, string> = {
  plug_1: "Plug 1",
  plug_2: "Plug 2",
  plug_3: "Plug 3",
};

// ── Supabase Models ───────────────────────────────────────────
export interface Device {
  id: string; // "plug_1" | "plug_2" | "plug_3"
  relay_state: boolean;
  updated_at: string;
}

export interface Reading {
  id: string;
  device_id: string;
  voltage: number;
  current: number;
  power: number;
  created_at: string;
}

export interface PlugData {
  device: Device;
  reading: Reading | null;
}

// ── MQTT Telemetry ────────────────────────────────────────────
export interface PlugTelemetry {
  state: "ON" | "OFF";
  current: number;
  power: number;
}

export interface TelemetryPayload {
  version: string;
  voltage: number;
  plug_1: PlugTelemetry;
  plug_2: PlugTelemetry;
  plug_3: PlugTelemetry;
  totalPower: number;
}

// ── MQTT Device Status ────────────────────────────────────────
// Fields marked optional are only present in DIAGNOSTIC_FULL responses.
export interface DeviceStatusPayload {
  version?: string;
  ssid?: string;
  ip?: string;
  rssi?: number;
  mqttConnected?: boolean;
  uptimeMs?: number;
  freeHeap?: number;
  resetReason?: string;
  otaEnabled?: boolean;
  relay1?: boolean;
  relay2?: boolean;
  relay3?: boolean;
  lastSupabaseCode?: number;
  lastVoltage?: number;
  // Only present in full diagnostic response
  liveIntervalMs?: number;
  dbIntervalMs?: number;
  powerNoiseThreshold?: number;
  telemetry?: TelemetryPayload;
}

// ── MQTT Connection ───────────────────────────────────────────
export type MqttConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

// ── Plug Control State ────────────────────────────────────────
export type PlugControlState = "idle" | "pending" | "confirmed" | "timeout";

export interface PlugControlInfo {
  state: PlugControlState;
  targetState: "ON" | "OFF" | null;
  timestamp: number;
}

// ── Commands ──────────────────────────────────────────────────
export type DeviceCommand =
  | "STATUS"
  | "DIAGNOSTIC_FULL"
  | "SAFE_OFF"
  | "ENABLE_OTA"
  | "DISABLE_OTA"
  | "RESTORE_STATES"
  | "SYNC_STATES"
  | "RESTART"
  | "WIFI_RESET"
  | `SET_DB_INTERVAL:${number}`
  | `SET_LIVE_INTERVAL:${number}`
  | `SET_POWER_THRESHOLD:${number}`;

// ── Telemetry buffer point (for live chart) ───────────────────
export interface TelemetryPoint {
  timestamp: number;
  voltage: number;
  totalPower: number;
  plug_1_power: number;
  plug_2_power: number;
  plug_3_power: number;
  plug_1_current: number;
  plug_2_current: number;
  plug_3_current: number;
}

// ── History time window ───────────────────────────────────────
export type HistoryWindow = "15m" | "1h" | "24h";

// ── Safe parsing helpers ──────────────────────────────────────

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function isPlugTelemetry(val: unknown): val is PlugTelemetry {
  if (!isObject(val)) return false;
  return (
    (val.state === "ON" || val.state === "OFF") &&
    typeof val.current === "number" &&
    typeof val.power === "number"
  );
}

export function isTelemetryPayload(val: unknown): val is TelemetryPayload {
  if (!isObject(val)) return false;
  return (
    typeof val.voltage === "number" &&
    typeof val.totalPower === "number" &&
    isPlugTelemetry(val.plug_1) &&
    isPlugTelemetry(val.plug_2) &&
    isPlugTelemetry(val.plug_3)
  );
}

export function isDeviceStatusPayload(val: unknown): val is DeviceStatusPayload {
  if (!isObject(val)) return false;
  return (
    typeof val.ssid === "string" &&
    typeof val.ip === "string" &&
    typeof val.rssi === "number" &&
    typeof val.uptimeMs === "number" &&
    typeof val.freeHeap === "number"
  );
}

export function normalizePlugState(val: unknown): "ON" | "OFF" {
  if (typeof val === "string") {
    const upper = val.trim().toUpperCase();
    if (upper === "ON") return "ON";
  }
  return "OFF";
}

export function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
