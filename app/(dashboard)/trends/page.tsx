export const dynamic = "force-dynamic";

// Retired from nav (no DashboardNav link) as of the 2-fund demo: with exactly one fund per
// asset class, there's no same-strategy peer for either fund to compare against, and
// cross-strategy comparison is the misleading pattern this app deliberately avoids
// elsewhere (see irrIsApproximate, CLAUDE.md). Route and component are kept intentionally -
// reactivate as a proper same-strategy overlay (plus benchmark line) once the book has 2+
// funds sharing a strategy. Reachable directly at /trends but not linked anywhere.
import { TrendsExplorer } from "@/components/dashboard/TrendsExplorer";
import { getBookTrendData, getFundOverviewRows, getFundTrendData } from "@/lib/db/queries";

export default async function FundComparisonPage() {
  const [bookTrend, funds] = await Promise.all([getBookTrendData(), getFundOverviewRows()]);

  // Fetched upfront since the demo book is 2 funds - at real 40+ fund scale
  // this would move to fetching one fund's trend on demand (an API route)
  // rather than pulling every fund's full history on every page load.
  const fundTrends = await Promise.all(
    funds.map(async (f) => ({ fundId: f.id, fundName: f.name, data: await getFundTrendData(f.id) }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Fund Comparison</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a metric and see it move across every reported quarter - at the book level or
          across individual funds.
        </p>
      </div>
      <TrendsExplorer bookTrend={bookTrend} fundTrends={fundTrends} />
    </div>
  );
}
