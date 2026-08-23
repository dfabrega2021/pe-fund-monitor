import type { FundKpi } from "@/lib/db/queries";
import { formatCurrency, formatPercent, formatMultiple } from "@/lib/format";

type Props = {
  kpis: FundKpi[];
  latestPeriod: string | null;
  vintageYear: number;
};

// Same glyph as the Executive Summary's KpiCard - flags vehicle-level figures
// (as reported to every LP of that vehicle) that don't yet have a
// family-office-specific capital-account layer on top of them.
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

export function FundKpiHeader({ kpis, latestPeriod, vintageYear }: Props) {
  const currentYear = new Date().getFullYear();
  const monthsSinceVintage = (currentYear - vintageYear) * 12 + 6;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        {latestPeriod && (
          <span className="text-sm font-medium text-muted">As of {latestPeriod}</span>
        )}
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted">
          ~{monthsSinceVintage} months since vintage ({vintageYear})
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <div
            key={`${kpi.vehicleId}-${kpi.returnBasis}`}
            className="rounded-lg border border-hairline bg-card p-4 shadow-sm"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{kpi.label}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  NAV
                  <span title="Vehicle-total dollar amount, not one LP's own capital account">
                    <VehicleLevelIcon />
                  </span>
                </p>
                <p className="font-semibold tabular-nums">{formatCurrency(kpi.nav)}</p>
                {kpi.qoqNavChangePct != null && (
                  <p
                    className={`text-xs tabular-nums ${
                      kpi.qoqNavChangePct >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {kpi.qoqNavChangePct >= 0 ? "+" : ""}
                    {kpi.qoqNavChangePct.toFixed(1)}% QoQ
                  </p>
                )}
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  TVPI
                  {kpi.returnBasis === "net" && (
                    <span title="Fee-class-dependent - varies by LP, not a specific LP's own return">
                      <VehicleLevelIcon />
                    </span>
                  )}
                </p>
                <p className="font-semibold tabular-nums">{formatMultiple(kpi.tvpi)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  DPI
                  {kpi.returnBasis === "net" && (
                    <span title="Fee-class-dependent - varies by LP, not a specific LP's own return">
                      <VehicleLevelIcon />
                    </span>
                  )}
                </p>
                <p className="tabular-nums">{formatMultiple(kpi.dpi)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  RVPI
                  {kpi.returnBasis === "net" && (
                    <span title="Fee-class-dependent - varies by LP, not a specific LP's own return">
                      <VehicleLevelIcon />
                    </span>
                  )}
                </p>
                <p className="tabular-nums">{formatMultiple(kpi.rvpi)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  IRR
                  {kpi.returnBasis === "net" && (
                    <span title="Fee-class-dependent - varies by LP, not a specific LP's own return">
                      <VehicleLevelIcon />
                    </span>
                  )}
                </p>
                <p className="tabular-nums">{formatPercent(kpi.irr)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  Unfunded
                  <span title="Vehicle-total dollar amount, not one LP's own capital account">
                    <VehicleLevelIcon />
                  </span>
                </p>
                <p className="tabular-nums">{formatCurrency(kpi.unfundedCommitment)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Gross reflects capital called at the fund level, before fees and expenses. Net reflects fees and
        carry at the vehicle&rsquo;s highest fee class, as reported to all LPs.
      </p>
    </div>
  );
}
