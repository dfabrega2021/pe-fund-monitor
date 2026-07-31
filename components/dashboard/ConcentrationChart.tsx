"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

// Generic NAV-vs-Commitment grouped bar chart - reused for both the macro
// (by asset class) and detailed (by sector) views in BookExplorer, so the
// two views are visually identical apart from what each bar group represents.
export type ConcentrationGroup = {
  label: string;
  nav: number;
  commitment: number;
};

type Props = {
  data: ConcentrationGroup[];
};

export function ConcentrationChart({ data }: Props) {
  const chartData = data.map((d) => ({
    label: d.label,
    NAV: d.nav,
    Commitment: d.commitment,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 13, fill: "var(--muted)" }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 13, fill: "var(--muted)" }}
            tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{ fontSize: 13, borderRadius: 6 }}
          />
          {/* Recharts' type defs exclude a manually-supplied `payload`, even though
              it's a valid runtime prop - spreading an untyped object is the
              pragmatic way to pin legend entry order to match the bars. */}
          <Legend
            wrapperStyle={{ fontSize: 13 }}
            {...({
              payload: [
                { value: "NAV", type: "square", color: "var(--navy)" },
                { value: "Commitment", type: "square", color: "var(--gold)" },
              ],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)}
          />
          <Bar dataKey="NAV" fill="var(--navy)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Commitment" fill="var(--gold)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
