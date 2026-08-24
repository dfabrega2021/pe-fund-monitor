import { db } from "./index";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import {
  funds,
  fundVehicles,
  fundReports,
  fundMetrics,
  validationFlags,
  portfolioCompanies,
  portfolioCompanyValuations,
  portfolioCompanyDevelopments,
  gpCommentary,
  aiSummaries,
  fundAllocationTargets,
} from "./schema";
import { parseNum, quarterSortKey, formatQuarter, getCurrentQuarter, type AssetClass } from "../format";
import { MOIC_DECLINE_THRESHOLD } from "../validation/rules";

const REPORTING_DOCUMENT_TYPES = ["valuation_letter", "lp_letter", "tear_sheets"] as const;

export type { AssetClass };

export type FundOverviewRow = {
  id: string;
  name: string;
  strategy: string;
  assetClass: AssetClass;
  sector: string | null;
  commitmentAmount: number;
  currentNav: number | null;
  qoqNavChangePct: number | null;
  tvpi: number | null;
  dpi: number | null;
  netIrr: number | null;
  netIrrLabel: string;
  unfundedCommitment: number | null;
  openFlags: { message: string; severity: "info" | "warning" | "critical" }[];
  lastReportDate: Date | null;
  lastReportQuarter: string | null;
};

export type OpenFlagRow = {
  id: string;
  fundId: string;
  fundName: string;
  reportYear: number;
  reportQuarter: number;
  fieldName: string;
  flagType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  createdAt: Date;
  category: "Fund Metrics" | "Portfolio Company" | "Commentary" | "Other";
  companyId: string | null; // set when the flag references a specific portfolio company
  companyName: string | null;
};

export type FundKpi = {
  vehicleId: string;
  vehicleName: string;
  vehicleType: string;
  returnBasis: "gross" | "net";
  label: string;
  nav: number | null;
  tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  irr: number | null;
  unfundedCommitment: number | null;
  qoqNavChangePct: number | null;
  subscriptionLineBalance: number | null;
  unleveredIrr: number | null;
};

export type TrendPoint = {
  period: string;
  year: number;
  quarter: number;
  grossNav: number | null;
  netNav: number | null;
  grossTvpi: number | null;
  netTvpi: number | null;
  netCalledCapital: number | null;
  netDistributedCapital: number | null;
  netDpi: number | null;
  netRvpi: number | null;
  netIrr: number | null;
};

export type BookTrendPoint = {
  period: string;
  year: number;
  quarter: number;
  totalNav: number;
  totalCommitment: number;
  fundsReporting: number;
};

export type GpCommentaryHistoryEntry = {
  period: string;
  reportYear: number;
  reportQuarter: number;
  rawText: string | null;
  gpStatedNotableChanges: string[];
  macroRiskMentions: string[];
  advanceCapitalCallNotes: string[];
};

export type PortfolioCompanyRow = {
  id: string;
  companyName: string;
  sector: string | null;
  status: string;
  valuation: number | null;
  priorValuation: number | null;
  qoqChangePct: number | null;
  grossMoic: number | null;
  pctOfFundNav: number | null;
  costBasis: number | null;
  committedCapital: number | null;
  unfundedCapital: number | null; // committedCapital - costBasis, when both are known
  netDebtToEbitda: number | null; // credit/leveraged positions only, null otherwise
  // Consecutive quarters (ending at and including the latest) where gross
  // MOIC was null, i.e. still "at cost." A single null quarter is normal for
  // a freshly funded position; PortfolioTable escalates the badge once this
  // crosses AT_COST_STREAK_THRESHOLD (see lib/validation/rules.ts) - this
  // used to be a separate validationFlags row, now it's computed directly
  // here since the badge only needs the current state, not a flag history.
  consecutiveAtCostQuarters: number;
};

export type CompanyDevelopment = {
  id: string;
  developmentText: string;
  period: string;
  reportYear: number;
  reportQuarter: number;
  taggedDate: Date | null;
};

export type GpCommentaryData = {
  rawText: string | null;
  gpStatedNotableChanges: string[];
  period: string;
};

type MetricRow = {
  fundId: string;
  reportYear: number;
  reportQuarter: number;
  returnBasis: "gross" | "net";
  vehicleId: string;
  vehicleName: string;
  vehicleType: string;
  nav: string | null;
  tvpi: string | null;
  dpi: string | null;
  rvpi: string | null;
  irr: string | null;
  unfundedCommitment: string | null;
  calledCapital: string | null;
  distributedCapital: string | null;
  subscriptionLineBalance: string | null;
  unleveredIrr: string | null;
  uploadedAt: Date;
  // Vehicle-level total commitment (every LP) vs. the family office's own
  // commitment to that same vehicle - see schema.ts comment on
  // fundVehicles.familyOfficeCommitmentAmount. Both null for vehicles created
  // from a real upload, since the QIR pipeline never populates the latter.
  vehicleCommitmentAmount: string | null;
  familyOfficeCommitmentAmount: string | null;
};

async function getAllMetricsWithVehicles(): Promise<MetricRow[]> {
  return db
    .select({
      fundId: fundMetrics.fundId,
      reportYear: fundMetrics.reportYear,
      reportQuarter: fundMetrics.reportQuarter,
      returnBasis: fundMetrics.returnBasis,
      vehicleId: fundMetrics.vehicleId,
      vehicleName: fundVehicles.vehicleName,
      vehicleType: fundVehicles.vehicleType,
      nav: fundMetrics.nav,
      tvpi: fundMetrics.tvpi,
      dpi: fundMetrics.dpi,
      rvpi: fundMetrics.rvpi,
      irr: fundMetrics.irr,
      unfundedCommitment: fundMetrics.unfundedCommitment,
      calledCapital: fundMetrics.calledCapital,
      distributedCapital: fundMetrics.distributedCapital,
      subscriptionLineBalance: fundMetrics.subscriptionLineBalance,
      unleveredIrr: fundMetrics.unleveredIrr,
      uploadedAt: fundReports.uploadedAt,
      vehicleCommitmentAmount: fundVehicles.commitmentAmount,
      familyOfficeCommitmentAmount: fundVehicles.familyOfficeCommitmentAmount,
    })
    .from(fundMetrics)
    .innerJoin(fundVehicles, eq(fundMetrics.vehicleId, fundVehicles.id))
    .innerJoin(fundReports, eq(fundMetrics.reportId, fundReports.id));
}

// Family office's ownership % of a given vehicle (their own commitment over
// the vehicle's total commitment across every LP). Null when either figure is
// missing - e.g. a vehicle created from a real upload, which only ever has
// the QIR-reported total, never the family office's own commitment.
function ownershipPct(m: MetricRow): number | null {
  const fo = parseNum(m.familyOfficeCommitmentAmount);
  const total = parseNum(m.vehicleCommitmentAmount);
  if (fo == null || total == null || total === 0) return null;
  return fo / total;
}

function getLatestQuarter(metrics: MetricRow[], fundId: string) {
  const fundMetrics = metrics.filter((m) => m.fundId === fundId);
  if (fundMetrics.length === 0) return null;
  return fundMetrics.reduce((latest, m) => {
    const key = quarterSortKey(m.reportYear, m.reportQuarter);
    const latestKey = quarterSortKey(latest.reportYear, latest.reportQuarter);
    return key > latestKey ? m : latest;
  });
}

function getPriorQuarter(metrics: MetricRow[], fundId: string, year: number, quarter: number) {
  const targetKey = quarterSortKey(year, quarter);
  const prior = metrics
    .filter((m) => m.fundId === fundId)
    .filter((m) => quarterSortKey(m.reportYear, m.reportQuarter) < targetKey)
    .reduce<MetricRow | null>((best, m) => {
      const key = quarterSortKey(m.reportYear, m.reportQuarter);
      if (!best) return m;
      const bestKey = quarterSortKey(best.reportYear, best.reportQuarter);
      return key > bestKey ? m : best;
    }, null);
  return prior;
}

function pickPrimaryNetMetric(metrics: MetricRow[], fundId: string, year: number, quarter: number) {
  const periodMetrics = metrics.filter(
    (m) =>
      m.fundId === fundId &&
      m.reportYear === year &&
      m.reportQuarter === quarter &&
      m.returnBasis === "net"
  );
  const main = periodMetrics.find((m) => m.vehicleType === "main");
  return main ?? periodMetrics[0] ?? null;
}

export async function getFundOverviewRows(): Promise<FundOverviewRow[]> {
  const [allFunds, allMetrics, openFlags, latestReports] = await Promise.all([
    db.select().from(funds).orderBy(asc(funds.name)),
    getAllMetricsWithVehicles(),
    db
      .select({
        fundId: fundReports.fundId,
        message: validationFlags.message,
        severity: validationFlags.severity,
      })
      .from(validationFlags)
      .innerJoin(fundReports, eq(validationFlags.reportId, fundReports.id))
      .where(eq(validationFlags.resolved, false)),
    db
      .select({
        fundId: fundReports.fundId,
        reportYear: fundReports.reportYear,
        reportQuarter: fundReports.reportQuarter,
        uploadedAt: fundReports.uploadedAt,
      })
      .from(fundReports)
      .orderBy(desc(fundReports.reportYear), desc(fundReports.reportQuarter)),
  ]);

  const flagsByFund = new Map<string, { message: string; severity: "info" | "warning" | "critical" }[]>();
  for (const row of openFlags) {
    const list = flagsByFund.get(row.fundId) ?? [];
    list.push({ message: row.message, severity: row.severity as "info" | "warning" | "critical" });
    flagsByFund.set(row.fundId, list);
  }

  const lastReportByFund = new Map<
    string,
    { year: number; quarter: number; uploadedAt: Date }
  >();
  for (const r of latestReports) {
    if (!lastReportByFund.has(r.fundId)) {
      lastReportByFund.set(r.fundId, {
        year: r.reportYear,
        quarter: r.reportQuarter,
        uploadedAt: r.uploadedAt,
      });
    }
  }

  return allFunds.map((fund) => {
    const latest = getLatestQuarter(allMetrics, fund.id);
    const primary = latest
      ? pickPrimaryNetMetric(allMetrics, fund.id, latest.reportYear, latest.reportQuarter)
      : null;
    const prior = latest
      ? getPriorQuarter(allMetrics, fund.id, latest.reportYear, latest.reportQuarter)
      : null;
    const priorPrimary = prior
      ? pickPrimaryNetMetric(allMetrics, fund.id, prior.reportYear, prior.reportQuarter)
      : null;

    const currentNav = parseNum(primary?.nav ?? null);
    const priorNav = parseNum(priorPrimary?.nav ?? null);
    const qoqNavChangePct =
      currentNav != null && priorNav != null && priorNav !== 0
        ? ((currentNav - priorNav) / priorNav) * 100
        : null;

    const lastReport = lastReportByFund.get(fund.id);

    return {
      id: fund.id,
      name: fund.name,
      strategy: fund.strategy,
      assetClass: fund.assetClass as AssetClass,
      sector: fund.sector,
      commitmentAmount: parseNum(fund.commitmentAmount) ?? 0,
      currentNav,
      qoqNavChangePct,
      tvpi: parseNum(primary?.tvpi ?? null),
      dpi: parseNum(primary?.dpi ?? null),
      netIrr: parseNum(primary?.irr ?? null),
      netIrrLabel: primary ? `Net (${primary.vehicleName})` : "Net",
      unfundedCommitment: parseNum(primary?.unfundedCommitment ?? null),
      openFlags: flagsByFund.get(fund.id) ?? [],
      lastReportDate: lastReport?.uploadedAt ?? null,
      lastReportQuarter: lastReport
        ? formatQuarter(lastReport.year, lastReport.quarter)
        : null,
    };
  });
}

// Derives a display category and, where possible, a link target (the specific
// portfolio company the flag is about) straight from the field-name convention
// the validation rules already use (lib/validation/rules.ts) - "table.name.field"
// - rather than storing a separate category/company column that could drift
// out of sync with what the rule functions actually produce.
function categorizeFlag(fieldName: string): "Fund Metrics" | "Portfolio Company" | "Commentary" | "Other" {
  if (fieldName.startsWith("fund_metrics.")) return "Fund Metrics";
  if (fieldName.startsWith("portfolio_companies.")) return "Portfolio Company";
  if (fieldName.startsWith("gp_commentary.")) return "Commentary";
  return "Other";
}

function companyNameFromFieldName(fieldName: string): string | null {
  const prefix = "portfolio_companies.";
  if (!fieldName.startsWith(prefix)) return null;
  const withoutPrefix = fieldName.slice(prefix.length);
  const lastDot = withoutPrefix.lastIndexOf(".");
  return lastDot >= 0 ? withoutPrefix.slice(0, lastDot) : withoutPrefix;
}

export async function getOpenFlagsQueue(): Promise<OpenFlagRow[]> {
  const [rows, allCompanies] = await Promise.all([
    db
      .select({
        id: validationFlags.id,
        fundId: fundReports.fundId,
        fundName: funds.name,
        reportYear: fundReports.reportYear,
        reportQuarter: fundReports.reportQuarter,
        fieldName: validationFlags.fieldName,
        flagType: validationFlags.flagType,
        severity: validationFlags.severity,
        message: validationFlags.message,
        createdAt: validationFlags.createdAt,
      })
      .from(validationFlags)
      .innerJoin(fundReports, eq(validationFlags.reportId, fundReports.id))
      .innerJoin(funds, eq(fundReports.fundId, funds.id))
      .where(eq(validationFlags.resolved, false))
      .orderBy(desc(validationFlags.severity), desc(validationFlags.createdAt)),
    db.select({ id: portfolioCompanies.id, fundId: portfolioCompanies.fundId, companyName: portfolioCompanies.companyName }).from(portfolioCompanies),
  ]);

  const companyByKey = new Map(allCompanies.map((c) => [`${c.fundId}|${c.companyName.toLowerCase()}`, c]));

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return rows
    .map((r) => {
      const companyName = companyNameFromFieldName(r.fieldName);
      const company = companyName ? companyByKey.get(`${r.fundId}|${companyName.toLowerCase()}`) : undefined;
      return {
        ...r,
        severity: r.severity as "info" | "warning" | "critical",
        category: categorizeFlag(r.fieldName),
        companyId: company?.id ?? null,
        companyName: companyName,
      };
    })
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export type ReportingStatusRow = {
  fundId: string;
  fundName: string;
  reported: boolean;
};

// Simple, GP-packaging-agnostic completeness check: has this fund had at
// least one real reporting document (not marketing/annual) land for the
// current calendar quarter, yes or no. Deliberately not tracking specific
// document-type "slots" (valuation letter / LP letter / tear sheets as three
// separate expected files) - real GPs don't all package reports the same
// way (e.g. one real sample fund sends a single combined "QIR with Tear
// Sheets" PDF), so a per-slot tracker would show false "missing" flags for
// funds that report everything in one file. This answers the CIO's actual
// question - "which GPs are late this quarter" - without assuming anything
// about how any given GP packages their files.
export async function getReportingCompleteness(
  year?: number,
  quarter?: number
): Promise<{ year: number; quarter: number; funds: ReportingStatusRow[] }> {
  let targetYear: number;
  let targetQuarter: number;

  if (year != null && quarter != null) {
    targetYear = year;
    targetQuarter = quarter;
  } else {
    // Default to the latest quarter actually present in the data rather than the
    // real calendar date — seed data's "current period" is often earlier than
    // today's wall-clock date, which caused Reporting Status to show a different
    // quarter than the dashboard's own quarter tabs.
    const [latest] = await db
      .select({ reportYear: fundReports.reportYear, reportQuarter: fundReports.reportQuarter })
      .from(fundReports)
      .orderBy(desc(fundReports.reportYear), desc(fundReports.reportQuarter))
      .limit(1);
    if (latest) {
      targetYear = latest.reportYear;
      targetQuarter = latest.reportQuarter;
    } else {
      const current = getCurrentQuarter();
      targetYear = current.year;
      targetQuarter = current.quarter;
    }
  }

  const [allFunds, reportsThisQuarter] = await Promise.all([
    db.select({ id: funds.id, name: funds.name }).from(funds).orderBy(asc(funds.name)),
    db
      .select({ fundId: fundReports.fundId })
      .from(fundReports)
      .where(
        and(
          eq(fundReports.reportYear, targetYear),
          eq(fundReports.reportQuarter, targetQuarter),
          inArray(fundReports.documentType, REPORTING_DOCUMENT_TYPES)
        )
      ),
  ]);

  const reportedFundIds = new Set(reportsThisQuarter.map((r) => r.fundId));

  return {
    year: targetYear,
    quarter: targetQuarter,
    funds: allFunds.map((f) => ({
      fundId: f.id,
      fundName: f.name,
      reported: reportedFundIds.has(f.id),
    })),
  };
}

export async function getFundById(fundId: string) {
  const [fund] = await db.select().from(funds).where(eq(funds.id, fundId)).limit(1);
  return fund ?? null;
}

export async function getFundKpis(fundId: string): Promise<{
  kpis: FundKpi[];
  latestPeriod: string | null;
  vintageYear: number;
}> {
  const [fund, metrics] = await Promise.all([
    getFundById(fundId),
    getAllMetricsWithVehicles(),
  ]);
  if (!fund) return { kpis: [], latestPeriod: null, vintageYear: 0 };

  const fundMetrics = metrics.filter((m) => m.fundId === fundId);
  const latest = getLatestQuarter(fundMetrics, fundId);
  if (!latest) return { kpis: [], latestPeriod: null, vintageYear: fund.vintageYear };

  const prior = getPriorQuarter(
    fundMetrics,
    fundId,
    latest.reportYear,
    latest.reportQuarter
  );

  const latestPeriodMetrics = fundMetrics.filter(
    (m) => m.reportYear === latest.reportYear && m.reportQuarter === latest.reportQuarter
  );

  const kpis: FundKpi[] = latestPeriodMetrics.map((m) => {
    const priorMatch = prior
      ? fundMetrics.find(
          (p) =>
            p.vehicleId === m.vehicleId &&
            p.returnBasis === m.returnBasis &&
            p.reportYear === prior.reportYear &&
            p.reportQuarter === prior.reportQuarter
        )
      : null;
    const nav = parseNum(m.nav);
    const priorNav = parseNum(priorMatch?.nav ?? null);
    const qoqNavChangePct =
      nav != null && priorNav != null && priorNav !== 0
        ? ((nav - priorNav) / priorNav) * 100
        : null;

    const basisLabel = m.returnBasis === "gross" ? "Gross" : "Net";
    return {
      vehicleId: m.vehicleId,
      vehicleName: m.vehicleName,
      vehicleType: m.vehicleType,
      returnBasis: m.returnBasis,
      label: `${basisLabel} (${m.vehicleName})`,
      nav,
      tvpi: parseNum(m.tvpi),
      dpi: parseNum(m.dpi),
      rvpi: parseNum(m.rvpi),
      irr: parseNum(m.irr),
      unfundedCommitment: parseNum(m.unfundedCommitment),
      qoqNavChangePct,
      subscriptionLineBalance: parseNum(m.subscriptionLineBalance),
      unleveredIrr: parseNum(m.unleveredIrr),
    };
  });

  kpis.sort((a, b) => {
    if (a.returnBasis !== b.returnBasis) return a.returnBasis === "gross" ? -1 : 1;
    if (a.vehicleType !== b.vehicleType) {
      const order = { main: 0, co_invest: 1, parallel: 2 };
      return (
        (order[a.vehicleType as keyof typeof order] ?? 3) -
        (order[b.vehicleType as keyof typeof order] ?? 3)
      );
    }
    return a.vehicleName.localeCompare(b.vehicleName);
  });

  return {
    kpis,
    latestPeriod: formatQuarter(latest.reportYear, latest.reportQuarter),
    vintageYear: fund.vintageYear,
  };
}

export async function getFundTrendData(fundId: string): Promise<TrendPoint[]> {
  const metrics = await getAllMetricsWithVehicles();
  const fundMetrics = metrics.filter((m) => m.fundId === fundId);

  const periods = new Map<string, TrendPoint>();
  for (const m of fundMetrics) {
    const key = `${m.reportYear}-Q${m.reportQuarter}`;
    const existing = periods.get(key) ?? {
      period: formatQuarter(m.reportYear, m.reportQuarter),
      year: m.reportYear,
      quarter: m.reportQuarter,
      grossNav: null,
      netNav: null,
      grossTvpi: null,
      netTvpi: null,
      netCalledCapital: null,
      netDistributedCapital: null,
      netDpi: null,
      netRvpi: null,
      netIrr: null,
    };

    if (m.vehicleType === "main") {
      if (m.returnBasis === "gross") {
        existing.grossNav = parseNum(m.nav);
        existing.grossTvpi = parseNum(m.tvpi);
      } else {
        existing.netNav = parseNum(m.nav);
        existing.netTvpi = parseNum(m.tvpi);
        existing.netCalledCapital = parseNum(m.calledCapital);
        existing.netDistributedCapital = parseNum(m.distributedCapital);
        existing.netDpi = parseNum(m.dpi);
        existing.netRvpi = parseNum(m.rvpi);
        existing.netIrr = parseNum(m.irr);
      }
    }
    periods.set(key, existing);
  }

  return Array.from(periods.values()).sort(
    (a, b) => quarterSortKey(a.year, a.quarter) - quarterSortKey(b.year, b.quarter)
  );
}

// Portfolio-wide trend, aggregated across every fund - this is what's missing
// at the book level right now: every book-level number is "latest quarter
// only," so there's no way to see how the whole book has moved over time
// without opening each fund individually. Sums whichever funds have reported
// for a given quarter (not all funds necessarily have data that far back -
// vintages differ), which is itself informative (a growing fundsReporting
// count over time reflects the book actually growing).
export async function getBookTrendData(): Promise<BookTrendPoint[]> {
  const [allFunds, allMetrics] = await Promise.all([
    db.select({ id: funds.id, commitmentAmount: funds.commitmentAmount }).from(funds),
    getAllMetricsWithVehicles(),
  ]);

  const commitmentByFund = new Map(allFunds.map((f) => [f.id, parseNum(f.commitmentAmount) ?? 0]));

  const mainNet = allMetrics.filter((m) => m.vehicleType === "main" && m.returnBasis === "net");
  const byPeriod = new Map<string, { year: number; quarter: number; navByFund: Map<string, number> }>();

  for (const m of mainNet) {
    const key = `${m.reportYear}-Q${m.reportQuarter}`;
    const entry = byPeriod.get(key) ?? { year: m.reportYear, quarter: m.reportQuarter, navByFund: new Map() };
    entry.navByFund.set(m.fundId, parseNum(m.nav) ?? 0);
    byPeriod.set(key, entry);
  }

  return Array.from(byPeriod.values())
    .sort((a, b) => quarterSortKey(a.year, a.quarter) - quarterSortKey(b.year, b.quarter))
    .map((entry) => {
      const totalNav = Array.from(entry.navByFund.values()).reduce((s, v) => s + v, 0);
      const totalCommitment = Array.from(entry.navByFund.keys()).reduce(
        (s, fundId) => s + (commitmentByFund.get(fundId) ?? 0),
        0
      );
      return {
        period: formatQuarter(entry.year, entry.quarter),
        year: entry.year,
        quarter: entry.quarter,
        totalNav,
        totalCommitment,
        fundsReporting: entry.navByFund.size,
      };
    });
}

export async function getFundPortfolioCompanies(
  fundId: string
): Promise<{ companies: PortfolioCompanyRow[]; fundNav: number | null; latestPeriod: string | null }> {
  const metrics = await getAllMetricsWithVehicles();
  const latest = getLatestQuarter(metrics, fundId);
  if (!latest) return { companies: [], fundNav: null, latestPeriod: null };

  const primary = pickPrimaryNetMetric(
    metrics,
    fundId,
    latest.reportYear,
    latest.reportQuarter
  );
  const fundNav = parseNum(primary?.nav ?? null);

  const prior = getPriorQuarter(metrics, fundId, latest.reportYear, latest.reportQuarter);

  const [companies, latestValuations, priorValuations, fullHistory] = await Promise.all([
    db.select().from(portfolioCompanies).where(eq(portfolioCompanies.fundId, fundId)),
    db
      .select({
        companyId: portfolioCompanyValuations.companyId,
        valuation: portfolioCompanyValuations.valuation,
        grossMoic: portfolioCompanyValuations.grossMoic,
        costBasis: portfolioCompanyValuations.costBasis,
        committedCapital: portfolioCompanyValuations.committedCapital,
        netDebtToEbitda: portfolioCompanyValuations.netDebtToEbitda,
        reportId: portfolioCompanyValuations.reportId,
      })
      .from(portfolioCompanyValuations)
      .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id))
      .where(
        and(
          eq(fundReports.fundId, fundId),
          eq(fundReports.reportYear, latest.reportYear),
          eq(fundReports.reportQuarter, latest.reportQuarter)
        )
      ),
    prior
      ? db
          .select({
            companyId: portfolioCompanyValuations.companyId,
            valuation: portfolioCompanyValuations.valuation,
          })
          .from(portfolioCompanyValuations)
          .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id))
          .where(
            and(
              eq(fundReports.fundId, fundId),
              eq(fundReports.reportYear, prior.reportYear),
              eq(fundReports.reportQuarter, prior.reportQuarter)
            )
          )
      : Promise.resolve([]),
    db
      .select({
        companyId: portfolioCompanyValuations.companyId,
        grossMoic: portfolioCompanyValuations.grossMoic,
        reportYear: fundReports.reportYear,
        reportQuarter: fundReports.reportQuarter,
      })
      .from(portfolioCompanyValuations)
      .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id))
      .where(eq(fundReports.fundId, fundId)),
  ]);

  const priorByCompany = new Map(
    priorValuations.map((v) => [v.companyId, parseNum(v.valuation)])
  );

  // Group full history by company, sorted most-recent-first, so the
  // consecutive-at-cost streak can be counted from the front of each list.
  const historyByCompany = new Map<string, { key: number; grossMoic: number | null }[]>();
  for (const r of fullHistory) {
    const list = historyByCompany.get(r.companyId) ?? [];
    list.push({ key: r.reportYear * 4 + r.reportQuarter, grossMoic: parseNum(r.grossMoic) });
    historyByCompany.set(r.companyId, list);
  }
  const atCostStreakByCompany = new Map<string, number>();
  for (const [companyId, history] of historyByCompany) {
    const sorted = [...history].sort((a, b) => b.key - a.key);
    let streak = 0;
    for (const h of sorted) {
      if (h.grossMoic != null) break;
      streak += 1;
    }
    atCostStreakByCompany.set(companyId, streak);
  }
  const valuationByCompany = new Map(
    latestValuations.map((v) => [
      v.companyId,
      {
        valuation: parseNum(v.valuation),
        grossMoic: parseNum(v.grossMoic),
        costBasis: parseNum(v.costBasis),
        committedCapital: parseNum(v.committedCapital),
        netDebtToEbitda: parseNum(v.netDebtToEbitda),
      },
    ])
  );

  const rows: PortfolioCompanyRow[] = companies.map((c) => {
    const val = valuationByCompany.get(c.id);
    const valuation = val?.valuation ?? null;
    const priorValuation = priorByCompany.get(c.id) ?? null;
    const qoqChangePct =
      valuation != null && priorValuation != null && priorValuation !== 0
        ? ((valuation - priorValuation) / priorValuation) * 100
        : null;
    const costBasis = val?.costBasis ?? null;
    const committedCapital = val?.committedCapital ?? null;

    return {
      id: c.id,
      companyName: c.companyName,
      sector: c.sector,
      status: c.status,
      valuation,
      priorValuation,
      qoqChangePct,
      grossMoic: val?.grossMoic ?? null,
      pctOfFundNav:
        valuation != null && fundNav != null && fundNav > 0
          ? (valuation / fundNav) * 100
          : null,
      costBasis,
      committedCapital,
      unfundedCapital: committedCapital != null && costBasis != null ? committedCapital - costBasis : null,
      netDebtToEbitda: val?.netDebtToEbitda ?? null,
      consecutiveAtCostQuarters: atCostStreakByCompany.get(c.id) ?? 0,
    };
  });

  rows.sort((a, b) => (b.valuation ?? 0) - (a.valuation ?? 0));

  return {
    companies: rows,
    fundNav,
    latestPeriod: formatQuarter(latest.reportYear, latest.reportQuarter),
  };
}

export type AllocationTargetRow = {
  categoryLabel: string;
  targetMinPct: number;
  targetMaxPct: number;
  currentPct: number;
  currentValue: number;
  inRange: boolean;
};

// Compares actual portfolio allocation (by company sector, weighted by latest
// valuation) against GP-mandated target ranges. Returns an empty array for
// funds with no targets set - most funds won't have this configured, which is
// expected, not a data gap. categoryLabel is matched against portfolioCompanies.sector.
export async function getFundAllocationVsTarget(fundId: string): Promise<AllocationTargetRow[]> {
  const targets = await db.select().from(fundAllocationTargets).where(eq(fundAllocationTargets.fundId, fundId));
  if (targets.length === 0) return [];

  const { companies } = await getFundPortfolioCompanies(fundId);
  const totalValue = companies.reduce((s, c) => s + (c.valuation ?? 0), 0);

  return targets.map((t) => {
    const currentValue = companies
      .filter((c) => c.sector === t.categoryLabel)
      .reduce((s, c) => s + (c.valuation ?? 0), 0);
    const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
    const targetMinPct = parseNum(t.targetMinPct) ?? 0;
    const targetMaxPct = parseNum(t.targetMaxPct) ?? 100;

    return {
      categoryLabel: t.categoryLabel,
      targetMinPct,
      targetMaxPct,
      currentPct,
      currentValue,
      inRange: currentPct >= targetMinPct && currentPct <= targetMaxPct,
    };
  });
}

export async function getCompanyDevelopments(
  companyId: string
): Promise<CompanyDevelopment[]> {
  const rows = await db
    .select({
      id: portfolioCompanyDevelopments.id,
      developmentText: portfolioCompanyDevelopments.developmentText,
      taggedDate: portfolioCompanyDevelopments.taggedDate,
      reportYear: fundReports.reportYear,
      reportQuarter: fundReports.reportQuarter,
    })
    .from(portfolioCompanyDevelopments)
    .innerJoin(fundReports, eq(portfolioCompanyDevelopments.reportId, fundReports.id))
    .where(eq(portfolioCompanyDevelopments.companyId, companyId))
    .orderBy(asc(fundReports.reportYear), asc(fundReports.reportQuarter));

  return rows.map((r) => ({
    id: r.id,
    developmentText: r.developmentText,
    period: formatQuarter(r.reportYear, r.reportQuarter),
    reportYear: r.reportYear,
    reportQuarter: r.reportQuarter,
    taggedDate: r.taggedDate,
  }));
}

export type CompanyOverviewRow = {
  id: string;
  companyName: string;
  fundId: string;
  fundName: string;
  assetClass: AssetClass;
  sector: string | null;
  geography: string | null;
  status: string;
  valuation: number | null;
  grossMoic: number | null;
  grossIrr: number | null;
  committedCapital: number | null;
  unfundedCapital: number | null;
  latestPeriod: string | null;
};

// Cross-fund portfolio company list - the book-wide equivalent of the
// per-fund PortfolioTable, so a CIO can see every position across every fund
// in one place (e.g. "show me every Upstream E&P position in the book"),
// not just one fund's holdings at a time. This is the piece that actually
// makes "scale to 40+ funds" a company-level view, not just a fund-level one.
export async function getAllPortfolioCompanies(): Promise<CompanyOverviewRow[]> {
  const [companies, valuationRows] = await Promise.all([
    db
      .select({
        id: portfolioCompanies.id,
        companyName: portfolioCompanies.companyName,
        sector: portfolioCompanies.sector,
        geography: portfolioCompanies.geography,
        status: portfolioCompanies.status,
        fundId: funds.id,
        fundName: funds.name,
        assetClass: funds.assetClass,
      })
      .from(portfolioCompanies)
      .innerJoin(funds, eq(portfolioCompanies.fundId, funds.id)),
    db
      .select({
        companyId: portfolioCompanyValuations.companyId,
        valuation: portfolioCompanyValuations.valuation,
        grossMoic: portfolioCompanyValuations.grossMoic,
        grossIrr: portfolioCompanyValuations.grossIrr,
        costBasis: portfolioCompanyValuations.costBasis,
        committedCapital: portfolioCompanyValuations.committedCapital,
        reportYear: fundReports.reportYear,
        reportQuarter: fundReports.reportQuarter,
      })
      .from(portfolioCompanyValuations)
      .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id)),
  ]);

  const latestByCompany = new Map<string, (typeof valuationRows)[number]>();
  for (const v of valuationRows) {
    const existing = latestByCompany.get(v.companyId);
    if (!existing || quarterSortKey(v.reportYear, v.reportQuarter) > quarterSortKey(existing.reportYear, existing.reportQuarter)) {
      latestByCompany.set(v.companyId, v);
    }
  }

  return companies
    .map((c) => {
      const v = latestByCompany.get(c.id);
      const costBasis = v ? parseNum(v.costBasis) : null;
      const committedCapital = v ? parseNum(v.committedCapital) : null;
      return {
        id: c.id,
        companyName: c.companyName,
        fundId: c.fundId,
        fundName: c.fundName,
        assetClass: c.assetClass as AssetClass,
        sector: c.sector,
        geography: c.geography,
        status: c.status,
        valuation: v ? parseNum(v.valuation) : null,
        grossMoic: v ? parseNum(v.grossMoic) : null,
        grossIrr: v ? parseNum(v.grossIrr) : null,
        committedCapital,
        unfundedCapital: committedCapital != null && costBasis != null ? committedCapital - costBasis : null,
        latestPeriod: v ? formatQuarter(v.reportYear, v.reportQuarter) : null,
      };
    })
    .sort((a, b) => (b.valuation ?? 0) - (a.valuation ?? 0));
}

export type CompanyQuarterHistoryRow = {
  period: string;
  year: number;
  quarter: number;
  valuation: number | null;
  costBasis: number | null;
  committedCapital: number | null;
  unfundedCapital: number | null; // committedCapital - costBasis, when both are known
  grossMoic: number | null;
  grossIrr: number | null;
  netDebtToEbitda: number | null;
  debtFacilityCapacity: number | null;
  debtFacilityDrawn: number | null;
  hedgedPct: number | null;
  hedgeFloorPrice: number | null;
  hedgePriceUnit: string | null;
  ownershipPct: number | null;
  realizedProceeds: number | null;
  // Derived, not stored: realizedMoic = realizedProceeds/costBasis, unrealizedMoic
  // = valuation/costBasis. Splits the single blended grossMoic into "cash already
  // back" vs. "still a mark," the same distinction DPI gives at the fund level.
  realizedMoic: number | null;
  unrealizedMoic: number | null;
};

export type CompanyDetailRecord = {
  id: string;
  companyName: string;
  sector: string | null;
  geography: string | null;
  investmentDate: Date | null;
  status: string;
  investmentType: string;
  boardSeats: number | null;
  investmentThesis: string | null;
  fundId: string;
  fundName: string;
  history: CompanyQuarterHistoryRow[];
};

// Full drill-down for a single portfolio company, independent of which fund
// page you got here from - "/companies/[id]" needs to work whether you
// arrived via the cross-fund company list or a fund's own portfolio table.
export async function getCompanyDetail(companyId: string): Promise<CompanyDetailRecord | null> {
  const [company] = await db
    .select({
      id: portfolioCompanies.id,
      companyName: portfolioCompanies.companyName,
      sector: portfolioCompanies.sector,
      geography: portfolioCompanies.geography,
      investmentDate: portfolioCompanies.investmentDate,
      status: portfolioCompanies.status,
      investmentType: portfolioCompanies.investmentType,
      boardSeats: portfolioCompanies.boardSeats,
      investmentThesis: portfolioCompanies.investmentThesis,
      fundId: funds.id,
      fundName: funds.name,
    })
    .from(portfolioCompanies)
    .innerJoin(funds, eq(portfolioCompanies.fundId, funds.id))
    .where(eq(portfolioCompanies.id, companyId))
    .limit(1);

  if (!company) return null;

  const historyRows = await db
    .select({
      valuation: portfolioCompanyValuations.valuation,
      costBasis: portfolioCompanyValuations.costBasis,
      committedCapital: portfolioCompanyValuations.committedCapital,
      grossMoic: portfolioCompanyValuations.grossMoic,
      grossIrr: portfolioCompanyValuations.grossIrr,
      netDebtToEbitda: portfolioCompanyValuations.netDebtToEbitda,
      debtFacilityCapacity: portfolioCompanyValuations.debtFacilityCapacity,
      debtFacilityDrawn: portfolioCompanyValuations.debtFacilityDrawn,
      hedgedPct: portfolioCompanyValuations.hedgedPct,
      hedgeFloorPrice: portfolioCompanyValuations.hedgeFloorPrice,
      hedgePriceUnit: portfolioCompanyValuations.hedgePriceUnit,
      ownershipPct: portfolioCompanyValuations.ownershipPct,
      realizedProceeds: portfolioCompanyValuations.realizedProceeds,
      reportYear: fundReports.reportYear,
      reportQuarter: fundReports.reportQuarter,
    })
    .from(portfolioCompanyValuations)
    .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id))
    .where(eq(portfolioCompanyValuations.companyId, companyId))
    .orderBy(asc(fundReports.reportYear), asc(fundReports.reportQuarter));

  return {
    id: company.id,
    companyName: company.companyName,
    sector: company.sector,
    geography: company.geography,
    investmentDate: company.investmentDate,
    status: company.status,
    investmentType: company.investmentType,
    boardSeats: company.boardSeats,
    investmentThesis: company.investmentThesis,
    fundId: company.fundId,
    fundName: company.fundName,
    history: historyRows.map((r) => {
      const costBasis = parseNum(r.costBasis);
      const valuation = parseNum(r.valuation);
      const realizedProceeds = parseNum(r.realizedProceeds);
      const grossMoic = parseNum(r.grossMoic);
      const realizedMoic =
        costBasis != null && costBasis !== 0 && realizedProceeds != null ? realizedProceeds / costBasis : null;
      // Unrealized MOIC is the residual against the authoritative reported
      // Gross MOIC (grossMoic - realizedMoic), not an independent
      // valuation/costBasis recalculation. That guarantees Realized +
      // Unrealized always reconciles exactly to Total, instead of risking
      // two different numbers on the same page both claiming to be "the
      // total" (which is what happened before this fix: a position with
      // real realized proceeds still showed Unrealized == Total, silently
      // double-counting the realized dollars).
      const unrealizedMoic =
        grossMoic != null
          ? realizedMoic != null
            ? grossMoic - realizedMoic
            : grossMoic
          : costBasis != null && costBasis !== 0 && valuation != null
            ? valuation / costBasis
            : null;
      const committedCapital = parseNum(r.committedCapital);
      return {
        period: formatQuarter(r.reportYear, r.reportQuarter),
        year: r.reportYear,
        quarter: r.reportQuarter,
        valuation,
        costBasis,
        committedCapital,
        unfundedCapital: committedCapital != null && costBasis != null ? committedCapital - costBasis : null,
        grossMoic,
        grossIrr: parseNum(r.grossIrr),
        netDebtToEbitda: parseNum(r.netDebtToEbitda),
        debtFacilityCapacity: parseNum(r.debtFacilityCapacity),
        debtFacilityDrawn: parseNum(r.debtFacilityDrawn),
        hedgedPct: parseNum(r.hedgedPct),
        hedgeFloorPrice: parseNum(r.hedgeFloorPrice),
        hedgePriceUnit: r.hedgePriceUnit,
        ownershipPct: parseNum(r.ownershipPct),
        realizedProceeds,
        realizedMoic,
        unrealizedMoic,
      };
    }),
  };
}

export type FundSummaryRecord = {
  text: string;
  modelUsed: string;
  createdAt: Date;
  period: string;
};

// The AI investment summary is tied to fundReports.id (the schema's design -
// see aiSummaries in schema.ts), but reads as "the current summary for this
// fund" - always just the most recently generated one, not a history per report.
export async function getLatestAiSummary(fundId: string): Promise<FundSummaryRecord | null> {
  const [row] = await db
    .select({
      text: aiSummaries.generatedText,
      modelUsed: aiSummaries.modelUsed,
      createdAt: aiSummaries.createdAt,
      reportYear: fundReports.reportYear,
      reportQuarter: fundReports.reportQuarter,
    })
    .from(aiSummaries)
    .innerJoin(fundReports, eq(aiSummaries.reportId, fundReports.id))
    .where(eq(fundReports.fundId, fundId))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    text: row.text,
    modelUsed: row.modelUsed,
    createdAt: row.createdAt,
    period: formatQuarter(row.reportYear, row.reportQuarter),
  };
}

// Which report a freshly generated summary should attach to - the most
// recent one on file for this fund, regardless of which vehicle/basis it covers.
export async function getLatestReportId(fundId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: fundReports.id })
    .from(fundReports)
    .where(eq(fundReports.fundId, fundId))
    .orderBy(desc(fundReports.reportYear), desc(fundReports.reportQuarter), desc(fundReports.uploadedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function getFundGpCommentary(fundId: string): Promise<GpCommentaryData | null> {
  const metrics = await getAllMetricsWithVehicles();
  const latest = getLatestQuarter(metrics, fundId);
  if (!latest) return null;

  const [commentary] = await db
    .select({
      rawText: gpCommentary.rawText,
      gpStatedNotableChanges: gpCommentary.gpStatedNotableChanges,
    })
    .from(gpCommentary)
    .innerJoin(fundReports, eq(gpCommentary.reportId, fundReports.id))
    .where(
      and(
        eq(fundReports.fundId, fundId),
        eq(fundReports.reportYear, latest.reportYear),
        eq(fundReports.reportQuarter, latest.reportQuarter)
      )
    )
    .limit(1);

  if (!commentary) return null;

  return {
    rawText: commentary.rawText,
    gpStatedNotableChanges: commentary.gpStatedNotableChanges ?? [],
    period: formatQuarter(latest.reportYear, latest.reportQuarter),
  };
}

export type ExecutiveQuarterKpis = {
  period: string;
  year: number;
  quarter: number;
  totalNav: number | null; // gross NAV, summed across main vehicles - the book's current portfolio fair value
  grossMoic: number | null;
  grossDpi: number | null; // realized proceeds / paid-in, gross - the "how much of grossMoic is cash back" answer
  grossIrr: number | null;
  netMoicMain: number | null;
  netDpiMain: number | null;
  netIrrMain: number | null;
  // True bottom-line Net figures across every vehicle (main + co-invest +
  // parallel), not just each fund's main vehicle - see sumAllVehicles in
  // getConsolidatedExecutiveData. Only meaningfully different from the
  // *Main fields above when a fund has other vehicles; for a single fund with
  // no co-invest, these equal the Main figures.
  netMoicAllVehicles: number | null;
  netDpiAllVehicles: number | null;
  netIrrAllVehicles: number | null;
  netMoicCoinvest: number | null;
  netDpiCoinvest: number | null;
  netIrrCoinvest: number | null;
  coinvestVehicleName: string | null;
  unfundedCommitment: number | null; // gross, summed across vehicles
  cumulativeDistributions: number | null; // gross, summed across vehicles
  totalCommitments: number | null; // gross calledCapital + unfundedCommitment - derived, not stored
  quarterlyValuationSwingPct: number | null; // gross NAV move, adjusted for calls/distributions in the quarter
  pctNavAtCost: number | null; // % of portfolio-company value still carried at cost (grossMoic null)
  deploymentRatioPct: number | null; // called capital / total commitment (called + unfunded), as a percentage
  irrIsApproximate?: boolean; // true only for the consolidated (all-funds) rollup - see getConsolidatedExecutiveData
};

export type ConcentrationSlice = {
  companyName: string;
  pctOfPortfolio: number;
  valuation: number;
  grossMoic: number | null;
};

// Book-level concentration by manager (GP), not by portfolio company - a single
// company's share of a 2-fund book stops meaning anything once there are 40
// funds behind it (it's diluted and diluted, and any real single-name risk is
// already a fund-level concern, not a firm-level one). Manager concentration -
// how much of total NAV sits with one GP across all their funds/vintages - is
// the risk a CIO actually tracks at the book level, and it scales fine since
// the number of managers grows far slower than the number of portfolio
// companies.
export type ManagerConcentrationSlice = {
  gpName: string;
  nav: number;
  pctOfNav: number;
};

export type MoicMovement = {
  companyId: string;
  companyName: string;
  fundId: string;
  fundName: string;
  moicDelta: number;
  currentMoic: number | null;
};

export type UnmarkedPosition = {
  companyId: string;
  companyName: string;
  fundId: string | null;
  fundName: string | null;
  costBasis: number | null;
  quartersAtCost: number;
};

export type ExecutiveQuarterExtra = {
  period: string;
  concentration: ConcentrationSlice[]; // top 5 by valuation + "Other Positions" - company-level, not rendered on the book-level Executive Summary (see managerConcentration)
  managerConcentration: ManagerConcentrationSlice[]; // top 5 GPs by main-vehicle net NAV + "Other Managers" - the book-level concentration lens
  notableMovement: MoicMovement[]; // vs prior quarter, sorted by |delta| desc
  unmarkedPositions: UnmarkedPosition[]; // grossMoic still null as of this quarter
};

export type FundExecutiveData = {
  fundId: string;
  fundName: string;
  quarters: ExecutiveQuarterKpis[]; // oldest to newest
  extras: ExecutiveQuarterExtra[]; // same order/index as quarters
};

// Powers the quarter-tab Executive Dashboard: every KPI, chart series, and
// table needed for every quarter this fund has reported is computed once
// here, so the client component can switch quarters instantly (client-side
// state, no reload / no per-tab fetch) - matches how the reference layout
// this was modeled on behaves.
export async function getFundExecutiveData(fundId: string): Promise<FundExecutiveData | null> {
  const fund = await getFundById(fundId);
  if (!fund) return null;

  const [allMetrics, companies, valuationRows] = await Promise.all([
    getAllMetricsWithVehicles(),
    db
      .select({ id: portfolioCompanies.id, companyName: portfolioCompanies.companyName })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId)),
    db
      .select({
        companyId: portfolioCompanyValuations.companyId,
        valuation: portfolioCompanyValuations.valuation,
        grossMoic: portfolioCompanyValuations.grossMoic,
        costBasis: portfolioCompanyValuations.costBasis,
        reportYear: fundReports.reportYear,
        reportQuarter: fundReports.reportQuarter,
      })
      .from(portfolioCompanyValuations)
      .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id))
      .where(eq(fundReports.fundId, fundId)),
  ]);

  const fundVehicleMetrics = allMetrics.filter((m) => m.fundId === fundId);

  const periodKeys = Array.from(
    new Set(fundVehicleMetrics.map((m) => `${m.reportYear}-${m.reportQuarter}`))
  ).sort((a, b) => {
    const [ay, aq] = a.split("-").map(Number);
    const [by, bq] = b.split("-").map(Number);
    return quarterSortKey(ay, aq) - quarterSortKey(by, bq);
  });

  // Per-company, per-period valuation lookup, aligned to periodKeys' order -
  // turns both the concentration donut and the at-cost streak count into a
  // simple array walk instead of repeated date math.
  const valuationsByCompany = new Map<
    string,
    Map<string, { valuation: number | null; grossMoic: number | null; costBasis: number | null }>
  >();
  for (const v of valuationRows) {
    const key = `${v.reportYear}-${v.reportQuarter}`;
    const perCompany = valuationsByCompany.get(v.companyId) ?? new Map();
    perCompany.set(key, {
      valuation: parseNum(v.valuation),
      grossMoic: parseNum(v.grossMoic),
      costBasis: parseNum(v.costBasis),
    });
    valuationsByCompany.set(v.companyId, perCompany);
  }

  const quarters: ExecutiveQuarterKpis[] = [];
  const extras: ExecutiveQuarterExtra[] = [];

  periodKeys.forEach((key, index) => {
    const [year, quarter] = key.split("-").map(Number);
    const periodMetrics = fundVehicleMetrics.filter(
      (m) => m.reportYear === year && m.reportQuarter === quarter
    );
    const priorKey = index > 0 ? periodKeys[index - 1] : null;
    const priorMetrics = priorKey
      ? fundVehicleMetrics.filter((m) => `${m.reportYear}-${m.reportQuarter}` === priorKey)
      : [];

    const mainGross = periodMetrics.find((m) => m.vehicleType === "main" && m.returnBasis === "gross");
    const mainNet = periodMetrics.find((m) => m.vehicleType === "main" && m.returnBasis === "net");
    const coinvestNet = periodMetrics.find((m) => m.vehicleType === "co_invest" && m.returnBasis === "net");
    const priorMainGross = priorMetrics.find((m) => m.vehicleType === "main" && m.returnBasis === "gross");

    const grossRows = periodMetrics.filter((m) => m.returnBasis === "gross");
    const grossUnfunded = grossRows.length
      ? grossRows.reduce((s, m) => s + (parseNum(m.unfundedCommitment) ?? 0), 0)
      : null;
    const grossCalled = grossRows.length
      ? grossRows.reduce((s, m) => s + (parseNum(m.calledCapital) ?? 0), 0)
      : null;
    const grossDistributed = grossRows.length
      ? grossRows.reduce((s, m) => s + (parseNum(m.distributedCapital) ?? 0), 0)
      : null;

    const priorGrossRows = priorMetrics.filter((m) => m.returnBasis === "gross");
    const priorGrossCalled = priorGrossRows.length
      ? priorGrossRows.reduce((s, m) => s + (parseNum(m.calledCapital) ?? 0), 0)
      : null;
    const priorGrossDistributed = priorGrossRows.length
      ? priorGrossRows.reduce((s, m) => s + (parseNum(m.distributedCapital) ?? 0), 0)
      : null;

    const priorGrossNav = parseNum(priorMainGross?.nav ?? null);
    const currentGrossNav = parseNum(mainGross?.nav ?? null);
    const quarterlyValuationSwingPct =
      currentGrossNav != null &&
      priorGrossNav != null &&
      priorGrossNav !== 0 &&
      grossCalled != null &&
      priorGrossCalled != null &&
      grossDistributed != null &&
      priorGrossDistributed != null
        ? ((currentGrossNav -
            priorGrossNav -
            (grossCalled - priorGrossCalled) +
            (grossDistributed - priorGrossDistributed)) /
            priorGrossNav) *
          100
        : null;

    const companyValsThisQuarter = companies
      .map((c) => {
        const v = valuationsByCompany.get(c.id)?.get(key);
        return v ? { id: c.id, companyName: c.companyName, ...v } : null;
      })
      .filter(
        (
          v
        ): v is {
          id: string;
          companyName: string;
          valuation: number | null;
          grossMoic: number | null;
          costBasis: number | null;
        } => v != null
      );

    const totalPortfolioValue = companyValsThisQuarter.reduce((s, c) => s + (c.valuation ?? 0), 0);
    const atCostValue = companyValsThisQuarter
      .filter((c) => c.grossMoic == null)
      .reduce((s, c) => s + (c.valuation ?? 0), 0);
    const pctNavAtCost = totalPortfolioValue > 0 ? (atCostValue / totalPortfolioValue) * 100 : null;

    const sortedByValuation = [...companyValsThisQuarter].sort(
      (a, b) => (b.valuation ?? 0) - (a.valuation ?? 0)
    );
    const top5 = sortedByValuation.slice(0, 5);
    const rest = sortedByValuation.slice(5);
    const concentration: ConcentrationSlice[] = top5.map((c) => ({
      companyName: c.companyName,
      valuation: c.valuation ?? 0,
      pctOfPortfolio: totalPortfolioValue > 0 ? ((c.valuation ?? 0) / totalPortfolioValue) * 100 : 0,
      grossMoic: c.grossMoic,
    }));
    if (rest.length > 0) {
      const restValue = rest.reduce((s, c) => s + (c.valuation ?? 0), 0);
      concentration.push({
        companyName: `Other Positions (${rest.length})`,
        valuation: restValue,
        pctOfPortfolio: totalPortfolioValue > 0 ? (restValue / totalPortfolioValue) * 100 : 0,
        grossMoic: null,
      });
    }

    const notableMovement: MoicMovement[] = [];
    if (priorKey) {
      for (const c of companyValsThisQuarter) {
        const priorVal = valuationsByCompany.get(c.id)?.get(priorKey);
        if (
          c.grossMoic != null &&
          priorVal?.grossMoic != null &&
          // Gated on MOIC_DECLINE_THRESHOLD (lib/validation/rules.ts), applied
          // symmetrically to gains too - "notable" means a move big enough to
          // matter, not just whichever moves ranked highest this quarter
          // regardless of size.
          Math.abs(c.grossMoic - priorVal.grossMoic) >= MOIC_DECLINE_THRESHOLD
        ) {
          notableMovement.push({
            companyId: c.id,
            companyName: c.companyName,
            fundId: fund.id,
            fundName: fund.name,
            moicDelta: c.grossMoic - priorVal.grossMoic,
            currentMoic: c.grossMoic,
          });
        }
      }
      notableMovement.sort((a, b) => Math.abs(b.moicDelta) - Math.abs(a.moicDelta));
    }

    const unmarkedPositions: UnmarkedPosition[] = companyValsThisQuarter
      .filter((c) => c.grossMoic == null)
      .map((c) => {
        // Walk backward through this company's history, counting consecutive
        // at-cost quarters ending at (and including) this one.
        let streak = 0;
        for (let i = index; i >= 0; i--) {
          const v = valuationsByCompany.get(c.id)?.get(periodKeys[i]);
          if (!v || v.grossMoic != null) break;
          streak++;
        }
        return {
          companyId: c.id,
          companyName: c.companyName,
          fundId: fund.id,
          fundName: fund.name,
          costBasis: c.costBasis,
          quartersAtCost: streak,
        };
      })
      .sort((a, b) => b.quartersAtCost - a.quartersAtCost);

    const totalCommitmentsThisQ =
      grossCalled != null && grossUnfunded != null ? grossCalled + grossUnfunded : null;

    quarters.push({
      period: formatQuarter(year, quarter),
      year,
      quarter,
      totalNav: parseNum(mainGross?.nav ?? null),
      grossMoic: parseNum(mainGross?.tvpi ?? null),
      grossDpi: parseNum(mainGross?.dpi ?? null),
      grossIrr: parseNum(mainGross?.irr ?? null),
      netMoicMain: parseNum(mainNet?.tvpi ?? null),
      netDpiMain: parseNum(mainNet?.dpi ?? null),
      netIrrMain: parseNum(mainNet?.irr ?? null),
      // This per-fund path isn't currently rendered anywhere (the Executive
      // Summary's by-fund view was removed - see ExecutiveDashboard.tsx); a
      // proper all-vehicle sum here would combine mainNet + coinvestNet, but
      // there's no live consumer to verify that against today, so this
      // mirrors netMoicMain/netDpiMain/netIrrMain rather than adding untested
      // complexity to a dead code path. Fix properly if this view returns.
      netMoicAllVehicles: parseNum(mainNet?.tvpi ?? null),
      netDpiAllVehicles: parseNum(mainNet?.dpi ?? null),
      netIrrAllVehicles: parseNum(mainNet?.irr ?? null),
      netMoicCoinvest: parseNum(coinvestNet?.tvpi ?? null),
      netDpiCoinvest: parseNum(coinvestNet?.dpi ?? null),
      netIrrCoinvest: parseNum(coinvestNet?.irr ?? null),
      coinvestVehicleName: coinvestNet?.vehicleName ?? null,
      unfundedCommitment: grossUnfunded,
      cumulativeDistributions: grossDistributed,
      totalCommitments: totalCommitmentsThisQ,
      deploymentRatioPct:
        grossCalled != null && totalCommitmentsThisQ != null && totalCommitmentsThisQ !== 0
          ? (grossCalled / totalCommitmentsThisQ) * 100
          : null,
      quarterlyValuationSwingPct,
      pctNavAtCost,
    });

    extras.push({
      period: formatQuarter(year, quarter),
      concentration,
      // Manager concentration isn't a meaningful concept for a single fund (one
      // fund has exactly one GP) - left empty here; the book-level rollup below
      // is where this is actually computed.
      managerConcentration: [],
      notableMovement: notableMovement.slice(0, 3),
      unmarkedPositions,
    });
  });

  return { fundId: fund.id, fundName: fund.name, quarters, extras };
}

// Book-wide equivalent of getFundExecutiveData: same return shape (so the
// same ExecutiveDashboard component renders either one unchanged), but every
// number is aggregated across every fund's main vehicle instead of reading
// one fund's vehicles.
//
// MOIC/TVPI/DPI aggregate exactly as sum-of-numerator over sum-of-denominator
// (e.g. blended TVPI = (total distributed + total NAV) / total called) - this
// is mathematically correct, not an approximation, because those are ratios
// of additive dollar amounts. IRR does NOT aggregate this way: IRR is a
// property of a single cash flow schedule, and pooling schedules from funds
// with different vintages/cash flow timing requires a pooled-cash-flow XIRR
// calculation this app doesn't perform (the irr field is always whatever the
// GP reported for that one fund, never derived here). So consolidated IRR
// below is a commitment-weighted average across funds - a reasonable
// approximation for a rollup view, but explicitly not a true pooled IRR, and
// callers should label it as such rather than presenting it as equivalent to
// a single fund's reported IRR.
export async function getConsolidatedExecutiveData(): Promise<FundExecutiveData> {
  const [allFunds, allMetrics, allCompanies, valuationRows] = await Promise.all([
    db.select({ id: funds.id, name: funds.name, gpName: funds.gpName }).from(funds),
    getAllMetricsWithVehicles(),
    db
      .select({ id: portfolioCompanies.id, companyName: portfolioCompanies.companyName, fundId: portfolioCompanies.fundId })
      .from(portfolioCompanies),
    db
      .select({
        companyId: portfolioCompanyValuations.companyId,
        valuation: portfolioCompanyValuations.valuation,
        grossMoic: portfolioCompanyValuations.grossMoic,
        costBasis: portfolioCompanyValuations.costBasis,
        reportYear: fundReports.reportYear,
        reportQuarter: fundReports.reportQuarter,
      })
      .from(portfolioCompanyValuations)
      .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id)),
  ]);

  const fundIds = new Set(allFunds.map((f) => f.id));
  const mainMetrics = allMetrics.filter((m) => fundIds.has(m.fundId) && m.vehicleType === "main");
  // Every vehicle (main + co-invest + parallel) across every fund - used only
  // for the true book-wide Net rollup below. Gross figures stay main-vehicle-
  // only because that's the only basis co-invest/parallel vehicles actually
  // report in this data model (see seed data: those vehicles only ever carry
  // a "net" row, no separate "gross" line) - there's nothing to sum there.
  const allVehicleMetrics = allMetrics.filter((m) => fundIds.has(m.fundId));
  // A fund's own portfolio companies are fund-wide facts (a company's
  // valuation doesn't change per LP), but converting them into the family
  // office's own exposure - for at-cost share and concentration - means
  // scaling by the fund's main-vehicle ownership %, same as everything else
  // in this rollup. One entry per fund, since ownership % is a property of
  // the vehicle (constant across quarters), not something that varies by
  // period.
  const mainOwnershipPctByFundId = new Map<string, number>();
  for (const m of mainMetrics) {
    if (!mainOwnershipPctByFundId.has(m.fundId)) {
      const pct = ownershipPct(m);
      if (pct != null) mainOwnershipPctByFundId.set(m.fundId, pct);
    }
  }
  const gpNameByFundId = new Map(allFunds.map((f) => [f.id, f.gpName]));
  const fundNameByFundId = new Map(allFunds.map((f) => [f.id, f.name]));

  const periodKeys = Array.from(new Set(mainMetrics.map((m) => `${m.reportYear}-${m.reportQuarter}`))).sort(
    (a, b) => {
      const [ay, aq] = a.split("-").map(Number);
      const [by, bq] = b.split("-").map(Number);
      return quarterSortKey(ay, aq) - quarterSortKey(by, bq);
    }
  );

  const valuationsByCompany = new Map<
    string,
    Map<string, { valuation: number | null; grossMoic: number | null; costBasis: number | null }>
  >();
  for (const v of valuationRows) {
    const key = `${v.reportYear}-${v.reportQuarter}`;
    const perCompany = valuationsByCompany.get(v.companyId) ?? new Map();
    perCompany.set(key, {
      valuation: parseNum(v.valuation),
      grossMoic: parseNum(v.grossMoic),
      costBasis: parseNum(v.costBasis),
    });
    valuationsByCompany.set(v.companyId, perCompany);
  }

  // Sums across a given metrics slice for one basis, in one period - returns
  // null (not 0) when no fund has data for that basis/period, so a genuine
  // "nothing reported yet" doesn't get displayed as "$0".
  function sumFromMetrics(
    metrics: MetricRow[],
    period: string,
    basis: "gross" | "net",
    field: "nav" | "calledCapital" | "distributedCapital" | "unfundedCommitment"
  ) {
    const [year, quarter] = period.split("-").map(Number);
    const rows = metrics.filter(
      (m) => m.reportYear === year && m.reportQuarter === quarter && m.returnBasis === basis
    );
    if (rows.length === 0) return null;
    return rows.reduce((s, m) => s + (parseNum(m[field]) ?? 0), 0);
  }
  // Same as sumFromMetrics, but each row is scaled by that row's own vehicle's
  // ownership % (the family office's commitment / the vehicle's total
  // commitment) before summing. This is what actually fixes the book-level
  // weighting problem: summing raw vehicle dollars weights the blend by each
  // vehicle's total size, but summing ownership-scaled dollars weights it by
  // what the family office actually has at stake in each one. Rows with no
  // ownership data (real uploads, which never populate
  // familyOfficeCommitmentAmount) are excluded rather than treated as zero,
  // so a partially-populated book doesn't silently understate itself.
  function sumFamilyOfficeFromMetrics(
    metrics: MetricRow[],
    period: string,
    basis: "gross" | "net",
    field: "nav" | "calledCapital" | "distributedCapital" | "unfundedCommitment"
  ) {
    const [year, quarter] = period.split("-").map(Number);
    const rows = metrics.filter(
      (m) => m.reportYear === year && m.reportQuarter === quarter && m.returnBasis === basis
    );
    const scaled = rows
      .map((m) => {
        const pct = ownershipPct(m);
        const value = parseNum(m[field]);
        return pct != null && value != null ? value * pct : null;
      })
      .filter((v): v is number => v != null);
    if (scaled.length === 0) return null;
    return scaled.reduce((s, v) => s + v, 0);
  }
  const sumMainFO = (period: string, basis: "gross" | "net", field: Parameters<typeof sumFromMetrics>[3]) =>
    sumFamilyOfficeFromMetrics(mainMetrics, period, basis, field);
  const sumAllVehiclesFO = (period: string, basis: "gross" | "net", field: Parameters<typeof sumFromMetrics>[3]) =>
    sumFamilyOfficeFromMetrics(allVehicleMetrics, period, basis, field);

  // Same idea as sumFamilyOfficeFromMetrics: weight each vehicle's IRR by the
  // family office's own called capital in it, not the vehicle's total called
  // capital, so a fund we're barely in doesn't swing the blended IRR just
  // because it's a large fund.
  function weightedAvgIrrFromMetricsFO(metrics: MetricRow[], period: string, basis: "gross" | "net") {
    const [year, quarter] = period.split("-").map(Number);
    const rows = metrics.filter(
      (m) => m.reportYear === year && m.reportQuarter === quarter && m.returnBasis === basis
    );
    const withWeight = rows
      .map((m) => {
        const pct = ownershipPct(m);
        const called = parseNum(m.calledCapital);
        const irr = parseNum(m.irr);
        return pct != null && called != null && irr != null ? { irr, weight: called * pct } : null;
      })
      .filter((r): r is { irr: number; weight: number } => r != null);
    const totalWeight = withWeight.reduce((s, r) => s + r.weight, 0);
    if (withWeight.length === 0 || totalWeight === 0) return null;
    return withWeight.reduce((s, r) => s + r.irr * r.weight, 0) / totalWeight;
  }
  const weightedAvgIrr = (period: string, basis: "gross" | "net") =>
    weightedAvgIrrFromMetricsFO(mainMetrics, period, basis);
  const weightedAvgIrrAllVehicles = (period: string, basis: "gross" | "net") =>
    weightedAvgIrrFromMetricsFO(allVehicleMetrics, period, basis);

  const quarters: ExecutiveQuarterKpis[] = [];
  const extras: ExecutiveQuarterExtra[] = [];

  periodKeys.forEach((key, index) => {
    const [year, quarter] = key.split("-").map(Number);
    const priorKey = index > 0 ? periodKeys[index - 1] : null;

    // Family-office-weighted: each vehicle's dollars are scaled by our own
    // commitment share of that vehicle before summing, so a fund we're barely
    // in doesn't dominate the book-level total just because the vehicle itself
    // is large. See sumFamilyOfficeFromMetrics above.
    const grossNav = sumMainFO(key, "gross", "nav");
    const grossCalled = sumMainFO(key, "gross", "calledCapital");
    const grossDistributed = sumMainFO(key, "gross", "distributedCapital");
    const grossUnfunded = sumMainFO(key, "gross", "unfundedCommitment");
    const netNav = sumMainFO(key, "net", "nav");
    const netCalled = sumMainFO(key, "net", "calledCapital");
    const netDistributed = sumMainFO(key, "net", "distributedCapital");

    // True book-wide Net, across every vehicle - the figure that actually
    // answers "what's our bottom-line net return across everything we've
    // committed," not just each fund's main vehicle.
    const netNavAll = sumAllVehiclesFO(key, "net", "nav");
    const netCalledAll = sumAllVehiclesFO(key, "net", "calledCapital");
    const netDistributedAll = sumAllVehiclesFO(key, "net", "distributedCapital");

    const grossMoic =
      grossNav != null && grossDistributed != null && grossCalled != null && grossCalled !== 0
        ? (grossNav + grossDistributed) / grossCalled
        : null;
    const netMoicMain =
      netNav != null && netDistributed != null && netCalled != null && netCalled !== 0
        ? (netNav + netDistributed) / netCalled
        : null;
    const netMoicAllVehicles =
      netNavAll != null && netDistributedAll != null && netCalledAll != null && netCalledAll !== 0
        ? (netNavAll + netDistributedAll) / netCalledAll
        : null;
    const netDpiAllVehicles =
      netDistributedAll != null && netCalledAll != null && netCalledAll !== 0
        ? netDistributedAll / netCalledAll
        : null;
    // DPI aggregates the same way as MOIC/TVPI - sum of realized distributions
    // over sum of paid-in capital - which is exact, not an approximation.
    const grossDpi =
      grossDistributed != null && grossCalled != null && grossCalled !== 0 ? grossDistributed / grossCalled : null;
    const netDpiMain =
      netDistributed != null && netCalled != null && netCalled !== 0 ? netDistributed / netCalled : null;

    const priorGrossNav = priorKey ? sumMainFO(priorKey, "gross", "nav") : null;
    const priorGrossCalled = priorKey ? sumMainFO(priorKey, "gross", "calledCapital") : null;
    const priorGrossDistributed = priorKey ? sumMainFO(priorKey, "gross", "distributedCapital") : null;
    const quarterlyValuationSwingPct =
      grossNav != null &&
      priorGrossNav != null &&
      priorGrossNav !== 0 &&
      grossCalled != null &&
      priorGrossCalled != null &&
      grossDistributed != null &&
      priorGrossDistributed != null
        ? ((grossNav - priorGrossNav - (grossCalled - priorGrossCalled) + (grossDistributed - priorGrossDistributed)) /
            priorGrossNav) *
          100
        : null;

    // Companies are fund-wide facts (a valuation doesn't change per LP), but
    // valuation and cost basis are dollar amounts - scaled here by the fund's
    // main-vehicle ownership % so at-cost share and concentration reflect the
    // family office's own exposure, not the fund's full position. grossMoic is
    // a ratio and is left alone. Funds with no ownership data (real uploads)
    // drop their dollar fields to null rather than silently keeping the
    // unscaled full-fund number.
    const companyValsThisQuarter = allCompanies
      .map((c) => {
        const v = valuationsByCompany.get(c.id)?.get(key);
        if (!v) return null;
        const pct = mainOwnershipPctByFundId.get(c.fundId) ?? null;
        return {
          id: c.id,
          companyName: c.companyName,
          fundId: c.fundId,
          valuation: pct != null && v.valuation != null ? v.valuation * pct : null,
          grossMoic: v.grossMoic,
          costBasis: pct != null && v.costBasis != null ? v.costBasis * pct : null,
        };
      })
      .filter(
        (
          v
        ): v is {
          id: string;
          companyName: string;
          fundId: string;
          valuation: number | null;
          grossMoic: number | null;
          costBasis: number | null;
        } => v != null
      );

    const totalPortfolioValue = companyValsThisQuarter.reduce((s, c) => s + (c.valuation ?? 0), 0);
    const atCostValue = companyValsThisQuarter
      .filter((c) => c.grossMoic == null)
      .reduce((s, c) => s + (c.valuation ?? 0), 0);
    const pctNavAtCost = totalPortfolioValue > 0 ? (atCostValue / totalPortfolioValue) * 100 : null;

    const sortedByValuation = [...companyValsThisQuarter].sort(
      (a, b) => (b.valuation ?? 0) - (a.valuation ?? 0)
    );
    const top5 = sortedByValuation.slice(0, 5);
    const rest = sortedByValuation.slice(5);
    const concentration: ConcentrationSlice[] = top5.map((c) => ({
      companyName: c.companyName,
      valuation: c.valuation ?? 0,
      pctOfPortfolio: totalPortfolioValue > 0 ? ((c.valuation ?? 0) / totalPortfolioValue) * 100 : 0,
      grossMoic: c.grossMoic,
    }));
    if (rest.length > 0) {
      const restValue = rest.reduce((s, c) => s + (c.valuation ?? 0), 0);
      concentration.push({
        companyName: `Other Positions (${rest.length})`,
        valuation: restValue,
        pctOfPortfolio: totalPortfolioValue > 0 ? (restValue / totalPortfolioValue) * 100 : 0,
        grossMoic: null,
      });
    }

    // Book-level concentration lens: by manager (GP), not by portfolio company -
    // see the ManagerConcentrationSlice comment above for why. Grouped from
    // each fund's own main-vehicle net NAV for this quarter, not from company
    // valuations, since manager exposure is a fund-level (capital-level)
    // question, not a position-level one. Scaled by the family office's own
    // ownership % of that vehicle - unscaled, this would rank GPs by the size
    // of their fund rather than by how much of the family office's own money
    // actually sits with them, which is the whole reason the vehicle-level
    // version of this chart could point the wrong way.
    const netNavByFundThisQ = new Map<string, number>();
    for (const m of mainMetrics) {
      if (m.reportYear === year && m.reportQuarter === quarter && m.returnBasis === "net") {
        const pct = mainOwnershipPctByFundId.get(m.fundId);
        if (pct == null) continue;
        netNavByFundThisQ.set(m.fundId, (netNavByFundThisQ.get(m.fundId) ?? 0) + (parseNum(m.nav) ?? 0) * pct);
      }
    }
    const navByGp = new Map<string, number>();
    for (const [fId, nav] of netNavByFundThisQ) {
      const gp = gpNameByFundId.get(fId) ?? "Unknown GP";
      navByGp.set(gp, (navByGp.get(gp) ?? 0) + nav);
    }
    const totalGpNav = Array.from(navByGp.values()).reduce((s, v) => s + v, 0);
    const sortedGpEntries = Array.from(navByGp.entries()).sort((a, b) => b[1] - a[1]);
    const top5Gp = sortedGpEntries.slice(0, 5);
    const restGp = sortedGpEntries.slice(5);
    const managerConcentration: ManagerConcentrationSlice[] = top5Gp.map(([gpName, nav]) => ({
      gpName,
      nav,
      pctOfNav: totalGpNav > 0 ? (nav / totalGpNav) * 100 : 0,
    }));
    if (restGp.length > 0) {
      const restNav = restGp.reduce((s, [, nav]) => s + nav, 0);
      managerConcentration.push({
        gpName: `Other Managers (${restGp.length})`,
        nav: restNav,
        pctOfNav: totalGpNav > 0 ? (restNav / totalGpNav) * 100 : 0,
      });
    }

    const notableMovement: MoicMovement[] = [];
    if (priorKey) {
      for (const c of companyValsThisQuarter) {
        const priorVal = valuationsByCompany.get(c.id)?.get(priorKey);
        if (
          c.grossMoic != null &&
          priorVal?.grossMoic != null &&
          // Gated on MOIC_DECLINE_THRESHOLD (lib/validation/rules.ts), applied
          // symmetrically to gains too - "notable" means a move big enough to
          // matter, not just whichever moves ranked highest this quarter
          // regardless of size.
          Math.abs(c.grossMoic - priorVal.grossMoic) >= MOIC_DECLINE_THRESHOLD
        ) {
          notableMovement.push({
            companyId: c.id,
            companyName: c.companyName,
            fundId: c.fundId,
            fundName: fundNameByFundId.get(c.fundId) ?? "Unknown Fund",
            moicDelta: c.grossMoic - priorVal.grossMoic,
            currentMoic: c.grossMoic,
          });
        }
      }
      notableMovement.sort((a, b) => Math.abs(b.moicDelta) - Math.abs(a.moicDelta));
    }

    const unmarkedPositions: UnmarkedPosition[] = companyValsThisQuarter
      .filter((c) => c.grossMoic == null)
      .map((c) => {
        let streak = 0;
        for (let i = index; i >= 0; i--) {
          const v = valuationsByCompany.get(c.id)?.get(periodKeys[i]);
          if (!v || v.grossMoic != null) break;
          streak++;
        }
        return {
          companyId: c.id,
          companyName: c.companyName,
          fundId: c.fundId,
          fundName: fundNameByFundId.get(c.fundId) ?? null,
          costBasis: c.costBasis,
          quartersAtCost: streak,
        };
      })
      .sort((a, b) => b.quartersAtCost - a.quartersAtCost);

    const totalCommitmentsThisQ =
      grossCalled != null && grossUnfunded != null ? grossCalled + grossUnfunded : null;

    quarters.push({
      period: formatQuarter(year, quarter),
      year,
      quarter,
      totalNav: grossNav,
      grossMoic,
      grossDpi,
      grossIrr: weightedAvgIrr(key, "gross"),
      netMoicMain,
      netDpiMain,
      netIrrMain: weightedAvgIrr(key, "net"),
      netMoicAllVehicles,
      netDpiAllVehicles,
      netIrrAllVehicles: weightedAvgIrrAllVehicles(key, "net"),
      netMoicCoinvest: null,
      netDpiCoinvest: null,
      netIrrCoinvest: null,
      coinvestVehicleName: null,
      unfundedCommitment: grossUnfunded,
      cumulativeDistributions: grossDistributed,
      totalCommitments: totalCommitmentsThisQ,
      deploymentRatioPct:
        grossCalled != null && totalCommitmentsThisQ != null && totalCommitmentsThisQ !== 0
          ? (grossCalled / totalCommitmentsThisQ) * 100
          : null,
      quarterlyValuationSwingPct,
      pctNavAtCost,
      irrIsApproximate: true,
    });

    extras.push({
      period: formatQuarter(year, quarter),
      concentration,
      managerConcentration,
      notableMovement: notableMovement.slice(0, 3),
      unmarkedPositions,
    });
  });

  return { fundId: "__consolidated__", fundName: "All Funds (Consolidated)", quarters, extras };
}

// Every quarter's commentary, not just the latest - the same "running log,
// never overwritten" idea already used for portfolio company developments,
// applied to GP commentary so the fund detail page can show how the GP's own
// narrative has evolved, not just what they said most recently.
export async function getFundGpCommentaryHistory(fundId: string): Promise<GpCommentaryHistoryEntry[]> {
  const rows = await db
    .select({
      rawText: gpCommentary.rawText,
      gpStatedNotableChanges: gpCommentary.gpStatedNotableChanges,
      macroRiskMentions: gpCommentary.macroRiskMentions,
      advanceCapitalCallNotes: gpCommentary.advanceCapitalCallNotes,
      reportYear: fundReports.reportYear,
      reportQuarter: fundReports.reportQuarter,
    })
    .from(gpCommentary)
    .innerJoin(fundReports, eq(gpCommentary.reportId, fundReports.id))
    .where(eq(fundReports.fundId, fundId))
    .orderBy(asc(fundReports.reportYear), asc(fundReports.reportQuarter));

  return rows.map((r) => ({
    period: formatQuarter(r.reportYear, r.reportQuarter),
    reportYear: r.reportYear,
    reportQuarter: r.reportQuarter,
    rawText: r.rawText,
    gpStatedNotableChanges: r.gpStatedNotableChanges ?? [],
    macroRiskMentions: r.macroRiskMentions ?? [],
    advanceCapitalCallNotes: r.advanceCapitalCallNotes ?? [],
  }));
}
