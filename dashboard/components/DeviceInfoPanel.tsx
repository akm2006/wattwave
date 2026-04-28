"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { DeviceStatusPayload, MqttConnectionState } from "@/types";
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  RadioTower,
  Router,
  Server,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DeviceInfoPanelProps {
  connectionState: MqttConnectionState;
  deviceOnline: boolean;
  deviceStatus: DeviceStatusPayload | null;
  lastTelemetryAt: number | null;
  lastStatusAt: number | null;
  firmwareVersion: string | null;
  statusParseError?: string | null;
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function rssiLabel(rssi: number): { text: string; cls: string; width: string } {
  if (rssi > -50) return { text: "Excellent", cls: "text-[var(--clr-green-400)]", width: "95%" };
  if (rssi > -60) return { text: "Good", cls: "text-[var(--clr-green-400)]", width: "76%" };
  if (rssi > -70) return { text: "Fair", cls: "text-[var(--clr-amber)]", width: "54%" };
  return { text: "Weak", cls: "text-[var(--clr-red-500)]", width: "30%" };
}

export default function DeviceInfoPanel({
  connectionState,
  deviceOnline,
  deviceStatus,
  lastTelemetryAt,
  lastStatusAt,
  firmwareVersion,
  statusParseError,
}: DeviceInfoPanelProps) {
  const rssi = deviceStatus?.rssi != null ? rssiLabel(deviceStatus.rssi) : null;
  const dbOk = deviceStatus?.lastSupabaseCode != null && deviceStatus.lastSupabaseCode >= 200 && deviceStatus.lastSupabaseCode < 300;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.16 }}
      className="neu-raised rounded-[1.45rem] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="neu-control flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--clr-amber)]">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Device Health</h2>
            <p className="text-xs text-[var(--clr-text-dim)]">Network and ESP32 status</p>
          </div>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
            deviceOnline
              ? "neu-control text-[var(--clr-green-400)]"
              : "neu-control text-[var(--clr-text-dim)]"
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", deviceOnline ? "soft-led bg-[var(--clr-green-500)]" : "bg-[var(--clr-text-dim)]")} />
          {deviceOnline ? "Online" : "Offline"}
        </span>
      </div>

      {statusParseError && (
        <div className="neu-pressed mt-4 flex items-start gap-2 rounded-2xl p-3 text-xs text-[var(--clr-amber)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Status payload parse issue: {statusParseError}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <HealthTile icon={<RadioTower />} label="MQTT" value={connectionState} tone={connectionState === "connected" ? "good" : "muted"} />
        <HealthTile icon={<Database />} label="DB Sync" value={deviceStatus?.lastSupabaseCode?.toString() ?? "--"} tone={dbOk ? "good" : "warn"} />
        <HealthTile icon={<Router />} label="IP" value={deviceStatus?.ip ?? "--"} />
        <HealthTile icon={<Clock />} label="Uptime" value={deviceStatus?.uptimeMs != null ? formatUptime(deviceStatus.uptimeMs) : "--"} />
        <HealthTile icon={<Cpu />} label="Heap" value={deviceStatus?.freeHeap != null ? `${(deviceStatus.freeHeap / 1024).toFixed(1)} KB` : "--"} />
        <HealthTile icon={<Activity />} label="OTA" value={deviceStatus?.otaEnabled ? "Enabled" : "Disabled"} tone={deviceStatus?.otaEnabled ? "warn" : "muted"} />
      </div>

      <div className="neu-pressed mt-4 rounded-2xl p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Wifi className="h-4 w-4 text-[var(--clr-amber)]" />
            WiFi RSSI
          </div>
          <span className={cn("metric-font text-xs font-semibold", rssi?.cls ?? "text-[var(--clr-text-dim)]")}>
            {deviceStatus?.rssi != null ? `${deviceStatus.rssi} dBm` : "--"}
            {rssi ? ` (${rssi.text})` : ""}
          </span>
        </div>
        <div className="neu-pressed mt-3 h-2 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--clr-amber),var(--clr-green-500))]"
            style={{ width: rssi?.width ?? "0%" }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-2 border-t border-white/[0.05] pt-4 sm:grid-cols-2">
        <MetaRow icon={<HardDrive />} label="Firmware" value={firmwareVersion ?? "--"} />
        <MetaRow icon={<CheckCircle2 />} label="SSID" value={deviceStatus?.ssid ?? "--"} />
        <MetaRow icon={<Activity />} label="Telemetry" value={formatTimestamp(lastTelemetryAt)} />
        <MetaRow icon={<Clock />} label="Status" value={formatTimestamp(lastStatusAt)} />
      </div>
    </motion.section>
  );
}

function HealthTile({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "good" | "warn" | "muted";
}) {
  const toneClass =
    tone === "good" ? "text-[var(--clr-green-400)]" : tone === "warn" ? "text-[var(--clr-amber)]" : "text-[var(--clr-text-muted)]";
  return (
    <div className="neu-pressed rounded-2xl p-3">
      <div className="mb-2 text-[var(--clr-text-dim)] [&>svg]:h-4 [&>svg]:w-4">{icon}</div>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--clr-text-dim)]">{label}</p>
      <p className={cn("metric-font mt-1 truncate text-sm font-semibold capitalize", toneClass)}>{value}</p>
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-[var(--clr-text-dim)] [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}<span>{label}</span></div>
      <span className="metric-font max-w-[58%] break-words text-right text-[var(--clr-text-muted)]">{value}</span>
    </div>
  );
}
