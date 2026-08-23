export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { FundKpiHeader } from "@/components/dashboard/FundKpiHeader";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { PortfolioTable } from "@/components/dashboard/PortfolioTable";
import { CompanyConcentrationBars } from "@/components/dashboard/CompanyConcentrationBars";
import { GpCommentaryPanel } from "@/components/dashboard/GpCommentaryPanel";
import { AiSummaryPanel } from "@/components/dashboard/AiSummaryPanel";
import { VehicleComparisonTable } from "@/components/dashboard/VehicleComparisonTable";
import { AllocationTargets } from "@/components/dashboard/AllocationTargets";
import {
  getFundById,
  getFundKpis,
  getFundTrendData,
  getFundPortfolioCompanies,
  getCompanyDevelopments,
  getFundGpCommentaryHistory,
  getFundAllocationVsTarget,
} from "@/lib/db/queries";

// Same glyph used across the dashboard - flags vehicle-total dollar amounts and
// net-basis ratios (fee-class-dependent) that don't yet have a family-office-
// specific capital-account layer on top of them.
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

type Props = {
  params: Promise<{ fundId: string }>;
};

export default async function FundDetailPage({ params }: Props) {
  const { fundId } = await params;

  const fund = await getFundById(fundId);
  if (!fund) notFound();

  const [kpisData, trendData, portfolioData, commentaryHistory, allocationTargets] = await Promise.all([
    getFundKpis(fundId),
    getFundTrendData(fundId),
    getFundPortfolioCompanies(fundId),
    getFundGpCommentaryHistory(fundId),
    getFundAllocationVsTarget(fundId),
  ]);

  const developmentsEntries = await Promise.all(
    portfolioData.companies.map(async (c) => {
      const devs = await getCompanyDevelopments(c.id);
      return [c.id, devs] as const;
    })
  );
  const developmentsByCompanyId = Object.fromEntries(developmentsEntries);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/funds" className="text-sm text-gold hover:underline">
          ← Back to Funds
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-navy">{fund.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {fund.gpName} · {fund.strategy} · {fund.sector} · Vintage {fund.vintageYear}
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">Performance KPIs</h2>
        <FundKpiHeader
          kpis={kpisData.kpis}
          latestPeriod={kpisData.latestPeriod}
          vintageYear={kpisData.vintageYear}
        />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium text-navy">Gross vs. Net / Vehicle Comparison</h2>
        <p className="mb-4 text-sm text-muted">
          Fee/carry drag by vehicle, and subscription-line impact where disclosed - {kpisData.latestPeriod ?? "latest period"}.
        </p>
        <VehicleComparisonTable kpis={kpisData.kpis} />
      </section>

      {allocationTargets.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-medium text-navy">Sector Allocation vs. Target</h2>
          <p className="mb-4 text-sm text-muted">
            Actual portfolio allocation against GP-mandated ranges.
          </p>
          <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
            <AllocationTargets targets={allocationTargets} />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">Trends</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-navy">
              NAV over time (main vehicle)
              <span title="Vehicle-total dollar amount, not the family office's own capital account">
                <VehicleLevelIcon />
              </span>
            </p>
            <TrendChart data={trendData} metric="nav" />
          </div>
          <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-navy">
              TVPI over time (main vehicle)
              <span title="Net line is fee-class-dependent - varies by LP, not a specific LP's own return">
                <VehicleLevelIcon />
              </span>
            </p>
            <TrendChart data={trendData} metric="tvpi" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-1.5 text-lg font-medium text-navy">
          Fund Life (Cash Flow)
          <span title="Vehicle-total dollar amounts, net basis - not the family office's own capital account">
            <VehicleLevelIcon />
          </span>
        </h2>
        <p className="mb-4 text-sm text-muted">
          Total Value (NAV + Distributed Capital, stacked) vs. Called Capital (gold line), by quarter -
          net, main vehicle. The stack clearing the line is the point TVPI passes 1.0x.
        </p>
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <CashFlowChart data={trendData} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">Portfolio Companies</h2>
        <div className="mb-6 rounded-lg border border-hairline bg-card p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-medium text-navy">
            NAV Contribution by Company — {portfolioData.latestPeriod ?? "latest period"}
          </h3>
          <p className="mb-3 text-xs text-muted">
            Ranked by share of this fund&rsquo;s NAV - concentration at a glance. Full detail (QoQ
            change, MOIC, committed/unfunded, status) is in the table below.
          </p>
          <CompanyConcentrationBars companies={portfolioData.companies} />
        </div>
        <PortfolioTable
          companies={portfolioData.companies}
          latestPeriod={portfolioData.latestPeriod}
          developmentsByCompanyId={developmentsByCompanyId}
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">GP Commentary History</h2>
        <GpCommentaryPanel history={commentaryHistory} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">AI Investment Summary</h2>
        <AiSummaryPanel fundId={fund.id} />
      </section>
    </div>
  );
}
