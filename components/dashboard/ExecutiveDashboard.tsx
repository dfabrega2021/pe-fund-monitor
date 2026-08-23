"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import type { FundExecutiveData } from "@/lib/db/queries";
import { formatCurrency, formatPercent, formatMultiple } from "@/lib/format";
import { MOIC_DECLINE_THRESHOLD } from "@/lib/validation/rules";
import { ConcentrationDonut } from "./ConcentrationDonut";

type Props = {
  data: FundExecutiveData;
};

function moicDelta(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null) return null;
  const d = current - prior;
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}x QoQ`;
}

function irrDelta(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null) return null;
  const d = (current - prior) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts QoQ`;
}

// Adapted from irrDelta for values already stored as percentage points (not decimals).
function pctPointsDelta(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null) return null;
  const d = current - prior;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts QoQ`;
}

function currencyDelta(current: number | null, prior: number | null): { text: string; positive: boolean } | null {
  if (current == null || prior == null) return null;
  const d = current - prior;
  return { text: `${d >= 0 ? "+" : ""}${formatCurrency(d)} QoQ`, positive: d >= 0 };
}

export function ExecutiveDashboard({ data }: Props) {
  const { quarters, extras } = data;
  const [selected, setSelected] = useState(quarters.length - 1);

  const kpi = quarters[selected];
  const prior = selected > 0 ? quarters[selected - 1] : null;
  const extra = extras[selected];

  const moicIrrSeries = useMemo(
    () => quarters.map((q) => ({ period: q.period, "Gross MOIC": q.grossMoic, "Gross IRR": q.grossIrr })),
    [quarters]
  );
  const atCostSeries = useMemo(
    () => quarters.map((q) => ({ period: q.period, "% NAV at Cost": q.pctNavAtCost })),
    [quarters]
  );
  // Computed explicitly rather than via Recharts' domain={[0, "dataMax + 10"]}
  // string-expression syntax - that produced a garbage axis label (a value in
  // the tens of millions on a 0-100% scale) in practice. A plain number here
  // is unambiguous regardless of what's going on inside Recharts' own parsing.
  const atCostAxisMax = Math.min(
    100,
    Math.ceil((Math.max(0, ...atCostSeries.map((d) => d["% NAV at Cost"] ?? 0)) + 10) / 10) * 10
  );

  const maxAbsDelta = Math.max(1e-6, ...extra.notableMovement.map((m) => Math.abs(m.moicDelta)));

  // Manager (GP) concentration, not portfolio-company concentration - a single
  // company's share of book NAV is a fund-level question (already covered by
  // checkSingleNameConcentration) that stops meaning anything at book scale;
  // how much sits with one manager across their funds is the one that matters
  // here. No color tone (unlike the old company-level card) since there isn't
  // yet a formal validation rule with defined GP-concentration thresholds -
  // flagging a specific % as "risky" here would overstate rigor that doesn't
  // exist yet.
  const largestManager = extra.managerConcentration[0] ?? null;
  const largestManagerPct = largestManager?.pctOfNav ?? null;
  const top5ManagerPct = extra.managerConcentration
    .filter((m) => !m.gpName.startsWith("Other Managers ("))
    .reduce((sum, m) => sum + m.pctOfNav, 0);

  const unmarkedCostBasis = extra.unmarkedPositions.reduce((sum, p) => sum + (p.costBasis ?? 0), 0);
  const unmarkedFundCount = new Set(extra.unmarkedPositions.map((p) => p.fundId).filter((id): id is string => !!id))
    .size;

  return (
    <div className="space-y-6">
      {/* Quarter selector - a dropdown plus prev/next, not a flat row of pill
          buttons. A tab-per-quarter row reads fine at 4 quarters and turns
          into an unreadable wall of buttons well before reporting history
          reaches a couple of years - this control stays exactly as wide
          regardless of how many quarters the book accumulates. */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelected((s) => Math.max(0, s - 1))}
          disabled={selected === 0}
          aria-label="Previous quarter"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-navy transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          ‹
        </button>
        <select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          aria-label="Select quarter"
          className="rounded-md border border-hairline bg-card px-3 py-1.5 text-sm font-medium text-navy"
        >
          {quarters.map((q, i) => (
            <option key={q.period} value={i}>
              {q.period}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSelected((s) => Math.min(quarters.length - 1, s + 1))}
          disabled={selected === quarters.length - 1}
          aria-label="Next quarter"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-navy transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          ›
        </button>
        {selected !== quarters.length - 1 && (
          <button onClick={() => setSelected(quarters.length - 1)} className="text-xs font-medium text-gold hover:underline">
            Jump to latest
          </button>
        )}
      </div>

      {/* KPI grid - auto-fit/minmax rather than a fixed column count tied to
          today's card total, so a partial last row stretches to fill the
          width instead of leaving a large empty gap (this grid's card count
          has already changed twice this session and will again). */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        <KpiCard
          label="Total NAV"
          value={formatCurrency(kpi.totalNav)}
          deltaObj={currencyDelta(kpi.totalNav, prior?.totalNav ?? null)}
          hint="Sum of vehicle-level NAV, gross, across all tracked funds"
          vehicleLevel
        />
        <KpiCard
          label="Gross MOIC"
          value={formatMultiple(kpi.grossMoic)}
          delta={moicDelta(kpi.grossMoic, prior?.grossMoic ?? null)}
          hint="Dollar-weighted by each vehicle's total called capital, not the family office's own commitment mix"
          vehicleLevel
        />
        <KpiCard
          label="Gross DPI"
          value={formatMultiple(kpi.grossDpi)}
          delta={moicDelta(kpi.grossDpi, prior?.grossDpi ?? null)}
          hint="Realized proceeds / paid-in - the cash-back share of Gross MOIC"
          vehicleLevel
        />
        <KpiCard
          label="Gross IRR"
          value={formatPercent(kpi.grossIrr)}
          delta={irrDelta(kpi.grossIrr, prior?.grossIrr ?? null)}
          hint={kpi.irrIsApproximate ? "Commitment-weighted avg. across funds, not a true pooled IRR" : undefined}
          vehicleLevel
        />
        <KpiCard
          label="Net MOIC"
          value={formatMultiple(kpi.netMoicAllVehicles)}
          delta={moicDelta(kpi.netMoicAllVehicles, prior?.netMoicAllVehicles ?? null)}
          hint="Across every vehicle - main + co-invest, not just the main fund"
          vehicleLevel
        />
        <KpiCard
          label="Net DPI"
          value={formatMultiple(kpi.netDpiAllVehicles)}
          delta={moicDelta(kpi.netDpiAllVehicles, prior?.netDpiAllVehicles ?? null)}
          hint="Realized proceeds / paid-in, across every vehicle - the cash-back share of Net MOIC"
          vehicleLevel
        />
        <KpiCard
          label="Net IRR"
          value={formatPercent(kpi.netIrrAllVehicles)}
          delta={irrDelta(kpi.netIrrAllVehicles, prior?.netIrrAllVehicles ?? null)}
          hint={
            kpi.irrIsApproximate
              ? "Commitment-weighted avg. across funds and vehicles, not a true pooled IRR"
              : undefined
          }
          vehicleLevel
        />
        {kpi.coinvestVehicleName && (
          <>
            <KpiCard
              label={`Net MOIC (${kpi.coinvestVehicleName})`}
              value={formatMultiple(kpi.netMoicCoinvest)}
              delta={moicDelta(kpi.netMoicCoinvest, prior?.netMoicCoinvest ?? null)}
              vehicle="co_invest"
              vehicleLevel
            />
            <KpiCard
              label={`Net DPI (${kpi.coinvestVehicleName})`}
              value={formatMultiple(kpi.netDpiCoinvest)}
              delta={moicDelta(kpi.netDpiCoinvest, prior?.netDpiCoinvest ?? null)}
              vehicle="co_invest"
              vehicleLevel
            />
            <KpiCard
              label={`Net IRR (${kpi.coinvestVehicleName})`}
              value={formatPercent(kpi.netIrrCoinvest)}
              delta={irrDelta(kpi.netIrrCoinvest, prior?.netIrrCoinvest ?? null)}
              vehicle="co_invest"
              vehicleLevel
            />
          </>
        )}
        <KpiCard
          label="Unfunded Commitment"
          value={formatCurrency(kpi.unfundedCommitment)}
          deltaObj={currencyDelta(kpi.unfundedCommitment, prior?.unfundedCommitment ?? null)}
          vehicleLevel
        />
        <KpiCard
          label="Cumulative Distributions"
          value={formatCurrency(kpi.cumulativeDistributions)}
          deltaObj={currencyDelta(kpi.cumulativeDistributions, prior?.cumulativeDistributions ?? null)}
          vehicleLevel
        />
        <KpiCard
          label="Quarterly Valuation Swing"
          value={kpi.quarterlyValuationSwingPct != null ? `${kpi.quarterlyValuationSwingPct >= 0 ? "+" : ""}${kpi.quarterlyValuationSwingPct.toFixed(1)}%` : "—"}
          hint="Gross basis, adjusted for calls/distributions"
          tone={kpi.quarterlyValuationSwingPct != null ? (kpi.quarterlyValuationSwingPct >= 0 ? "positive" : "negative") : undefined}
          vehicleLevel
        />
        <KpiCard
          label="Total Commitments"
          value={formatCurrency(kpi.totalCommitments)}
          hint="Called + unfunded, gross"
          vehicleLevel
        />
        <KpiCard
          label="Deployment Ratio"
          value={kpi.deploymentRatioPct != null ? `${kpi.deploymentRatioPct.toFixed(1)}%` : "—"}
          delta={pctPointsDelta(kpi.deploymentRatioPct, prior?.deploymentRatioPct ?? null)}
          hint="Called capital / total commitment"
          vehicleLevel
        />
        <KpiCard
          label="Manager Concentration"
          value={largestManagerPct != null ? `${largestManagerPct.toFixed(1)}%` : "—"}
          hint={largestManager?.gpName}
          secondary={`Top 5: ${top5ManagerPct.toFixed(1)}%`}
          vehicleLevel
        />
      </div>

      {/* Since-inception charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-navy">
            Gross MOIC / IRR — Since Inception
            <span className="text-xs font-normal text-muted">
              ({quarters.length} {quarters.length === 1 ? "quarter" : "quarters"} of reporting history)
            </span>
            <span title="Dollar-weighted by each vehicle's total called capital, not the family office's own commitment mix">
              <VehicleLevelIcon />
            </span>
          </h3>
          {kpi.irrIsApproximate && (
            <p className="mb-2 text-xs text-muted">
              Blended across every fund&rsquo;s main vehicle - can mask one strategy underperforming behind another&rsquo;s gains.
            </p>
          )}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={moicIrrSeries} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
                <YAxis
                  yAxisId="moic"
                  tick={{ fontSize: 13, fill: "var(--muted)" }}
                  tickFormatter={(v) => `${v.toFixed(1)}x`}
                />
                <YAxis
                  yAxisId="irr"
                  orientation="right"
                  tick={{ fontSize: 13, fill: "var(--muted)" }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === "Gross IRR" ? formatPercent(Number(value)) : formatMultiple(Number(value))
                  }
                  contentStyle={{ fontSize: 13, borderRadius: 6 }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Line
                  yAxisId="moic"
                  type="monotone"
                  dataKey="Gross MOIC"
                  stroke="var(--navy)"
                  strokeWidth={2}
                  dot={(props) => {
                    const isSelected = props.index === selected;
                    return (
                      <circle
                        key={`moic-dot-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        r={isSelected ? 5 : 3}
                        fill="var(--navy)"
                        stroke={isSelected ? "var(--gold)" : "none"}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    );
                  }}
                />
                <Line
                  yAxisId="irr"
                  type="monotone"
                  dataKey="Gross IRR"
                  stroke="var(--gold)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={(props) => {
                    const isSelected = props.index === selected;
                    return (
                      <circle
                        key={`irr-dot-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        r={isSelected ? 5 : 3}
                        fill="var(--gold)"
                        stroke={isSelected ? "var(--navy)" : "none"}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-medium text-navy">Notable MOIC Movement vs Prior Quarter</h3>
          <p className="mb-3 text-xs text-muted">Moves of at least {MOIC_DECLINE_THRESHOLD.toFixed(2)}x, top 3.</p>
          {extra.notableMovement.length === 0 ? (
            <p className="text-sm text-muted">
              {selected === 0
                ? "No prior quarter to compare against."
                : `No position moved ${MOIC_DECLINE_THRESHOLD.toFixed(2)}x or more this quarter.`}
            </p>
          ) : (
            <div className="space-y-3">
              {extra.notableMovement.map((m) => {
                const isPositive = m.moicDelta >= 0;
                const widthPct = (Math.abs(m.moicDelta) / maxAbsDelta) * 100;
                return (
                  <div key={m.companyId} className="flex items-center gap-2 text-sm">
                    <Link href={`/companies/${m.companyId}`} className="w-40 shrink-0 hover:underline">
                      <p className="truncate text-navy">{m.companyName}</p>
                      <p className="truncate text-xs text-muted">{m.fundName}</p>
                    </Link>
                    <div className="h-2.5 flex-1 rounded-full bg-surface">
                      <div
                        className={`h-2.5 rounded-full ${isPositive ? "bg-positive" : "bg-negative"}`}
                        style={{ width: `${Math.max(widthPct, 3)}%` }}
                      />
                    </div>
                    <span
                      className={`w-16 shrink-0 text-right tabular-nums ${isPositive ? "text-positive" : "text-negative"}`}
                    >
                      {isPositive ? "+" : ""}
                      {m.moicDelta.toFixed(2)}x
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Concentration + at-cost trend, both scoped to the selected quarter */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-navy">
            NAV Concentration by Manager — {kpi.period}
            <span title="Weighted by each vehicle's total NAV, not the family office's own dollar exposure per fund">
              <VehicleLevelIcon />
            </span>
          </h3>
          <p className="mb-2 text-xs text-muted">Share of book NAV by GP.</p>
          <ConcentrationDonut
            data={extra.managerConcentration.map((m) => ({ label: m.gpName, value: m.nav, pct: m.pctOfNav }))}
            emptyMessage="No fund NAV reported for this quarter."
          />
        </div>

        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-navy">
            % of NAV Held at Cost
            <span title="Weighted by each vehicle's total portfolio value, not the family office's own dollar exposure per fund">
              <VehicleLevelIcon />
            </span>
          </h3>
          <p className="mb-2 text-xs text-muted">
            Share of portfolio value still unmarked (Gross MOIC not yet meaningful).
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={atCostSeries} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fontSize: 13, fill: "var(--muted)" }} />
                <YAxis
                  tick={{ fontSize: 13, fill: "var(--muted)" }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, atCostAxisMax]}
                />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} contentStyle={{ fontSize: 13, borderRadius: 6 }} />
                <Line
                  type="monotone"
                  dataKey="% NAV at Cost"
                  stroke="var(--negative)"
                  strokeWidth={2}
                  dot={(props) => {
                    const isSelected = props.index === selected;
                    return (
                      <circle
                        key={`atcost-dot-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        r={isSelected ? 5 : 3}
                        fill="var(--negative)"
                        stroke={isSelected ? "var(--navy)" : "none"}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Unmarked positions - a headline stat plus the full list, each row
          naming both the company and the fund it belongs to. At real (40+
          fund) scale this list could get long - if it ever gets unwieldy,
          the header stats are the "read this, not the rows" summary; for now
          the table is small enough to just show. */}
      <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-navy">Unmarked (At Cost) Positions — {kpi.period}</h3>
        {extra.unmarkedPositions.length === 0 ? (
          <p className="text-sm text-muted">Every position has a Gross MOIC this quarter.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-navy">{extra.unmarkedPositions.length}</p>
                <p className="text-xs text-muted">
                  position{extra.unmarkedPositions.length === 1 ? "" : "s"} at cost
                  {unmarkedFundCount > 0 && ` across ${unmarkedFundCount} fund${unmarkedFundCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums text-navy">{formatCurrency(unmarkedCostBasis)}</p>
                <p className="text-xs text-muted">invested capital not yet marked</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums text-navy">
                  {kpi.pctNavAtCost != null ? `${kpi.pctNavAtCost.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-muted">of book NAV</p>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Fund</th>
                  <th className="pb-2 font-medium">Invested Capital</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {extra.unmarkedPositions.map((p) => (
                  <tr key={p.companyId} className="border-b border-hairline last:border-0">
                    <td className="py-2">
                      <Link href={`/companies/${p.companyId}`} className="text-navy hover:underline">
                        {p.companyName}
                      </Link>
                    </td>
                    <td className="py-2 text-muted">
                      {p.fundId ? (
                        <Link href={`/funds/${p.fundId}`} className="hover:text-navy hover:underline">
                          {p.fundName}
                        </Link>
                      ) : (
                        (p.fundName ?? "—")
                      )}
                    </td>
                    <td className="py-2 tabular-nums text-muted">{formatCurrency(p.costBasis)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.quartersAtCost >= 3 ? "bg-negative-light text-negative" : "bg-gold-light text-gold"
                        }`}
                      >
                        {p.quartersAtCost} {p.quartersAtCost === 1 ? "qtr" : "qtrs"} at cost
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// Small stack/layers glyph flagging figures that are vehicle-level (as reported
// to every LP of that vehicle) and don't yet have a family-office-specific
// capital-account layer. Native title attr gives a hover tooltip with no new
// dependency - explained verbally in the walkthrough, this is just a visual anchor.
function VehicleLevelIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="inline-block shrink-0 align-middle text-muted"
      aria-hidden="true"
    >
      <path d="M8 2 L14 5 L8 8 L2 5 Z" strokeLinejoin="round" />
      <path d="M2 8 L8 11 L14 8" strokeLinejoin="round" />
      <path d="M2 11 L8 14 L14 11" strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaObj,
  hint,
  secondary,
  tone,
  vehicle,
  vehicleLevel,
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaObj?: { text: string; positive: boolean } | null;
  hint?: string;
  secondary?: string;
  tone?: "positive" | "negative" | "warning";
  vehicle?: "main" | "co_invest";
  vehicleLevel?: boolean;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-card p-3 shadow-sm">
      {vehicle && (
        <span
          className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            vehicle === "main"
              ? "border border-hairline bg-surface text-muted"
              : "bg-gold-light text-gold"
          }`}
        >
          {vehicle === "main" ? "Main Fund" : "Co-Invest"}
        </span>
      )}
      <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {vehicleLevel && (
          <span title="Vehicle-level, as reported to every LP — family-office-specific capital account not yet layered in">
            <VehicleLevelIcon />
          </span>
        )}
      </p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === "positive"
            ? "text-positive"
            : tone === "negative"
              ? "text-negative"
              : tone === "warning"
                ? "text-gold"
                : "text-navy"
        }`}
      >
        {value}
      </p>
      {delta && <p className="mt-1 text-xs tabular-nums text-muted">{delta}</p>}
      {deltaObj && (
        <p className={`mt-1 text-xs tabular-nums ${deltaObj.positive ? "text-positive" : "text-negative"}`}>
          {deltaObj.text}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {secondary && <p className="mt-1 text-xs text-muted">{secondary}</p>}
    </div>
  );
}
