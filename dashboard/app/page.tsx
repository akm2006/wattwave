"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  LogOut,
  PlugZap,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wifi,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useMqttDevice } from "@/hooks/useMqttDevice";
import { PLUG_IDS, PLUG_LABELS } from "@/types";
import type { PlugId, Reading } from "@/types";
import PlugCard from "@/components/PlugCard";
import LiveChart from "@/components/LiveChart";
import HistoryChart from "@/components/HistoryChart";
import DeviceInfoPanel from "@/components/DeviceInfoPanel";
import DiagnosticsPanel from "@/components/DiagnosticsPanel";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [config, setConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const mqtt = useMqttDevice(config?.mqtt);
  const router = useRouter();

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) throw new Error("Failed to load secure configuration");
        const data = await res.json();
        
        // Initialize Supabase with private keys
        import("@/lib/supabaseClient").then(({ initSupabase }) => {
          initSupabase(data.supabase.url, data.supabase.key);
        });

        setConfig(data);
      } catch (err) {
        console.error(err);
        router.push("/login");
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, [router]);

  const [fallbackReadings, setFallbackReadings] = useState<Record<PlugId, Reading | null>>({
    plug_1: null,
    plug_2: null,
    plug_3: null,
  });
  const [fallbackVoltage, setFallbackVoltage] = useState<number | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fetchSupabaseFallback = useCallback(async () => {
    try {
      const results = await Promise.all(
        PLUG_IDS.map((id) =>
          supabase
            .from("readings")
            .select("*")
            .eq("device_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        )
      );

      const readings: Record<PlugId, Reading | null> = {
        plug_1: null,
        plug_2: null,
        plug_3: null,
      };

      for (let i = 0; i < PLUG_IDS.length; i++) {
        const { data, error } = results[i];
        if (error) throw new Error(error.message);
        readings[PLUG_IDS[i]] = (data as Reading) ?? null;
      }

      setFallbackReadings(readings);
      setFallbackVoltage(Object.values(readings).find((r) => r?.voltage != null)?.voltage ?? null);
      setSupabaseError(null);
    } catch (e) {
      setSupabaseError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setSupabaseLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active && config) await fetchSupabaseFallback();
    };
    run();
    const interval = setInterval(run, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fetchSupabaseFallback]);

  const mqttLive = mqtt.connectionState === "connected" && mqtt.telemetry !== null;
  const voltage = mqttLive ? mqtt.telemetry!.voltage : fallbackVoltage;
  const totalPower = mqttLive
    ? mqtt.telemetry!.totalPower
    : Object.values(fallbackReadings).reduce((sum, r) => sum + (r?.power ?? 0), 0);

  const activeCount = mqttLive ? PLUG_IDS.filter((id) => mqtt.plugStates[id] === "ON").length : 0;
  const firmwareVersion = mqtt.telemetry?.version ?? mqtt.deviceStatus?.version ?? null;
  const lastSyncTime = mqtt.lastTelemetryAt
    ? new Date(mqtt.lastTelemetryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    : null;

  const isConnected = mqtt.connectionState === "connected" && mqtt.deviceOnline;
  const connText =
    mqtt.connectionState === "connected"
      ? mqtt.deviceOnline
        ? "Live"
        : "Broker connected"
      : mqtt.connectionState === "connecting"
      ? "Connecting"
      : mqtt.connectionState === "reconnecting"
      ? "Reconnecting"
      : mqtt.connectionState === "error"
      ? "Error"
      : !mqtt.mqttConfigured
      ? "Not configured"
      : "Disconnected";

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (e) {
      console.error("Logout failed", e);
      setIsLoggingOut(false);
    }
  };

  const hasFallbackData = Object.values(fallbackReadings).some(Boolean);
  const activePlugIds = mqttLive ? PLUG_IDS.filter((id) => mqtt.plugStates[id] === "ON") : [];
  const activePlugNames = activePlugIds.map((id) => PLUG_LABELS[id]);
  const usagePace = totalPower > 0 ? `${(totalPower / 1000).toFixed(3)} kWh/hr` : "Idle";
  const loadLabel = totalPower < 10 ? "Quiet home" : totalPower < 80 ? "Normal use" : "High load";
  const loadBody =
    activePlugNames.length > 0
      ? `${activePlugNames.join(", ")} ${activePlugNames.length === 1 ? "is" : "are"} on right now.`
      : "All smart outlets are currently off.";
  const sourceLabel = mqttLive ? "Live MQTT" : hasFallbackData ? "Saved snapshot" : "Connecting";

  return (
    <main className="min-h-screen px-4 py-4 sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <header className="-mx-4 border-b border-[#17110c] bg-[#030303] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.72)] sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="neu-control flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[var(--clr-amber)]">
                <PlugZap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">Wattwave</h1>
                <p className="truncate text-xs text-[var(--clr-text-dim)]">Home energy, outlets, device health</p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <StatusPill online={isConnected} label={connText} />
              {lastSyncTime && <span className="metric-font hidden text-xs text-[var(--clr-text-dim)] sm:inline">{lastSyncTime}</span>}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="neu-control inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[var(--clr-text-muted)] transition hover:text-white disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isLoggingOut ? "Logging out" : "Logout"}</span>
              </button>
            </div>
          </div>
        </header>

        {configLoading || (!mqttLive && supabaseLoading) ? (
          <ShellState icon={<RefreshCw className="h-8 w-8 animate-spin" />} title={configLoading ? "Securing connection..." : "Connecting to energy data"} body={configLoading ? "Retrieving encrypted credentials from the vault." : "Loading the latest Supabase snapshot while MQTT connects."} />
        ) : !mqttLive && supabaseError && !hasFallbackData ? (
          <ShellState
            danger
            icon={<ShieldAlert className="h-8 w-8" />}
            title="Connection failed"
            body={supabaseError}
            action={<button className="neu-control rounded-2xl px-4 py-2 text-sm font-semibold text-[var(--clr-red-500)]" onClick={fetchSupabaseFallback}>Retry</button>}
          />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.62fr)]" aria-label="Home energy summary">
              <article className="neu-raised-strong relative overflow-hidden rounded-[1.6rem] p-5 sm:p-6">
                <div className="pointer-events-none absolute right-8 top-8 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(240,168,92,0.14),transparent_64%)] blur-sm" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--clr-amber)]">Home now</p>
                    <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                      {totalPower.toFixed(1)}
                      <span className="ml-2 text-lg text-[var(--clr-text-dim)]">W</span>
                    </h2>
                    <p className="mt-3 max-w-md text-sm leading-6 text-[var(--clr-text-muted)]">{loadBody}</p>
                  </div>
                  <div className="neu-pressed rounded-2xl px-3 py-2 text-right">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--clr-text-dim)]">Status</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--clr-amber)]">{loadLabel}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <HomeMetric icon={<PlugZap />} label="On now" value={`${activeCount}/3 outlets`} />
                  <HomeMetric icon={<Zap />} label="Current pace" value={usagePace} />
                  <HomeMetric icon={mqttLive ? <Radio /> : <Database />} label="Data" value={sourceLabel} />
                </div>
              </article>

              <article className="neu-raised rounded-[1.6rem] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--clr-cyan)]">At a glance</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Home checks</h2>
                  </div>
                  <Wifi className="h-4 w-4 text-[var(--clr-text-dim)]" />
                </div>
                <div className="mt-5 grid gap-3">
                  <SnapshotRow label="Voltage" value={voltage !== null ? `${voltage.toFixed(0)} V` : "--"} />
                  <SnapshotRow label="Signal" value={mqtt.deviceStatus?.rssi != null ? `${mqtt.deviceStatus.rssi} dBm` : "--"} />
                  <SnapshotRow label="Updated" value={lastSyncTime ?? "--"} />
                </div>
              </article>
            </section>

            <section className="neu-raised min-w-0 rounded-[1.6rem] p-4">
              <SectionHeader
                eyebrow="Control"
                title="Smart Outlets"
                body="Turn outlets on or off from the home screen. Each change confirms after the ESP32 responds."
              />
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {PLUG_IDS.map((id) => (
                  <PlugCard
                    key={id}
                    plugId={id}
                    plugState={mqttLive ? mqtt.plugStates[id] : "OFF"}
                    plugTelemetry={
                      mqttLive && mqtt.telemetry
                        ? mqtt.telemetry[id]
                        : fallbackReadings[id]
                        ? {
                            state: "OFF" as const,
                            current: fallbackReadings[id]!.current,
                            power: fallbackReadings[id]!.power,
                          }
                        : null
                    }
                    globalVoltage={voltage}
                    controlInfo={mqtt.plugControls[id]}
                    mqttConnected={mqtt.connectionState === "connected"}
                    onToggle={mqtt.publishControl}
                  />
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <HistoryChart />
              <LiveChart buffer={mqtt.telemetryBuffer} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
              <DeviceInfoPanel
                connectionState={mqtt.connectionState}
                deviceOnline={mqtt.deviceOnline}
                deviceStatus={mqtt.deviceStatus}
                lastTelemetryAt={mqtt.lastTelemetryAt}
                lastStatusAt={mqtt.lastStatusAt}
                firmwareVersion={firmwareVersion}
                statusParseError={mqtt.statusParseError}
              />
              <DiagnosticsPanel
                onCommand={mqtt.sendCommand}
                mqttConnected={mqtt.connectionState === "connected"}
                deviceStatus={mqtt.deviceStatus}
                otaStatus={mqtt.otaStatus}
              />
            </section>

            <footer className="pb-4 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--clr-text-dim)]">
              Wattwave · ESP32 · ACS712 · ZMPT101B · MQTT · Supabase
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

function SectionHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--clr-amber)]">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      </div>
      <p className="max-w-xl text-sm leading-6 text-[var(--clr-text-muted)]">{body}</p>
    </div>
  );
}

function StatusPill({ online, label }: { online: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-2xl px-3 text-xs font-semibold",
        online
          ? "neu-control text-[var(--clr-green-400)]"
          : "neu-control text-[var(--clr-text-muted)]"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", online ? "soft-led bg-[var(--clr-green-500)]" : "bg-[var(--clr-text-dim)]")} />
      {label}
    </span>
  );
}

function HomeMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="neu-control rounded-2xl px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--clr-text-dim)]">{label}</p>
        <span className="text-[var(--clr-amber)] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <p className="metric-font truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="neu-pressed flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
      <span className="text-xs text-[var(--clr-text-dim)]">{label}</span>
      <span className="metric-font text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function ShellState({
  icon,
  title,
  body,
  action,
  danger = false,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="neu-raised flex min-h-[65vh] items-center justify-center rounded-[2.5rem] p-12 text-center relative overflow-hidden">
      {/* Decorative background element */}
      <div className={cn(
        "absolute -top-24 -left-24 h-64 w-64 rounded-full opacity-[0.03] blur-[80px]",
        danger ? "bg-[var(--clr-red-500)]" : "bg-[var(--clr-amber)]"
      )} />
      
      <div className="relative z-10 max-w-sm">
        <div className={cn(
          "neu-control mx-auto flex h-20 w-20 items-center justify-center rounded-[1.5rem] shadow-xl",
          danger ? "text-[var(--clr-red-500)] shadow-[rgba(255,111,130,0.1)]" : "text-[var(--clr-amber)] shadow-[rgba(240,168,92,0.1)]"
        )}>
          <span className="[&>svg]:h-10 [&>svg]:w-10">{icon}</span>
        </div>
        <h2 className="mt-8 text-2xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-4 text-sm leading-relaxed text-[var(--clr-text-muted)]">{body}</p>
        {action && <div className="mt-8">{action}</div>}
      </div>
    </section>
  );
}
