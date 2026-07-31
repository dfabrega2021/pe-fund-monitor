export const dynamic = "force-dynamic";

import Link from "next/link";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";
import { FlagsQueue } from "@/components/dashboard/FlagsQueue";
import { ReportingStatus } from "@/components/dashboard/ReportingStatus";
import { getConsolidatedExecutiveData, getOpenFlagsQueue, getReportingCompleteness } from "@/lib/db/queries";
import { formatQuarter } from "@/lib/format";

// Consolidated book view only - no by-fund toggle. A single fund's own numbers belong on
// its full detail page (/funds/[fundId]: vehicle comparison, allocation vs. target,
// portfolio companies, GP commentary), not a lighter duplicate living inside this page.
// This page's job is strictly "state of the whole book," so every section here should be
// something worth knowing before opening any individual fund's report.
export default async function FirmOverviewPage() {
  const consolidatedData = await getConsolidatedExecutiveData();

  // Pass the latest quarter from the already-loaded dashboard data so that
  // Reporting Status always shows the same period as the dashboard's active tab,
  // not the wall-clock calendar quarter which diverges from seeded data.
  const latestQ = consolidatedData.quarters.at(-1);
  const [reportingStatus, allFlags] = await Promise.all([
    getReportingCompleteness(latestQ?.year, latestQ?.quarter),
    getOpenFlagsQueue(),
  ]);

  // Executive Summary is "what do I need to know before opening any individual report this
  // quarter" - so Open Flags here is scoped to the latest reporting period, not every open
  // flag ever raised across the book's history. That full backlog still lives on Alerts,
  // unchanged, where an all-time queue is the right job.
  const flags = latestQ
    ? allFlags.filter((f) => f.reportYear === latestQ.year && f.reportQuarter === latestQ.quarter)
    : allFlags;

  const severityCounts = {
    critical: flags.filter((f) => f.severity === "critical").length,
    warning: flags.filter((f) => f.severity === "warning").length,
    info: flags.filter((f) => f.severity === "info").length,
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Executive Summary</h1>
        <p className="mt-1 text-sm text-muted">
          Consolidated view of the whole book. For a single fund&rsquo;s full detail page -
          vehicle comparison, allocation vs. target, portfolio companies, GP commentary -
          see the Funds tab.
        </p>
      </div>

      <ExecutiveDashboard data={consolidatedData} />

      <section>
        <h2 className="mb-4 text-lg font-medium text-navy">Reporting Status</h2>
        <ReportingStatus
          year={reportingStatus.year}
          quarter={reportingStatus.quarter}
          funds={reportingStatus.funds}
        />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-navy">
            Open Flags
            {latestQ && (
              <span className="ml-2 text-sm font-normal text-muted">
                {formatQuarter(latestQ.year, latestQ.quarter)}
              </span>
            )}
          </h2>
          <Link href="/alerts" className="text-sm text-gold hover:underline">
            View full history in Alerts →
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-negative bg-negative-light px-3 py-1 font-medium text-negative">
            {severityCounts.critical} Critical
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold bg-gold-light px-3 py-1 font-medium text-navy">
            {severityCounts.warning} Warning
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1 font-medium text-muted">
            {severityCounts.info} Info
          </span>
        </div>

        <FlagsQueue flags={flags.slice(0, 5)} />
        {flags.length > 5 && (
          <p className="mt-2 text-xs text-muted">
            Showing 5 of {flags.length} flags raised this quarter -{" "}
            <Link href="/alerts" className="text-gold hover:underline">
              view the rest in Alerts
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
