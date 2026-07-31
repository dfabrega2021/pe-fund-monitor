"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { PortfolioCompanyRow } from "@/lib/db/queries";
import { formatCurrency } from "@/lib/format";

type Props = {
  companies: PortfolioCompanyRow[];
};

const TOP_N = 8;
const BAR_COLOR = "var(--gold)";
const OTHER_COLOR = "var(--gold-light)";
const MAX_LABEL_CHARS = 20;

// Truncate rather than let Recharts wrap long names onto multiple lines
// (which breaks mid-word and staggers row heights) - a fixed axis width
// can't be hand-tuned per company name at 40-fund scale, so this needs to
// degrade gracefully for names of any length. Full name is still available
// via the tooltip on hover.
function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…` : name;
}

// Horizontal ranking by NAV contribution - an instant "who's biggest" read
// without scanning the full table below it. Capped at the top 8 + an "Other"
// aggregate bar so this stays readable even for a fund with a long tail of
// smaller positions (mirrors the same top-N + Other pattern used for
// manager concentration on the Executive Summary). This chart only answers
// "how concentrated is this fund" - QoQ change, MOIC, committed/unfunded,
// and status still live in the table; this isn't a replacement for it.
export function CompanyConcentrationBars({ companies }: Props) {
  const withValuation = companies.filter((c): c is PortfolioCompanyRow & { valuation: number } => c.valuation != null);

  if (withValuation.length === 0) {
    return <p className="text-sm text-muted">No valuation data for this quarter.</p>;
  }

  const sorted = [...withValuation].sort((a, b) => b.valuation - a.valuation);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const totalValuation = sorted.reduce((s, c) => s + c.valuation, 0);

  const chartData: { name: string; valuation: number; pct: number; isOther: boolean }[] = top.map((c) => ({
    name: c.companyName,
    valuation: c.valuation,
    pct: totalValuation > 0 ? (c.valuation / totalValuation) * 100 : 0,
    isOther: false,
  }));
  if (rest.length > 0) {
    const restValuation = rest.reduce((s, c) => s + c.valuation, 0);
    chartData.push({
      name: `Other (${rest.length})`,
      valuation: restValuation,
      pct: totalValuation > 0 ? (restValuation / totalValuation) * 100 : 0,
      isOther: true,
    });
  }

  const height = Math.max(200, chartData.length * 36);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 13, fill: "var(--muted)" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
          <YAxis
            type="category"
            dataKey="name"
            width={185}
            tick={{ fontSize: 13, fill: "var(--navy)" }}
            tickFormatter={truncateLabel}
          />
          <Tooltip
            formatter={(value, _name, entry) => {
              const payload = entry?.payload as { valuation: number } | undefined;
              return [
                `${Number(value).toFixed(1)}%${payload ? ` (${formatCurrency(payload.valuation)})` : ""}`,
                "% of Fund NAV",
              ];
            }}
            contentStyle={{ fontSize: 13, borderRadius: 6 }}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={14}>
            {chartData.map((d) => (
              <Cell key={d.name} fill={d.isOther ? OTHER_COLOR : BAR_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
