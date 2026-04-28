"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TelemetryPoint } from "@/types";
import { Activity, Radio, Zap } from "lucide-react";

interface LiveChartProps {
  buffer: TelemetryPoint[];
}

const CHART_COLORS = {
  total: "#ffb15c",
  plug1: "#8ee6b3",
  plug2: "#d8a7cf",
  plug3: "#e3c46f",
} as const;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function LiveChart({ buffer }: LiveChartProps) {
  const data = useMemo(
    () =>
      buffer.map((p) => ({
        time: formatTime(p.timestamp),
        totalPower: Number(p.totalPower.toFixed(2)),
        plug1: Number(p.plug_1_power.toFixed(2)),
        plug2: Number(p.plug_2_power.toFixed(2)),
        plug3: Number(p.plug_3_power.toFixed(2)),
      })),
    [buffer]
  );

  const latest = buffer.at(-1);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
      className="neu-raised min-w-0 rounded-[1.45rem] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="neu-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[var(--clr-amber)]">
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">Live Meter</h2>
            <p className="text-xs text-[var(--clr-text-dim)]">Real-time changes from the last few minutes</p>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--clr-green-400)]">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            Live
          </div>
          <p className="metric-font mt-1 text-sm font-semibold text-white">
            {latest ? `${latest.totalPower.toFixed(1)} W` : "-- W"}
          </p>
        </div>
      </div>

      {data.length < 2 ? (
        <div className="neu-pressed mt-4 flex h-[260px] flex-col items-center justify-center rounded-[1.25rem] text-center">
          <Zap className="mb-3 h-7 w-7 text-[var(--clr-text-dim)]" />
          <p className="text-sm font-medium text-[var(--clr-text-muted)]">Waiting for live readings</p>
          <p className="mt-1 text-xs text-[var(--clr-text-dim)]">The chart will appear after two device samples.</p>
        </div>
      ) : (
        <div className="neu-pressed mt-4 h-[260px] min-w-0 rounded-[1.25rem] px-2 py-3">
          <ResponsiveContainer width="100%" height="100%" minWidth={260}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "var(--clr-text-dim)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={22}
              />
              <YAxis
                width={44}
                tick={{ fill: "var(--clr-text-dim)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${val}W`}
              />
              <Tooltip
                cursor={{ stroke: "rgba(240,168,92,0.28)", strokeWidth: 1 }}
                contentStyle={{
                  background: "#0d1016",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 14,
                  color: "white",
                  boxShadow: "12px 14px 30px rgba(0,0,0,.55), -6px -6px 16px rgba(255,255,255,.035)",
                }}
                labelStyle={{ color: "var(--clr-text-muted)", fontSize: 11 }}
                itemStyle={{ fontSize: 11 }}
              />
              <Legend
                verticalAlign="top"
                height={24}
                iconType="circle"
                wrapperStyle={{ color: "var(--clr-text-muted)", fontSize: 11 }}
              />
              <Line type="monotone" dataKey="totalPower" name="Total" stroke={CHART_COLORS.total} strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="plug1" name="Plug 1" stroke={CHART_COLORS.plug1} strokeWidth={1.8} dot={false} />
              <Line type="monotone" dataKey="plug2" name="Plug 2" stroke={CHART_COLORS.plug2} strokeWidth={1.6} dot={false} />
              <Line type="monotone" dataKey="plug3" name="Plug 3" stroke={CHART_COLORS.plug3} strokeWidth={1.6} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.section>
  );
}
