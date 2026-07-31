import { db } from "./index";
import { eq, and } from "drizzle-orm";
import {
  fundReports,
  fundVehicles,
  fundMetrics,
  portfolioCompanies,
  portfolioCompanyValuations,
  portfolioCompanyDevelopments,
  gpCommentary,
  validationFlags,
  funds,
} from "./schema";
import type { FundReportExtraction } from "../ai/schemas";
import {
  checkNavDelta,
  checkCompanyIrrTurnedNegative,
  checkTvpiReconciliation,
  checkCommentaryRiskKeywords,
  checkCommentaryRealizationEvent,
  type FlagCandidate,
} from "../validation/rules";
import { parseNum } from "../format";

// --- Automated validation helpers ------------------------------------------
// Rule-based (not AI) - see lib/validation/rules.ts for what each check does
// and why. These look up whatever the most recent *prior* quarter's figure
// was for the same vehicle/company, regardless of upload order, so a
// backfilled historical report still compares against the right baseline.

function periodKey(year: number, quarter: number): number {
  return year * 4 + quarter;
}

async function getPriorMetric(vehicleId: string, basis: "gross" | "net", beforeYear: number, beforeQuarter: number) {
  const rows = await db
    .select()
    .from(fundMetrics)
    .where(and(eq(fundMetrics.vehicleId, vehicleId), eq(fundMetrics.returnBasis, basis)));
  const beforeKey = periodKey(beforeYear, beforeQuarter);
  const prior = rows.filter((r) => periodKey(r.reportYear, r.reportQuarter) < beforeKey);
  if (prior.length === 0) return null;
  return prior.reduce((best, r) => (periodKey(r.reportYear, r.reportQuarter) > periodKey(best.reportYear, best.reportQuarter) ? r : best));
}

async function getPriorCompanyIrr(companyId: string, beforeYear: number, beforeQuarter: number): Promise<number | null> {
  const rows = await db
    .select({
      grossIrr: portfolioCompanyValuations.grossIrr,
      reportYear: fundReports.reportYear,
      reportQuarter: fundReports.reportQuarter,
    })
    .from(portfolioCompanyValuations)
    .innerJoin(fundReports, eq(portfolioCompanyValuations.reportId, fundReports.id))
    .where(eq(portfolioCompanyValuations.companyId, companyId));
  const beforeKey = periodKey(beforeYear, beforeQuarter);
  const prior = rows.filter((r) => periodKey(r.reportYear, r.reportQuarter) < beforeKey);
  if (prior.length === 0) return null;
  const best = prior.reduce((b, r) => (periodKey(r.reportYear, r.reportQuarter) > periodKey(b.reportYear, b.reportQuarter) ? r : b));
  return parseNum(best.grossIrr);
}

async function insertFlag(reportId: string, flag: FlagCandidate) {
  await db.insert(validationFlags).values({
    reportId,
    fieldName: flag.fieldName,
    flagType: flag.flagType,
    severity: flag.severity,
    message: flag.message,
  });
}

// Writes an extraction result straight into the historical tables the
// dashboard reads from. No review-and-confirm gate in front of this right
// now - for a single fund's worth of quarterly uploads, reviewed manually by
// the person uploading, an extra confirmation screen was more process than
// the situation calls for. (A proper review/validation layer is still a
// documented improvement for actual 40-fund scale - see architecture.md
// Section 8 - but shouldn't block seeing your own data on the dashboard now.)
export async function commitExtractionToHistory(
  fundId: string,
  reportId: string,
  reportYear: number,
  reportQuarter: number,
  extraction: FundReportExtraction
): Promise<void> {
  // Vehicles: match by name (case-insensitive) within the fund, create if new.
  const existingVehicles = await db.select().from(fundVehicles).where(eq(fundVehicles.fundId, fundId));
  const vehicleByName = new Map(existingVehicles.map((v) => [v.vehicleName.toLowerCase(), v]));

  for (const rb of extraction.return_bases ?? []) {
    let vehicle = vehicleByName.get(rb.vehicle_name.toLowerCase());
    if (!vehicle) {
      [vehicle] = await db
        .insert(fundVehicles)
        .values({ fundId, vehicleName: rb.vehicle_name, vehicleType: "main" })
        .returning();
      vehicleByName.set(rb.vehicle_name.toLowerCase(), vehicle);
    }

    await db
      .insert(fundMetrics)
      .values({
        reportId,
        fundId,
        vehicleId: vehicle.id,
        reportYear,
        reportQuarter,
        returnBasis: rb.basis,
        nav: rb.nav?.toString() ?? null,
        calledCapital: rb.called_capital?.toString() ?? null,
        distributedCapital: rb.distributed_capital?.toString() ?? null,
        remainingValue: rb.remaining_value?.toString() ?? null,
        dpi: rb.dpi?.toString() ?? null,
        rvpi: rb.rvpi?.toString() ?? null,
        tvpi: rb.tvpi?.toString() ?? null,
        irr: rb.irr?.toString() ?? null,
        unfundedCommitment: rb.unfunded_commitment?.toString() ?? null,
        subscriptionLineBalance: rb.subscription_line_balance?.toString() ?? null,
        unleveredIrr: rb.unlevered_irr?.toString() ?? null,
        currency: rb.currency || "USD",
      })
      .onConflictDoNothing();
  }

  // Portfolio companies: match by name (case-insensitive) within the fund, create if new.
  const existingCompanies = await db.select().from(portfolioCompanies).where(eq(portfolioCompanies.fundId, fundId));
  const companyByName = new Map(existingCompanies.map((c) => [c.companyName.toLowerCase(), c]));

  for (const pc of extraction.portfolio_companies ?? []) {
    let company = companyByName.get(pc.name.toLowerCase());
    if (!company) {
      [company] = await db
        .insert(portfolioCompanies)
        .values({
          fundId,
          companyName: pc.name,
          sector: pc.sector,
          investmentDate: pc.investment_date ? new Date(pc.investment_date) : null,
          status: pc.status,
          investmentType: pc.investment_type ?? "equity",
          boardSeats: pc.board_seats ?? null,
          investmentThesis: pc.investment_thesis ?? null,
        })
        .returning();
      companyByName.set(pc.name.toLowerCase(), company);
    }

    await db.insert(portfolioCompanyValuations).values({
      reportId,
      companyId: company.id,
      valuation: pc.valuation?.toString() ?? null,
      costBasis: pc.cost_basis?.toString() ?? null,
      committedCapital: pc.committed_capital?.toString() ?? null,
      ownershipPct: pc.ownership_pct?.toString() ?? null,
      grossMoic: pc.gross_moic?.toString() ?? null,
      grossIrr: pc.gross_irr?.toString() ?? null,
      netDebtToEbitda: pc.net_debt_to_ebitda?.toString() ?? null,
      debtFacilityCapacity: pc.debt_facility_capacity?.toString() ?? null,
      debtFacilityDrawn: pc.debt_facility_drawn?.toString() ?? null,
      hedgedPct: pc.hedged_pct?.toString() ?? null,
      hedgeFloorPrice: pc.hedge_floor_price?.toString() ?? null,
      hedgePriceUnit: pc.hedge_price_unit ?? null,
      realizedProceeds: pc.realized_proceeds?.toString() ?? null,
      status: pc.status,
    });

    for (const dev of pc.significant_developments ?? []) {
      await db.insert(portfolioCompanyDevelopments).values({
        companyId: company.id,
        reportId,
        developmentText: dev,
        taggedDate: new Date(reportYear, (reportQuarter - 1) * 3, 1),
      });
    }
  }

  if (extraction.gp_commentary) {
    await db.insert(gpCommentary).values({
      reportId,
      rawText: extraction.gp_commentary.raw_text,
      extractedThemesJson: extraction.gp_commentary.key_themes ?? [],
      gpStatedNotableChanges: extraction.gp_commentary.gp_stated_notable_changes ?? [],
      macroRiskMentions: extraction.gp_commentary.macro_risk_mentions ?? [],
      advanceCapitalCallNotes: extraction.gp_commentary.advance_capital_call_notes ?? [],
    });
  }

  // Automated validation flags - runs after the data above is committed so
  // "prior quarter" lookups see the full history, including this report.
  const [fundRow] = await db.select().from(funds).where(eq(funds.id, fundId)).limit(1);
  const vintageYear = fundRow?.vintageYear ?? reportYear;

  for (const rb of extraction.return_bases ?? []) {
    const vehicle = vehicleByName.get(rb.vehicle_name.toLowerCase());
    if (!vehicle) continue;

    const priorMetric = await getPriorMetric(vehicle.id, rb.basis, reportYear, reportQuarter);
    const navFlag = checkNavDelta({
      fieldName: `fund_metrics.${vehicle.vehicleName}.${rb.basis}.nav`,
      currentNav: rb.nav ?? null,
      priorNav: priorMetric ? parseNum(priorMetric.nav) : null,
      currentCalledCapital: rb.called_capital ?? null,
      priorCalledCapital: priorMetric ? parseNum(priorMetric.calledCapital) : null,
      vintageYear,
      asOfYear: reportYear,
    });
    if (navFlag) await insertFlag(reportId, navFlag);

    const tvpiFlag = checkTvpiReconciliation({
      fieldName: `fund_metrics.${vehicle.vehicleName}.${rb.basis}.tvpi`,
      dpi: rb.dpi ?? null,
      rvpi: rb.rvpi ?? null,
      tvpi: rb.tvpi ?? null,
    });
    if (tvpiFlag) await insertFlag(reportId, tvpiFlag);
  }

  for (const pc of extraction.portfolio_companies ?? []) {
    const company = companyByName.get(pc.name.toLowerCase());
    if (!company) continue;

    const priorIrr = await getPriorCompanyIrr(company.id, reportYear, reportQuarter);
    const irrFlag = checkCompanyIrrTurnedNegative({
      companyName: pc.name,
      currentIrr: pc.gross_irr ?? null,
      priorIrr,
    });
    if (irrFlag) await insertFlag(reportId, irrFlag);
  }

  // Commentary keyword scans run once per report, at the fund level, against
  // the raw commentary text plus the GP's own "notable changes" callouts.
  if (extraction.gp_commentary) {
    const commentaryText = [
      extraction.gp_commentary.raw_text ?? "",
      ...(extraction.gp_commentary.gp_stated_notable_changes ?? []),
    ].join(" ");

    const riskFlag = checkCommentaryRiskKeywords({ fundName: fundRow?.name ?? fundId, commentaryText });
    if (riskFlag) await insertFlag(reportId, riskFlag);

    const realizationFlag = checkCommentaryRealizationEvent({ fundName: fundRow?.name ?? fundId, commentaryText });
    if (realizationFlag) await insertFlag(reportId, realizationFlag);
  }

  await db.update(fundReports).set({ status: "committed", committedAt: new Date() }).where(eq(fundReports.id, reportId));
}
