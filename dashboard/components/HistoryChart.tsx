"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import type { Reading, HistoryWindow } from "@/types";
import { AlertCircle, BarChart3, History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WINDOW_CONFIG: Record<HistoryWindow, { label: string; minutes: number }> = {
  "15m": { label: "15m", minutes: 15 },
  "1h": { label: "1h", minutes: 60 },
  "24h": { label: "24h", minutes: 1440 },
};

function formatTime(iso: string, window: HistoryWindow): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: window === "24h" ? undefined : "2-digit",
    hour12: false,
  });
}

export default function HistoryChart() {
  const [window, setWindow] = useState<HistoryWindow>("1h");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const minutes = WINDOW_CONFIG[window].minutes;
      const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

      const { data, error: err } = await supabase
        .from("readings")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(500);

      if (err) throw new Error(err.message);
      setReadings(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch history");
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active) await fetchHistory();
    };
    run();
    const interval = setInterval(run, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fetchHistory]);

  const chartData = useMemo(() => {
    const byTime = new Map<string, { time: string; totalPower: number; p1: number; p2: number; p3: number }>();

    for (const r of readings) {
      const key = r.created_at;
      const existing = byTime.get(key);
      if (!existing) {
        byTime.set(key, {
          time: formatTime(r.created_at, window),
          totalPower: r.power,
          p1: r.device_id === "plug_1" ? r.power : 0,
          p2: r.device_id === "plug_2" ? r.power : 0,
          p3: r.device_id === "plug_3" ? r.power : 0,
        });
      } else {
        existing.totalPower += r.power;
        if (r.device_id === "plug_1") existing.p1 = r.power;
        if (r.device_id === "plug_2") existing.p2 = r.power;
        if (r.device_id === "plug_3") existing.p3 = r.power;
      }
    }

    return Array.from(byTime.values()).map((p) => ({
      ...p,
      totalPower: Number(p.totalPower.toFixed(2)),
    }));
  }, [readings, window]);

  const peak = chartData.reduce((max, point) => Math.max(max, point.totalPower), 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.12 }}
      className="neu-raised min-w-0 rounded-[1.45rem] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="neu-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[var(--clr-amber)]">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Energy History</h2>
            <p className="text-xs text-[var(--clr-text-dim)]">Usage over time, refreshed every minute</p>
          </div>
        </div>

        <div className="neu-pressed flex items-center gap-1 rounded-2xl p-1">
          {(Object.keys(WINDOW_CONFIG) as HistoryWindow[]).map((w) => (
            <button
              key={w}
              className={cn(
                "rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition",
                w === window ? "neu-control text-white" : "text-[var(--clr-text-dim)] hover:text-[var(--clr-text-muted)]"
              )}
              onClick={() => setWindow(w)}
            >
              {WINDOW_CONFIG[w].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Peak" value={`${peak.toFixed(1)} W`} />
        <Stat label="Samples" value={readings.length.toString()} />
      </div>

      {loading ? (
        <div className="neu-pressed mt-4 flex h-[240px] flex-col items-center justify-center rounded-[1.25rem]">
          <Loader2 className="mb-3 h-6 w-6 animate-spin text-[var(--clr-amber)]" />
          <p className="text-sm text-[var(--clr-text-muted)]">Loading history</p>
        </div>
      ) : error ? (
        <div className="neu-pressed mt-4 flex h-[240px] flex-col items-center justify-center rounded-[1.25rem] text-center">
          <AlertCircle className="mb-3 h-6 w-6 text-[var(--clr-red-500)]" />
          <p className="max-w-sm text-sm text-[var(--clr-red-500)]">{error}</p>
          <button className="neu-control mt-4 rounded-2xl px-3 py-1.5 text-xs font-semibold text-[var(--clr-red-500)]" onClick={fetchHistory}>
            Retry
          </button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="neu-pressed mt-4 flex h-[240px] flex-col items-center justify-center rounded-[1.25rem] text-center">
          <BarChart3 className="mb-3 h-7 w-7 text-[var(--clr-text-dim)]" />
          <p className="text-sm font-medium text-[var(--clr-text-muted)]">No readings in this window</p>
          <p className="mt-1 text-xs text-[var(--clr-text-dim)]">Try a wider range or verify Supabase writes.</p>
        </div>
      ) : (
        <div className="neu-pressed mt-4 h-[240px] min-w-0 rounded-[1.25rem] px-2 py-3">
          <ResponsiveContainer width="100%" height="100%" minWidth={260}>
            {window === "24h" ? (
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--clr-text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis width={44} tick={{ fill: "var(--clr-text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}W`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: "rgba(240,168,92,.08)" }} />
                <Bar dataKey="totalPower" name="Total" fill="var(--clr-amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <defs>
                  <linearGradient id="histTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--clr-amber)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--clr-amber)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--clr-text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} />
                <YAxis width={44} tick={{ fill: "var(--clr-text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}W`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ stroke: "rgba(240,168,92,.28)" }} />
                <Area type="monotone" dataKey="totalPower" name="Total" stroke="var(--clr-amber)" fill="url(#histTotal)" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </motion.section>
  );
}

const tooltipStyle = {
  background: "#0d1016",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  color: "white",
  boxShadow: "12px 14px 30px rgba(0,0,0,.55), -6px -6px 16px rgba(255,255,255,.035)",
};

const tooltipLabelStyle = { color: "var(--clr-text-muted)", fontSize: 11 };
const tooltipItemStyle = { fontSize: 11 };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="neu-pressed rounded-2xl px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--clr-text-dim)]">{label}</p>
      <p className="metric-font mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
