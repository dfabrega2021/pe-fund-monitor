"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { BookTrendPoint } from "@/lib/db/queries";
import { formatCurrency } from "@/lib/format";

type Props = {
  data: BookTrendPoint[];
};

// The book-level "whole story" view - how has total portfolio NAV and
// commitment moved over time, across every fund
// fundsReporting is shown in the tooltip since not every fund
// has data going back the same number of quarters (different vintages) - an
// early point reflecting fewer funds is expected, not a data gap.
export function BookTrendChart({ data }: Props) {
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Not enough quarters of history yet to show a portfolio trend.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
          <YAxis
            tick={{ fontSize: 13, fill: "var(--muted)" }}
            tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
          />
          <Tooltip
            formatter={(value, name) => [formatCurrency(Number(value)), name]}
            labelFormatter={(label, payload) => {
              const point = payload?.[0]?.payload as BookTrendPoint | undefined;
              return point ? `${label} (${point.fundsReporting} funds reporting)` : label;
            }}
            contentStyle={{ fontSize: 13, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line type="monotone" dataKey="totalNav" name="Total NAV" stroke="var(--navy)" strokeWidth={2} dot={{ r: 3 }} />
          <Line
            type="monotone"
            dataKey="totalCommitment"
            name="Total Commitment"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
