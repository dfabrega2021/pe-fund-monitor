"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { CompanyQuarterHistoryRow } from "@/lib/db/queries";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/format";

type Props = {
  data: CompanyQuarterHistoryRow[];
  metric: "valuation" | "grossMoic" | "grossIrr";
};

const metricLabel = { valuation: "Valuation", grossMoic: "Gross MOIC", grossIrr: "Gross IRR" };

export function CompanyTrendChart({ data, metric }: Props) {
  const chartData = data.map((d) => ({ period: d.period, value: d[metric] }));
  const formatter = metric === "valuation" ? formatCurrency : metric === "grossMoic" ? formatMultiple : formatPercent;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
          <YAxis
            tick={{ fontSize: 13, fill: "var(--muted)" }}
            tickFormatter={(v) =>
              metric === "valuation" ? `$${(v / 1_000_000).toFixed(1)}M` : metric === "grossMoic" ? `${Number(v).toFixed(1)}x` : `${(Number(v) * 100).toFixed(0)}%`
            }
          />
          <Tooltip formatter={(value) => (value == null ? "At cost" : formatter(Number(value)))} contentStyle={{ fontSize: 13, borderRadius: 6 }} />
          <Line
            type="monotone"
            dataKey="value"
            name={metricLabel[metric]}
            stroke="var(--navy)"
            strokeWidth={2}
            dot={{ r: 3, stroke: "var(--gold)", fill: "var(--gold)" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
