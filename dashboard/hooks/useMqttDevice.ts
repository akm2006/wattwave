"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { MqttClient } from "mqtt";
import type {
  TelemetryPayload,
  DeviceStatusPayload,
  TelemetryPoint,
  PlugId,
  PlugControlInfo,
  MqttConnectionState,
  DeviceCommand,
} from "@/types";
import {
  isTelemetryPayload,
  normalizePlugState,
  safeParseJSON,
  PLUG_IDS,
} from "@/types";

// ── Config ────────────────────────────────────────────────────
// Removed NEXT_PUBLIC_ defaults. Config is now passed via hook parameters.

const TELEMETRY_BUFFER_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const OFFLINE_THRESHOLD_MS = 15_000; // 15 seconds
const CONTROL_ACK_TIMEOUT_MS = 8_000; // 8 seconds

// ── Topics ────────────────────────────────────────────────────
const TOPICS = {
  telemetry: "home/telemetry",
  status: "home/device/status",
  otaStatus: "home/device/ota/status",
  plugState: (id: PlugId) => `home/${id}/state`,
  plugControl: (id: PlugId) => `home/${id}/control`,
  command: "home/device/command",
} as const;

const SUBSCRIBE_TOPICS = [
  TOPICS.telemetry,
  TOPICS.status,
  TOPICS.otaStatus,
  ...PLUG_IDS.map((id) => TOPICS.plugState(id)),
];

// ── Return type ───────────────────────────────────────────────
export interface MqttDeviceState {
  connectionState: MqttConnectionState;
  telemetry: TelemetryPayload | null;
  deviceStatus: DeviceStatusPayload | null;
  plugStates: Record<PlugId, "ON" | "OFF">;
  plugControls: Record<PlugId, PlugControlInfo>;
  telemetryBuffer: TelemetryPoint[];
  lastTelemetryAt: number | null;
  lastStatusAt: number | null;
  deviceOnline: boolean;
  otaStatus: string | null;
  /** True when the most recent status payload failed to parse (truncated / invalid). */
  statusParseError: string | null;
  publishControl: (plugId: PlugId, state: "ON" | "OFF") => void;
  sendCommand: (command: DeviceCommand) => void;
  mqttConfigured: boolean;
}

// Default plug control state
function defaultPlugControl(): PlugControlInfo {
  return { state: "idle", targetState: null, timestamp: 0 };
}

function defaultPlugControls(): Record<PlugId, PlugControlInfo> {
  return {
    plug_1: defaultPlugControl(),
    plug_2: defaultPlugControl(),
    plug_3: defaultPlugControl(),
  };
}

function defaultPlugStates(): Record<PlugId, "ON" | "OFF"> {
  return { plug_1: "OFF", plug_2: "OFF", plug_3: "OFF" };
}

// ── Hook ──────────────────────────────────────────────────────
export function useMqttDevice(config?: {
  protocol: string;
  host: string;
  port: string;
  path: string;
  username?: string;
  password?: string;
}): MqttDeviceState {
  const [connectionState, setConnectionState] = useState<MqttConnectionState>("disconnected");
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusPayload | null>(null);
  const [plugStates, setPlugStates] = useState<Record<PlugId, "ON" | "OFF">>(defaultPlugStates);
  const [plugControls, setPlugControls] = useState<Record<PlugId, PlugControlInfo>>(defaultPlugControls);
  const [telemetryBuffer, setTelemetryBuffer] = useState<TelemetryPoint[]>([]);
  const [lastTelemetryAt, setLastTelemetryAt] = useState<number | null>(null);
  const [lastStatusAt, setLastStatusAt] = useState<number | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [otaStatus, setOtaStatus] = useState<string | null>(null);
  const [statusParseError, setStatusParseError] = useState<string | null>(null);

  const clientRef = useRef<MqttClient | null>(null);
  const controlTimersRef = useRef<Record<PlugId, ReturnType<typeof setTimeout> | null>>({
    plug_1: null,
    plug_2: null,
    plug_3: null,
  });

  const mqttConfigured = Boolean(config?.host && config?.username && config?.password);

  // Online check interval
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const lastActivity = Math.max(lastTelemetryAt ?? 0, lastStatusAt ?? 0);
      setDeviceOnline(lastActivity > 0 && now - lastActivity < OFFLINE_THRESHOLD_MS);
    }, 2000);
    return () => clearInterval(interval);
  }, [lastTelemetryAt, lastStatusAt]);

  // Handle plug state ack for pending controls
  const handlePlugStateAck = useCallback((plugId: PlugId, newState: "ON" | "OFF") => {
    setPlugStates((prev) => ({ ...prev, [plugId]: newState }));
    setPlugControls((prev) => {
      const ctrl = prev[plugId];
      if (ctrl.state === "pending" && ctrl.targetState === newState) {
        // Clear timeout
        if (controlTimersRef.current[plugId]) {
          clearTimeout(controlTimersRef.current[plugId]!);
          controlTimersRef.current[plugId] = null;
        }
        return { ...prev, [plugId]: { state: "confirmed", targetState: null, timestamp: Date.now() } };
      }
      return prev;
    });
    // Reset confirmed state after 2s
    setTimeout(() => {
      setPlugControls((prev) => {
        if (prev[plugId].state === "confirmed") {
          return { ...prev, [plugId]: defaultPlugControl() };
        }
        return prev;
      });
    }, 2000);
  }, []);

  // ── Message handler ref (stable, never causes reconnect) ────
  // Synced via useEffect to comply with React 19 strict refs rule.
  const handleMessageRef = useRef<(topic: string, payload: Buffer) => void>(() => {});

  const handleMessage = useCallback((topic: string, payload: Buffer) => {
    const raw = payload.toString();

    // ── Telemetry ──
    if (topic === TOPICS.telemetry) {
      const parsed = safeParseJSON(raw);
      if (isTelemetryPayload(parsed)) {
        const now = Date.now();
        setTelemetry(parsed);
        setLastTelemetryAt(now);

        // Update plug states from telemetry
        for (const id of PLUG_IDS) {
          const plugState = parsed[id].state;
          handlePlugStateAck(id, plugState);
        }

        // Add to buffer
        const point: TelemetryPoint = {
          timestamp: now,
          voltage: parsed.voltage,
          totalPower: parsed.totalPower,
          plug_1_power: parsed.plug_1.power,
          plug_2_power: parsed.plug_2.power,
          plug_3_power: parsed.plug_3.power,
          plug_1_current: parsed.plug_1.current,
          plug_2_current: parsed.plug_2.current,
          plug_3_current: parsed.plug_3.current,
        };
        setTelemetryBuffer((prev) => {
          const cutoff = now - TELEMETRY_BUFFER_DURATION_MS;
          const filtered = prev.filter((p) => p.timestamp > cutoff);
          return [...filtered, point];
        });
      }
      return;
    }

    // ── Device Status ──
    if (topic === TOPICS.status) {
      const parsed = safeParseJSON(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        // Valid JSON object — update status and clear any previous error
        setDeviceStatus(parsed as DeviceStatusPayload);
        setLastStatusAt(Date.now());
        setStatusParseError(null);
      } else {
        // Bad payload — keep last valid status, set error flag
        // Don't overwrite deviceStatus with null
        const reason = raw.length === 0
          ? "Empty payload"
          : raw.length < 20
          ? `Non-JSON: "${raw}"`
          : `Invalid JSON (${raw.length} bytes, likely truncated)`;
        console.warn(`[MQTT] Status parse failed on ${topic}: ${reason}`);
        setStatusParseError(reason);
      }
      return;
    }

    // ── OTA Status ──
    if (topic === TOPICS.otaStatus) {
      setOtaStatus(raw);
      return;
    }

    // ── Plug State ──
    for (const id of PLUG_IDS) {
      if (topic === TOPICS.plugState(id)) {
        const state = normalizePlugState(raw);
        handlePlugStateAck(id, state);
        return;
      }
    }
  }, [handlePlugStateAck]);

  // Sync the handler ref after every render (effect = allowed to write refs)
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  });

  // ── MQTT connection (stable — depends only on mqttConfigured) ──
  useEffect(() => {
    if (typeof window === "undefined" || !mqttConfigured) return;

    let cancelled = false;

    async function connectMqtt() {
      const mqttModule = await import("mqtt");
      // Handle ESM/CJS interop: connect may be on default export or module root
      const mqttLib = (mqttModule.default ?? mqttModule) as typeof import("mqtt");
      if (cancelled) return;

      const url = `${config!.protocol}://${config!.host}:${config!.port}${config!.path}`;

      const client = mqttLib.connect(url, {
        username: config!.username,
        password: config!.password,
        clientId: `iot-dashboard-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        reconnectPeriod: 3000,
        connectTimeout: 10_000,
        protocolVersion: 4,
      });

      clientRef.current = client;
      setConnectionState("connecting");

      client.on("connect", () => {
        if (cancelled) return;
        setConnectionState("connected");
        client.subscribe(SUBSCRIBE_TOPICS, { qos: 0 });
      });

      client.on("reconnect", () => {
        if (!cancelled) setConnectionState("reconnecting");
      });

      client.on("close", () => {
        if (!cancelled) setConnectionState("disconnected");
      });

      client.on("error", (err) => {
        console.error("[MQTT] Error:", err.message);
        if (!cancelled) setConnectionState("error");
      });

      // Use the ref so we always call the latest handler
      // without the effect needing to re-run
      client.on("message", (topic, payload) => {
        if (!cancelled) handleMessageRef.current(topic, payload);
      });
    }

    connectMqtt();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [mqttConfigured]); // ← stable dependency, no more reconnect cycles

  // Publish relay control
  const publishControl = useCallback(
    (plugId: PlugId, state: "ON" | "OFF") => {
      const client = clientRef.current;
      if (!client || connectionState !== "connected") return;

      const topic = TOPICS.plugControl(plugId);
      client.publish(topic, state);

      // Set pending state
      setPlugControls((prev) => ({
        ...prev,
        [plugId]: { state: "pending", targetState: state, timestamp: Date.now() },
      }));

      // Clear any existing timeout
      if (controlTimersRef.current[plugId]) {
        clearTimeout(controlTimersRef.current[plugId]!);
      }

      // Set timeout
      controlTimersRef.current[plugId] = setTimeout(() => {
        setPlugControls((prev) => {
          if (prev[plugId].state === "pending") {
            return { ...prev, [plugId]: { state: "timeout", targetState: null, timestamp: Date.now() } };
          }
          return prev;
        });
        // Reset timeout state after 5s
        setTimeout(() => {
          setPlugControls((prev) => {
            if (prev[plugId].state === "timeout") {
              return { ...prev, [plugId]: defaultPlugControl() };
            }
            return prev;
          });
        }, 5000);
      }, CONTROL_ACK_TIMEOUT_MS);
    },
    [connectionState]
  );

  // Send device command
  const sendCommand = useCallback(
    (command: DeviceCommand) => {
      const client = clientRef.current;
      if (!client || connectionState !== "connected") return;
      client.publish(TOPICS.command, command);
    },
    [connectionState]
  );

  return {
    connectionState,
    telemetry,
    deviceStatus,
    plugStates,
    plugControls,
    telemetryBuffer,
    lastTelemetryAt,
    lastStatusAt,
    deviceOnline,
    otaStatus,
    statusParseError,
    publishControl,
    sendCommand,
    mqttConfigured,
  };
}
