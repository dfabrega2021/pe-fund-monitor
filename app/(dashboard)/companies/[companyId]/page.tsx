export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyTrendChart } from "@/components/dashboard/CompanyTrendChart";
import { CompanyFlagsPanel } from "@/components/dashboard/CompanyFlagsPanel";
import { getCompanyDetail, getCompanyDevelopments, getOpenFlagsQueue } from "@/lib/db/queries";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/format";
import { LEVERAGE_THRESHOLD } from "@/lib/validation/rules";

type Props = {
  params: Promise<{ companyId: string }>;
};

// QoQ delta with both the absolute move and % change - proves this is a
// trend read, not a static snapshot, the same way the Executive Dashboard's
// KPI grid already shows deltas next to its own numbers.
function currencyDeltaLabel(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null || prior === 0) return null;
  const delta = current - prior;
  const pct = (delta / prior) * 100;
  return `${delta >= 0 ? "+" : ""}${formatCurrency(delta)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% QoQ)`;
}

function multipleDeltaLabel(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null || prior === 0) return null;
  const delta = current - prior;
  const pct = (delta / prior) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}x (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% QoQ)`;
}

export default async function CompanyDetailPage({ params }: Props) {
  const { companyId } = await params;

  const company = await getCompanyDetail(companyId);
  if (!company) notFound();

  const [developments, allFlags] = await Promise.all([
    getCompanyDevelopments(companyId),
    getOpenFlagsQueue(),
  ]);

  const flags = allFlags.filter((f) => f.companyId === companyId);
  const latest = company.history[company.history.length - 1];
  const prior = company.history.length >= 2 ? company.history[company.history.length - 2] : null;
  const valuationDelta = currencyDeltaLabel(latest?.valuation ?? null, prior?.valuation ?? null);
  const grossMoicDelta = multipleDeltaLabel(latest?.grossMoic ?? null, prior?.grossMoic ?? null);
  const hasLeverageData = company.history.some((h) => h.netDebtToEbitda != null);
  const hasRealizedData = latest?.realizedMoic != null || latest?.unrealizedMoic != null;
  const hasCapitalStructureData =
    latest?.debtFacilityCapacity != null || latest?.hedgedPct != null;
  const undrawnCapacity =
    latest?.debtFacilityCapacity != null && latest?.debtFacilityDrawn != null
      ? latest.debtFacilityCapacity - latest.debtFacilityDrawn
      : null;
  const investmentTypeLabel: Record<string, string> = {
    equity: "Equity",
    preferred_equity: "Preferred Equity",
    credit: "Credit",
    structured: "Structured",
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/companies" className="text-sm text-gold hover:underline">
          ← Back to Portfolio Companies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-navy">{company.companyName}</h1>
        <p className="mt-1 text-sm text-muted">
          <Link href={`/funds/${company.fundId}`} className="text-gold hover:underline">
            {company.fundName}
          </Link>
          {" · "}
          {company.sector ?? "Sector n/a"} · {company.geography ?? "Geography n/a"} · Status:{" "}
          <span className="capitalize">{company.status.replace("_", " ")}</span>
        </p>
      </div>

      {company.investmentThesis && (
        <blockquote className="rounded-lg border-l-4 border-gold bg-surface px-4 py-3 text-sm italic leading-relaxed text-navy">
          {company.investmentThesis}
        </blockquote>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-hairline bg-card p-3">
          <p className="text-xs text-muted">Investment Type</p>
          <p className="text-sm font-medium text-navy">{investmentTypeLabel[company.investmentType] ?? company.investmentType}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-card p-3">
          <p className="text-xs text-muted">Board Seats</p>
          <p className="text-sm font-medium text-navy">{company.boardSeats ?? "Not disclosed"}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-card p-3">
          <p className="text-xs text-muted">Ownership</p>
          <p className="text-sm font-medium text-navy">
            {latest?.ownershipPct != null ? `${latest.ownershipPct.toFixed(0)}%` : "Not disclosed"}
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-hairline bg-card p-3">
          <p className="text-xs text-muted">Cost Basis</p>
          <p className="text-sm font-medium tabular-nums text-navy">{formatCurrency(latest?.costBasis ?? null)}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-card p-3">
          <p className="text-xs text-muted">Committed Capital</p>
          <p className="text-sm font-medium tabular-nums text-navy">{formatCurrency(latest?.committedCapital ?? null)}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-card p-3">
          <p className="text-xs text-muted">Unfunded</p>
          <p className="text-sm font-medium tabular-nums text-navy">{formatCurrency(latest?.unfundedCapital ?? null)}</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <p className="text-xs text-muted">Latest Valuation</p>
          <p className="text-xl font-semibold tabular-nums text-navy">{formatCurrency(latest?.valuation ?? null)}</p>
          <p className="text-xs text-muted">{latest?.period ?? "—"}</p>
          {valuationDelta && (
            <p
              className={`mt-1 text-xs tabular-nums ${
                (latest?.valuation ?? 0) >= (prior?.valuation ?? 0) ? "text-positive" : "text-negative"
              }`}
            >
              {valuationDelta}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <p className="text-xs text-muted">Gross MOIC</p>
          <p className="text-xl font-semibold tabular-nums text-navy">
            {latest?.grossMoic != null ? formatMultiple(latest.grossMoic) : "At Cost"}
          </p>
          {grossMoicDelta && (
            <p
              className={`mt-1 text-xs tabular-nums ${
                (latest?.grossMoic ?? 0) >= (prior?.grossMoic ?? 0) ? "text-positive" : "text-negative"
              }`}
            >
              {grossMoicDelta}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <p className="text-xs text-muted">Gross IRR</p>
          <p className="text-xl font-semibold tabular-nums text-navy">{formatPercent(latest?.grossIrr ?? null)}</p>
        </div>
        {hasLeverageData && (
          <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
            <p className="text-xs text-muted">Net Debt / EBITDA</p>
            <p className="text-xl font-semibold tabular-nums text-navy">
              {latest?.netDebtToEbitda != null ? `${latest.netDebtToEbitda.toFixed(1)}x` : "—"}
            </p>
            {latest?.netDebtToEbitda != null && latest.netDebtToEbitda >= LEVERAGE_THRESHOLD && (
              <span
                className="mt-1 inline-flex items-center rounded-full bg-negative-light px-2 py-0.5 text-xs font-medium text-negative"
                title={`Above the ${LEVERAGE_THRESHOLD.toFixed(1)}x internal leverage threshold.`}
              >
                Above {LEVERAGE_THRESHOLD.toFixed(1)}x threshold
              </span>
            )}
          </div>
        )}
      </section>

      {hasCapitalStructureData && (
        <section>
          <h2 className="mb-1 text-lg font-medium text-navy">Capital Structure &amp; Hedging</h2>
          <p className="mb-4 text-sm text-muted">
            Opco-level leverage and commodity risk protection. Only shown for positions that disclose it.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {latest?.debtFacilityCapacity != null && (
              <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
                <p className="text-xs text-muted">Debt Facility Drawn / Capacity</p>
                <p className="text-xl font-semibold tabular-nums text-navy">
                  {formatCurrency(latest.debtFacilityDrawn ?? null)} / {formatCurrency(latest.debtFacilityCapacity)}
                </p>
                {undrawnCapacity != null && (
                  <p className="text-xs text-muted">{formatCurrency(undrawnCapacity)} undrawn headroom</p>
                )}
              </div>
            )}
            {latest?.hedgedPct != null && (
              <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
                <p className="text-xs text-muted">Hedge Coverage</p>
                <p className="text-xl font-semibold tabular-nums text-navy">{latest.hedgedPct.toFixed(0)}%</p>
                {latest.hedgeFloorPrice != null && (
                  <p className="text-xs text-muted">
                    Floor {latest.hedgeFloorPrice.toFixed(2)} {latest.hedgePriceUnit ?? ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {hasRealizedData && (
        <section>
          <h2 className="mb-1 text-lg font-medium text-navy">Realized vs. Unrealized</h2>
          <p className="mb-4 text-sm text-muted">
            Splits Gross MOIC into cash already returned versus the position&rsquo;s current mark.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
              <p className="text-xs text-muted">Realized MOIC</p>
              <p className="text-xl font-semibold tabular-nums text-navy">
                {latest?.realizedMoic != null ? formatMultiple(latest.realizedMoic) : "—"}
              </p>
              <p className="text-xs text-muted">{formatCurrency(latest?.realizedProceeds ?? null)} distributed</p>
            </div>
            <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
              <p className="text-xs text-muted">Unrealized MOIC</p>
              <p className="text-xl font-semibold tabular-nums text-navy">
                {latest?.unrealizedMoic != null ? formatMultiple(latest.unrealizedMoic) : "—"}
              </p>
              <p className="text-xs text-muted">
                {formatCurrency(latest?.valuation ?? null)} current mark
                {latest?.realizedProceeds ? `, net of ${formatCurrency(latest.realizedProceeds)} already distributed` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
              <p className="text-xs text-muted">Total MOIC (Gross)</p>
              <p className="text-xl font-semibold tabular-nums text-navy">
                {latest?.grossMoic != null ? formatMultiple(latest.grossMoic) : "At Cost"}
              </p>
              <p className="text-xs text-muted">As reported</p>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">History Since Investment</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-navy">Valuation</p>
            <CompanyTrendChart data={company.history} metric="valuation" />
          </div>
          <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-navy">Gross MOIC</p>
            <CompanyTrendChart data={company.history} metric="grossMoic" />
          </div>
        </div>
      </section>

      <CompanyFlagsPanel
        flags={flags}
        latestYear={latest?.year ?? null}
        latestQuarter={latest?.quarter ?? null}
      />

      <section>
        <h2 className="mb-1 text-lg font-medium text-navy">Key Milestones</h2>
        <p className="mb-4 text-sm text-muted">Most recent first.</p>
        {developments.length === 0 ? (
          <p className="text-sm text-muted">No significant developments logged across quarters.</p>
        ) : (
          <ol className="space-y-3 border-l-2 border-hairline pl-4">
            {[...developments].reverse().map((d) => (
              <li key={d.id} className="relative">
                <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-gold" />
                <span className="mr-2 inline-block rounded-full bg-gold-light px-2 py-0.5 text-xs font-semibold text-navy">
                  {d.period}
                </span>
                <span className="text-sm leading-relaxed text-navy">{d.developmentText}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
