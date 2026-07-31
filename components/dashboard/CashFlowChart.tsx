"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TrendPoint } from "@/lib/db/queries";
import { formatCurrency } from "@/lib/format";

type Props = {
  data: TrendPoint[];
};

// Stacked bar (NAV + Distributed Capital = Total Value) with Called Capital
// overlaid as a line, not three grouped bars. Grouped bars fixed the earlier
// area-chart problem (zero baseline swallowing the plot) but left the CIO
// doing mental math - stacking the green Distributed bar on top of the navy
// NAV bar in their head to see whether Total Value clears Called Capital.
// Stacking them for real answers "is TVPI above 1.0x" at a glance: the top
// of the stacked bar crossing above the gold line is exactly that moment.
// This also resolves a color-contrast problem for free - Called Capital is
// no longer a bar competing for the same blue-grey family as NAV, since it's
// now a distinct gold line instead.
export function CashFlowChart({ data }: Props) {
  const chartData = data
    .filter((d) => d.netCalledCapital != null || d.netDistributedCapital != null || d.netNav != null)
    .map((d) => ({
      period: d.period,
      "Called Capital": d.netCalledCapital,
      "NAV (Remaining Value)": d.netNav,
      "Distributed Capital": d.netDistributedCapital,
    }));

  if (chartData.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Not enough quarters of history yet to show the fund&apos;s cash-flow curve.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
          <YAxis
            tick={{ fontSize: 13, fill: "var(--muted)" }}
            tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
          />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ fontSize: 13, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="NAV (Remaining Value)" stackId="totalValue" fill="var(--navy)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Distributed Capital" stackId="totalValue" fill="var(--positive)" radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="Called Capital"
            stroke="var(--gold)"
            strokeWidth={2.5}
            dot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
