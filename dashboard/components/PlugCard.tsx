"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { PlugId, PlugTelemetry, PlugControlInfo } from "@/types";
import { PLUG_LABELS } from "@/types";
import {
  CheckCircle2,
  Clock3,
  Gauge,
  Plug,
  Power,
  RadioTower,
  ShieldAlert,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlugCardProps {
  plugId: PlugId;
  plugState: "ON" | "OFF";
  plugTelemetry: PlugTelemetry | null;
  globalVoltage: number | null;
  controlInfo: PlugControlInfo;
  mqttConnected: boolean;
  onToggle: (plugId: PlugId, newState: "ON" | "OFF") => void;
}

export default function PlugCard({
  plugId,
  plugState,
  plugTelemetry,
  globalVoltage,
  controlInfo,
  mqttConnected,
  onToggle,
}: PlugCardProps) {
  const isOn = plugState === "ON";
  const isPending = controlInfo.state === "pending";
  const isConfirmed = controlInfo.state === "confirmed";
  const isTimeout = controlInfo.state === "timeout";
  const disabled = isPending || !mqttConnected;

  const current = plugTelemetry?.current ?? null;
  const power = plugTelemetry?.power ?? null;
  const stateTone = isOn ? "text-[var(--clr-green-400)]" : "text-[var(--clr-text-dim)]";

  const handleToggle = () => {
    if (!disabled) onToggle(plugId, isOn ? "OFF" : "ON");
  };

  const statusLine = isPending
    ? { icon: <Clock3 className="h-3.5 w-3.5" />, text: `Updating to ${controlInfo.targetState}`, cls: "text-[var(--clr-amber)]" }
    : isConfirmed
    ? { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: "Outlet updated", cls: "text-[var(--clr-green-400)]" }
    : isTimeout
    ? { icon: <XCircle className="h-3.5 w-3.5" />, text: "Outlet did not respond", cls: "text-[var(--clr-red-500)]" }
    : !mqttConnected
    ? { icon: <WifiOff className="h-3.5 w-3.5" />, text: "Offline. Control disabled.", cls: "text-[var(--clr-text-dim)]" }
    : { icon: <RadioTower className="h-3.5 w-3.5" />, text: "Ready", cls: "text-[var(--clr-text-dim)]" };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "neu-raised group relative overflow-hidden rounded-[1.45rem] p-4",
        "transition duration-200 hover:-translate-y-0.5",
        isOn && "neu-active"
      )}
    >
      <div
        className={cn(
          "absolute inset-x-6 top-0 h-px",
          isOn ? "bg-[linear-gradient(90deg,transparent,var(--clr-amber),transparent)]" : "bg-white/[0.04]"
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              isOn
                ? "neu-control text-[var(--clr-amber)]"
                : "neu-pressed text-[var(--clr-text-dim)]"
            )}
          >
            <Plug className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-white">{PLUG_LABELS[plugId]}</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                  isOn ? "text-[var(--clr-amber)]" : "text-[var(--clr-text-dim)]"
                )}
              >
                {isOn ? "On" : "Off"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--clr-text-dim)]">
              {isOn ? "On and drawing power" : "Off"}
            </p>
          </div>
        </div>

        <button
          role="switch"
          aria-checked={isOn}
          aria-label={`Toggle ${PLUG_LABELS[plugId]}`}
          disabled={disabled}
          onClick={handleToggle}
          className={cn(
            "neu-pressed relative h-9 w-16 shrink-0 rounded-full transition outline-none",
            "focus-visible:ring-2 focus-visible:ring-[rgba(92,242,189,0.36)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-bg-panel)]",
            isOn && "switch-track-on after:absolute after:inset-1 after:rounded-full after:bg-[rgba(92,242,189,0.08)]",
            disabled && "opacity-50"
          )}
        >
          <span
            className={cn(
              "absolute top-[4px] z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all",
              isOn ? "switch-knob-on left-[31px]" : "switch-knob-off left-[4px]"
            )}
          >
            <Power className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--clr-text-dim)]">Using now</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={cn("metric-font text-4xl font-semibold leading-none", isOn ? "text-white" : "text-[var(--clr-text-dim)]")}>
              {power !== null ? power.toFixed(1) : "--"}
            </span>
            <span className="text-sm font-semibold text-[var(--clr-text-dim)]">W</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-right">
          <MiniMetric icon={<Zap />} label="Volt" value={globalVoltage !== null ? globalVoltage.toFixed(0) : "--"} tone="text-[var(--clr-amber)]" />
          <MiniMetric icon={<Gauge />} label="Amp" value={current !== null ? current.toFixed(2) : "--"} tone={stateTone} />
        </div>
      </div>

      <div className={cn("mt-5 flex min-h-5 items-center gap-2 text-xs font-medium", statusLine.cls)}>
        {statusLine.icon}
        <span>{statusLine.text}</span>
      </div>

      {isTimeout && (
        <div className="neu-pressed mt-3 flex items-start gap-2 rounded-2xl p-3 text-xs text-[var(--clr-red-500)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Verify relay state physically before issuing another command.</span>
        </div>
      )}
    </motion.article>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="neu-pressed rounded-2xl px-3 py-2">
      <div className="mb-1 flex justify-end text-[var(--clr-text-dim)] [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</div>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--clr-text-dim)]">{label}</p>
      <p className={cn("metric-font text-sm font-semibold", tone)}>{value}</p>
    </div>
  );
}
