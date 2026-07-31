"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/format";

// Generic {label, value, pct} shape rather than ConcentrationSlice/
// ManagerConcentrationSlice directly, so this one component can render either
// lens (or any future one) without caring what's being concentrated - callers
// map their own data in. The "Other ..." trailing bucket (e.g. "Other
// Positions (N)" or "Other Managers (N)") is detected generically by prefix
// so it always renders last in muted gray regardless of which lens is active.
export type DonutSlice = {
  label: string;
  value: number;
  pct: number;
};

type Props = {
  data: DonutSlice[];
  emptyMessage?: string;
};

// Fixed palette so a given slice's color stays stable as quarters (and slice
// order) change - the trailing "Other ..." bucket always renders last in
// muted gray regardless of how many named slices precede it.
const SLICE_COLORS = [
  "var(--navy)",
  "var(--gold)",
  "var(--positive)",
  "var(--navy2)",
  "var(--gold-light)",
];
const OTHER_COLOR = "var(--muted)";

export function ConcentrationDonut({ data, emptyMessage = "No data for this quarter." }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-56 w-full sm:w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={d.label.startsWith("Other ") ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, entry) => [
                formatCurrency(Number(value)),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (entry?.payload as any)?.label ?? "",
              ]}
              contentStyle={{ fontSize: 13, borderRadius: 6 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: d.label.startsWith("Other ") ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length],
              }}
            />
            <span className="min-w-0 flex-1 truncate text-navy">{d.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{d.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
