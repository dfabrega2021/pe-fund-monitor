"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TrendPoint } from "@/lib/db/queries";
import { formatCurrency, formatMultiple } from "@/lib/format";

type Props = {
  data: TrendPoint[];
  metric: "nav" | "tvpi";
};

// Explicit domain rather than Recharts' auto-scaling or its string-expression
// syntax (e.g. "dataMax + 10") - that syntax produced a garbage axis label
// elsewhere in this app (see ExecutiveDashboard.tsx's % NAV at Cost chart), so
// this project computes chart bounds in plain JS rather than trusting it a
// second time. A minimum span floor keeps small, real moves (e.g. TVPI
// 1.00x -> 1.05x) visible without zooming so far in that ordinary noise
// starts looking like a dramatic trend.
function computeDomain(values: number[], isCurrency: boolean): [number, number] {
  if (values.length === 0) return [0, isCurrency ? 1_000_000 : 1];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = dataMax - dataMin;
  const minSpan = isCurrency ? Math.max(dataMax * 0.1, 1) : 0.15;
  const padding = Math.max(span * 0.15, minSpan * 0.5);
  const domainMin = Math.max(0, dataMin - padding);
  const domainMax = dataMax + padding;
  return [domainMin, domainMax];
}

export function TrendChart({ data, metric }: Props) {
  const [mode, setMode] = useState<"level" | "delta">("level");

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        period: d.period,
        "Gross (main)": metric === "nav" ? d.grossNav : d.grossTvpi,
        "Net (main)": metric === "nav" ? d.netNav : d.netTvpi,
      })),
    [data, metric]
  );

  // QoQ % change view - momentum, complementing the absolute-level line
  // rather than replacing it. With as few as 4 quarters of history, whether
  // value creation is accelerating or decelerating is often more legible
  // (and more decision-relevant) than the absolute level on its own.
  const deltaData = useMemo(
    () =>
      chartData.map((d, i) => {
        const prior = i > 0 ? chartData[i - 1] : null;
        const grossPrior = prior?.["Gross (main)"];
        const netPrior = prior?.["Net (main)"];
        const grossCurrent = d["Gross (main)"];
        const netCurrent = d["Net (main)"];
        return {
          period: d.period,
          "Gross Δ%":
            grossPrior != null && grossCurrent != null && grossPrior !== 0
              ? ((grossCurrent - grossPrior) / Math.abs(grossPrior)) * 100
              : null,
          "Net Δ%":
            netPrior != null && netCurrent != null && netPrior !== 0
              ? ((netCurrent - netPrior) / Math.abs(netPrior)) * 100
              : null,
        };
      }),
    [chartData]
  );

  const formatter = metric === "nav" ? formatCurrency : formatMultiple;
  const isCurrency = metric === "nav";

  const domain = useMemo(() => {
    const values = chartData.flatMap((d) => [d["Gross (main)"], d["Net (main)"]]).filter(
      (v): v is number => v != null
    );
    return computeDomain(values, isCurrency);
  }, [chartData, isCurrency]);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="flex rounded-md bg-surface p-0.5 text-xs">
          <button
            onClick={() => setMode("level")}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              mode === "level" ? "bg-card text-navy shadow-sm" : "text-muted hover:text-navy"
            }`}
          >
            Level
          </button>
          <button
            onClick={() => setMode("delta")}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              mode === "delta" ? "bg-card text-navy shadow-sm" : "text-muted hover:text-navy"
            }`}
          >
            QoQ Change
          </button>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "level" ? (
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
              <YAxis
                tick={{ fontSize: 13, fill: "var(--muted)" }}
                domain={domain}
                tickFormatter={(v) => (metric === "nav" ? `$${(v / 1_000_000).toFixed(0)}M` : `${Number(v).toFixed(2)}x`)}
              />
              <Tooltip formatter={(value) => formatter(Number(value))} contentStyle={{ fontSize: 13, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="Gross (main)" fill="var(--navy)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Net (main)" fill="var(--positive)" radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={deltaData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 13, fill: "var(--muted)" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip
                formatter={(value) => (value == null ? "n/a" : `${Number(value).toFixed(1)}%`)}
                contentStyle={{ fontSize: 13, borderRadius: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Line type="monotone" dataKey="Gross Δ%" stroke="var(--navy)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Net Δ%" stroke="var(--positive)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {mode === "delta" && (
        <p className="mt-2 text-xs text-muted">
          Quarter-over-quarter % change vs. the prior quarter - momentum, not absolute level.
        </p>
      )}
    </div>
  );
}
