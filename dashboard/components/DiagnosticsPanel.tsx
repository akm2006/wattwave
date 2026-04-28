"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DeviceCommand, DeviceStatusPayload } from "@/types";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Gauge,
  PowerOff,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticsPanelProps {
  onCommand: (cmd: DeviceCommand) => void;
  mqttConnected: boolean;
  deviceStatus: DeviceStatusPayload | null;
  otaStatus: string | null;
}

interface CommandButton {
  label: string;
  description: string;
  command: DeviceCommand;
  icon: ReactNode;
  variant: "default" | "warning" | "danger" | "success";
  confirm?: boolean;
  confirmText?: string;
}

const SAFE_COMMANDS: CommandButton[] = [
  { label: "Request Status", description: "Refresh standard ESP32 health payload.", command: "STATUS", icon: <Activity />, variant: "default" },
  { label: "Full Diagnostics", description: "Ask for intervals, thresholds, and nested telemetry.", command: "DIAGNOSTIC_FULL", icon: <Gauge />, variant: "default" },
  { label: "Sync States", description: "Write current relay state back to Supabase.", command: "SYNC_STATES", icon: <RefreshCw />, variant: "default" },
  { label: "Restore States", description: "Read saved relay state from Supabase.", command: "RESTORE_STATES", icon: <RotateCcw />, variant: "default" },
];

const RISK_COMMANDS: CommandButton[] = [
  { label: "Safe OFF", description: "Turn all relays off and sync the result.", command: "SAFE_OFF", icon: <PowerOff />, variant: "warning", confirm: true, confirmText: "SAFE_OFF" },
  { label: "Enable OTA", description: "Open the local firmware update window.", command: "ENABLE_OTA", icon: <Wifi />, variant: "success", confirm: true, confirmText: "ENABLE_OTA" },
  { label: "Disable OTA", description: "Close the firmware update window.", command: "DISABLE_OTA", icon: <WifiOff />, variant: "default" },
  { label: "Restart Device", description: "Safe off, restart, then restore from Supabase.", command: "RESTART", icon: <RotateCcw />, variant: "warning", confirm: true, confirmText: "RESTART" },
  { label: "WiFi Reset", description: "Clear saved WiFi credentials and restart.", command: "WIFI_RESET", icon: <AlertTriangle />, variant: "danger", confirm: true, confirmText: "WIFI_RESET" },
];

export default function DiagnosticsPanel({ onCommand, mqttConnected, deviceStatus, otaStatus }: DiagnosticsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmCmd, setConfirmCmd] = useState<CommandButton | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);

  const sendCommand = (btn: CommandButton) => {
    onCommand(btn.command);
    setLastSent(btn.label);
    setConfirmCmd(null);
    setConfirmInput("");
    setTimeout(() => setLastSent(null), 3200);
  };

  const handleCommand = (btn: CommandButton) => {
    if (!mqttConnected) return;
    if (btn.confirm) {
      setConfirmCmd(btn);
      setConfirmInput("");
      return;
    }
    sendCommand(btn);
  };

  const showOtaInfo = Boolean(deviceStatus?.otaEnabled);

  return (
    <>
      <section className="neu-raised flex h-full flex-col rounded-[1.45rem] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="neu-control flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--clr-amber)]">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Advanced Tools</h2>
              <p className="text-xs text-[var(--clr-text-dim)]">{mqttConnected ? "Device command channel ready" : "Connect MQTT to enable tools"}</p>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(true)}
            className="neu-control inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Open Tools
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <StatusBlock label="Channel" value={mqttConnected ? "Ready" : "Offline"} tone={mqttConnected ? "good" : "muted"} />
          <StatusBlock label="OTA" value={deviceStatus?.otaEnabled ? "Enabled" : "Disabled"} tone={deviceStatus?.otaEnabled ? "warn" : "muted"} />
          <StatusBlock label="Last Command" value={lastSent ?? "None"} tone={lastSent ? "good" : "muted"} />
        </div>
      </section>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          >
            <motion.aside
              className="h-full w-full max-w-xl overflow-y-auto border-l border-white/[0.05] bg-[var(--clr-bg-surface)] p-5 shadow-2xl"
              initial={{ x: 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 48, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--clr-amber)]">Advanced tools</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Device Commands</h2>
                  <p className="mt-1 max-w-md text-sm text-[var(--clr-text-muted)]">
                    Commands are sent over MQTT to the ESP32. Risk actions require typed confirmation.
                  </p>
                </div>
                <button
                  aria-label="Close maintenance console"
                  className="neu-control rounded-2xl p-2 text-[var(--clr-text-muted)] hover:text-white"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!mqttConnected && (
                <div className="neu-pressed mt-5 flex items-start gap-2 rounded-2xl p-3 text-sm text-[var(--clr-amber)]">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  MQTT is offline. Commands are disabled until the broker reconnects.
                </div>
              )}

              <CommandSection title="Routine" description="Safe status and synchronization commands." commands={SAFE_COMMANDS} onCommand={handleCommand} disabled={!mqttConnected} />
              <CommandSection title="Risk Controls" description="Actions that can interrupt power, OTA, or WiFi access." commands={RISK_COMMANDS} onCommand={handleCommand} disabled={!mqttConnected} />

              {showOtaInfo && (
                <div className="neu-pressed mt-6 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--clr-green-400)]">
                    <Download className="h-4 w-4" />
                    OTA Window Open
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <InfoRow label="URL" value={`http://${deviceStatus?.ip || "device-ip"}/update`} link={deviceStatus?.ip ? `http://${deviceStatus.ip}/update` : undefined} />
                    <InfoRow label="Credentials" value="admin / admin" />
                  </div>
                  <p className="neu-pressed mt-3 rounded-2xl p-3 text-xs text-[var(--clr-amber)]">Upload only the generated `.ino.bin` firmware file.</p>
                </div>
              )}

              {otaStatus && (
                <div className="neu-pressed mt-4 rounded-2xl p-3 text-sm">
                  <span className="text-[var(--clr-text-dim)]">OTA status: </span>
                  <span className="metric-font text-[var(--clr-amber)]">{otaStatus}</span>
                </div>
              )}

              {lastSent && (
                <div className="neu-pressed mt-4 flex items-center gap-2 rounded-2xl p-3 text-sm text-[var(--clr-green-400)]">
                  <CheckCircle2 className="h-4 w-4" />
                  Sent {lastSent}
                </div>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmCmd && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmCmd(null)}
          >
            <motion.div
              className="neu-raised w-full max-w-md rounded-[1.45rem] p-5"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 text-[var(--clr-red-500)]">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="text-base font-semibold">Confirm {confirmCmd.label}</h3>
              </div>
              <p className="mt-3 text-sm text-[var(--clr-text-muted)]">{confirmCmd.description}</p>
              <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--clr-text-dim)]">
                Type <span className="text-[var(--clr-red-500)]">{confirmCmd.confirmText}</span>
              </label>
              <input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                autoFocus
                className="neu-pressed metric-font mt-2 w-full rounded-2xl px-3 py-2 text-sm text-white outline-none focus:border-[rgba(239,111,124,0.5)]"
                placeholder={confirmCmd.confirmText}
              />
              <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-2xl px-3 py-2 text-sm text-[var(--clr-text-muted)] hover:text-white" onClick={() => setConfirmCmd(null)}>
                  Cancel
                </button>
                <button
                  disabled={confirmInput !== confirmCmd.confirmText}
                  className="neu-control rounded-2xl px-3 py-2 text-sm font-semibold text-[var(--clr-red-500)] disabled:opacity-40"
                  onClick={() => sendCommand(confirmCmd)}
                >
                  Send Command
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CommandSection({
  title,
  description,
  commands,
  onCommand,
  disabled,
}: {
  title: string;
  description: string;
  commands: CommandButton[];
  onCommand: (command: CommandButton) => void;
  disabled: boolean;
}) {
  return (
    <section className="mt-6">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-[var(--clr-text-dim)]">{description}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {commands.map((btn) => (
          <button
            key={btn.command}
            disabled={disabled}
            onClick={() => onCommand(btn)}
            className={cn(
              "neu-control flex items-start gap-3 rounded-2xl p-3 text-left disabled:opacity-45",
              btn.variant === "danger" ? "text-[var(--clr-red-500)]" : btn.variant === "warning" ? "text-[var(--clr-amber)]" : ""
            )}
          >
            <span
              className={cn(
                "neu-pressed mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4",
                btn.variant === "danger"
                  ? "text-[var(--clr-red-500)]"
                  : btn.variant === "warning"
                  ? "text-[var(--clr-amber)]"
                  : btn.variant === "success"
                  ? "text-[var(--clr-green-400)]"
                  : "text-[var(--clr-text-muted)]"
              )}
            >
              {btn.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{btn.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--clr-text-dim)]">{btn.description}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StatusBlock({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "muted" }) {
  const toneClass = tone === "good" ? "text-[var(--clr-green-400)]" : tone === "warn" ? "text-[var(--clr-amber)]" : "text-[var(--clr-text-muted)]";
  return (
    <div className="neu-pressed rounded-2xl px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--clr-text-dim)]">{label}</p>
      <p className={cn("metric-font mt-1 truncate text-sm font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--clr-text-dim)]">{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="metric-font text-right text-[var(--clr-amber)] hover:underline">
          {value}
        </a>
      ) : (
        <span className="metric-font text-right text-[var(--clr-text-muted)]">{value}</span>
      )}
    </div>
  );
}
