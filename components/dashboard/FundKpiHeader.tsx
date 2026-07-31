import type { FundKpi } from "@/lib/db/queries";
import { formatCurrency, formatPercent, formatMultiple } from "@/lib/format";

type Props = {
  kpis: FundKpi[];
  latestPeriod: string | null;
  vintageYear: number;
};

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
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {kpi.label}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted">NAV</p>
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
                <p className="text-xs text-muted">TVPI</p>
                <p className="font-semibold tabular-nums">{formatMultiple(kpi.tvpi)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">DPI</p>
                <p className="tabular-nums">{formatMultiple(kpi.dpi)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">RVPI</p>
                <p className="tabular-nums">{formatMultiple(kpi.rvpi)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">IRR</p>
                <p className="tabular-nums">{formatPercent(kpi.irr)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Unfunded</p>
                <p className="tabular-nums">{formatCurrency(kpi.unfundedCommitment)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Gross reflects capital called at the fund level, before fees and expenses. Net reflects the LP&rsquo;s own economic capital.
      </p>
    </div>
  );
}
