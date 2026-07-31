"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { BookTrendPoint, TrendPoint } from "@/lib/db/queries";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/format";

type FundTrend = { fundId: string; fundName: string; data: TrendPoint[] };

type Props = {
  bookTrend: BookTrendPoint[];
  fundTrends: FundTrend[];
};

type BookMetric = "totalNav" | "totalCommitment";
type FundMetric = "netNav" | "netTvpi" | "netDpi" | "netRvpi" | "netIrr";

const BOOK_METRICS: { key: BookMetric; label: string }[] = [
  { key: "totalNav", label: "Total NAV" },
  { key: "totalCommitment", label: "Total Commitment" },
];

const FUND_METRICS: { key: FundMetric; label: string }[] = [
  { key: "netNav", label: "NAV (Net)" },
  { key: "netTvpi", label: "TVPI (Net)" },
  { key: "netDpi", label: "DPI (Net)" },
  { key: "netRvpi", label: "RVPI (Net)" },
  { key: "netIrr", label: "IRR (Net)" },
];

const CURRENCY_METRICS = new Set(["totalNav", "totalCommitment", "netNav"]);
const MULTIPLE_METRICS = new Set(["netTvpi", "netDpi", "netRvpi"]);

// Multi-metric explorer, at either book scope (every fund aggregated) or a
// single fund's own trend - letting a CIO pick "what do I want to see move
// over time" instead of only ever seeing NAV and TVPI on the fund page and
// total NAV on the book page. Not a company-level overlay/comparison mode
// (a reasonable next step, not built here) - scoped to book vs. one fund.
export function TrendsExplorer({ bookTrend, fundTrends }: Props) {
  const [scope, setScope] = useState<"book" | string>("book");
  const [bookMetric, setBookMetric] = useState<BookMetric>("totalNav");
  const [fundMetric, setFundMetric] = useState<FundMetric>("netNav");

  const isBook = scope === "book";
  const activeMetricKey = isBook ? bookMetric : fundMetric;

  const chartData = useMemo(() => {
    if (isBook) {
      return bookTrend.map((d) => ({ period: d.period, value: d[bookMetric] }));
    }
    const fund = fundTrends.find((f) => f.fundId === scope);
    if (!fund) return [];
    return fund.data.map((d) => ({ period: d.period, value: d[fundMetric] }));
  }, [isBook, bookTrend, bookMetric, fundTrends, scope, fundMetric]);

  const formatter = CURRENCY_METRICS.has(activeMetricKey)
    ? formatCurrency
    : MULTIPLE_METRICS.has(activeMetricKey)
      ? formatMultiple
      : formatPercent;

  const tickFormatter = (v: number) =>
    CURRENCY_METRICS.has(activeMetricKey)
      ? `$${(v / 1_000_000).toFixed(0)}M`
      : MULTIPLE_METRICS.has(activeMetricKey)
        ? `${v.toFixed(1)}x`
        : `${(v * 100).toFixed(0)}%`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card p-3 shadow-sm">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-md border border-hairline bg-card px-3 py-1.5 text-sm text-navy focus:border-gold focus:outline-none"
        >
          <option value="book">Book (All Funds)</option>
          {fundTrends.map((f) => (
            <option key={f.fundId} value={f.fundId}>
              {f.fundName}
            </option>
          ))}
        </select>

        <div className="h-4 w-px bg-hairline" />

        <div className="flex flex-wrap items-center gap-1.5">
          {(isBook ? BOOK_METRICS : FUND_METRICS).map((m) => (
            <button
              key={m.key}
              onClick={() => (isBook ? setBookMetric(m.key as BookMetric) : setFundMetric(m.key as FundMetric))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                activeMetricKey === m.key ? "border-navy bg-navy text-white" : "border-hairline bg-surface text-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
        {chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No data for this selection yet.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
                <YAxis tick={{ fontSize: 13, fill: "var(--muted)" }} tickFormatter={tickFormatter} />
                <Tooltip formatter={(value) => (value == null ? "n/a" : formatter(Number(value)))} contentStyle={{ fontSize: 13, borderRadius: 6 }} />
                <Line type="monotone" dataKey="value" stroke="var(--navy)" strokeWidth={2} dot={{ r: 3, stroke: "var(--gold)", fill: "var(--gold)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
