import "dotenv/config";
import { db } from "./index";
import {
  funds,
  fundVehicles,
  reportingPackages,
  fundReports,
  fundMetrics,
  portfolioCompanies,
  portfolioCompanyValuations,
  portfolioCompanyDevelopments,
  gpCommentary,
  validationFlags,
  fundAllocationTargets,
} from "./schema";
import { seedFunds } from "./seed-data";
import { getCurrentQuarter, shiftQuarter } from "../format";
import {
  checkNavDelta,
  checkCompanyIrrTurnedNegative,
  checkTvpiReconciliation,
  checkCommentaryRiskKeywords,
  checkCommentaryRealizationEvent,
  type FlagCandidate,
} from "../validation/rules";

// seed-data.ts's quarters are hand-written assuming "the latest quarter" is
// 2025 Q3. That drifts stale the moment real time moves on - a demo whose
// most recent report is a year old looks broken, not intentional, and this
// dashboard may well still be sitting at a Vercel URL months after it's
// built. Every reportYear/reportQuarter pulled from seed-data.ts is shifted
// by a fixed offset so the data's *shape* (a young fund still ramping up, a
// mature fund distributing, one deliberate markdown, etc.) is preserved but
// its most recent quarter always lands one quarter behind whenever this
// script actually runs - i.e. always looks like a fund that reported on a
// normal, real-world lag.
const SEED_DATA_LATEST_QUARTER = { year: 2025, quarter: 3 };

function computeOffset(): number {
  const current = getCurrentQuarter();
  const desiredLatest = shiftQuarter(current.year, current.quarter, -1);
  const desiredKey = desiredLatest.year * 4 + desiredLatest.quarter;
  const hardcodedKey = SEED_DATA_LATEST_QUARTER.year * 4 + SEED_DATA_LATEST_QUARTER.quarter;
  return desiredKey - hardcodedKey;
}

async function main() {
  const existing = await db.select({ id: funds.id }).from(funds).limit(1);
  if (existing.length > 0) {
    console.error(
      "Database already has funds in it - refusing to seed again (this is what caused duplicate funds before). " +
        "Run `npm run db:reset` first if you want a clean slate, then re-run `npm run seed`."
    );
    process.exit(1);
  }

  const offset = computeOffset();
  const shift = (year: number, quarter: number) => shiftQuarter(year, quarter, offset);

  console.log("Seeding database...");

  for (const fundDef of seedFunds) {
    const [fund] = await db
      .insert(funds)
      .values({
        name: fundDef.name,
        gpName: fundDef.gpName,
        strategy: fundDef.strategy,
        assetClass: fundDef.assetClass,
        sector: fundDef.sector,
        geographyFocus: fundDef.geographyFocus,
        vintageYear: fundDef.vintageYear,
        commitmentAmount: fundDef.commitmentAmount.toString(),
        currency: fundDef.currency,
      })
      .returning();

    console.log(`  fund: ${fund.name}`);

    if (fundDef.allocationTargets?.length) {
      for (const t of fundDef.allocationTargets) {
        await db.insert(fundAllocationTargets).values({
          fundId: fund.id,
          categoryLabel: t.categoryLabel,
          targetMinPct: t.targetMinPct.toString(),
          targetMaxPct: t.targetMaxPct.toString(),
        });
      }
    }

    // Vehicles, keyed by the same "main" | "co_invest" key used in seed-data.ts
    const vehicleIdByKey: Record<string, string> = {};
    for (const v of fundDef.vehicles) {
      const [vehicle] = await db
        .insert(fundVehicles)
        .values({
          fundId: fund.id,
          vehicleName: v.vehicleName,
          vehicleType: v.vehicleType,
          commitmentAmount: v.commitmentAmount.toString(),
        })
        .returning();
      vehicleIdByKey[v.key] = vehicle.id;
    }

    // Portfolio companies (created once per fund, valuations/developments attach per quarter)
    const companyIdByName: Record<string, string> = {};
    for (const c of fundDef.companies) {
      const [company] = await db
        .insert(portfolioCompanies)
        .values({
          fundId: fund.id,
          companyName: c.companyName,
          sector: c.sector,
          geography: c.geography,
          investmentDate: new Date(c.investmentDate),
          status: c.status,
          investmentType: c.investmentType ?? "equity",
          boardSeats: c.boardSeats ?? null,
          investmentThesis: c.investmentThesis ?? null,
        })
        .returning();
      companyIdByName[c.companyName] = company.id;
    }

    // Reporting packages + reports + metrics, one quarter at a time. reportIds
    // are keyed by the *shifted* quarter, since everything downstream (company
    // valuations, validation flags) needs to look them up by the same key.
    const reportIdByQuarter: Record<string, string> = {};
    // Metrics per shifted quarter key, kept in memory for the validation pass
    // below instead of re-querying the DB (we already have it all right here).
    const metricsByQuarterKey: Record<
      string,
      { vehicleId: string; basis: "gross" | "net"; nav: number; calledCapital: number; dpi: number; rvpi: number; tvpi: number }[]
    > = {};

    for (const q of fundDef.quarters) {
      const { year, quarter } = shift(q.reportYear, q.reportQuarter);
      const quarterKey = `${year}-Q${quarter}`;

      const [pkg] = await db
        .insert(reportingPackages)
        .values({
          fundId: fund.id,
          reportYear: year,
          reportQuarter: quarter,
          status: "complete",
          expectedDocumentTypes: [q.documentType],
        })
        .returning();

      const [report] = await db
        .insert(fundReports)
        .values({
          fundId: fund.id,
          reportingPackageId: pkg.id,
          documentType: q.documentType,
          reportYear: year,
          reportQuarter: quarter,
          status: "committed",
          committedAt: new Date(),
        })
        .returning();

      reportIdByQuarter[quarterKey] = report.id;
      metricsByQuarterKey[quarterKey] = [];

      for (const m of q.metrics) {
        const vehicleId = vehicleIdByKey[m.vehicle];
        await db.insert(fundMetrics).values({
          reportId: report.id,
          fundId: fund.id,
          vehicleId,
          reportYear: year,
          reportQuarter: quarter,
          returnBasis: m.basis,
          nav: m.nav.toString(),
          calledCapital: m.calledCapital.toString(),
          distributedCapital: m.distributedCapital.toString(),
          remainingValue: m.remainingValue.toString(),
          dpi: m.dpi.toString(),
          rvpi: m.rvpi.toString(),
          tvpi: m.tvpi.toString(),
          irr: m.irr.toString(),
          unfundedCommitment: m.unfundedCommitment.toString(),
          subscriptionLineBalance: m.subscriptionLineBalance != null ? m.subscriptionLineBalance.toString() : null,
          unleveredIrr: m.unleveredIrr != null ? m.unleveredIrr.toString() : null,
        });
        metricsByQuarterKey[quarterKey].push({
          vehicleId,
          basis: m.basis,
          nav: m.nav,
          calledCapital: m.calledCapital,
          dpi: m.dpi,
          rvpi: m.rvpi,
          tvpi: m.tvpi,
        });
      }

      await db.insert(gpCommentary).values({
        reportId: report.id,
        rawText: q.gpCommentaryText,
        extractedThemesJson: q.gpStatedNotableChanges,
        gpStatedNotableChanges: q.gpStatedNotableChanges,
        macroRiskMentions: q.macroRiskMentions,
        advanceCapitalCallNotes: q.advanceCapitalCallNotes ?? [],
      });

      const commentaryText = [q.gpCommentaryText, ...q.gpStatedNotableChanges].join(" ");
      const riskFlag = checkCommentaryRiskKeywords({ fundName: fundDef.name, commentaryText });
      if (riskFlag) await db.insert(validationFlags).values({ reportId: report.id, ...riskFlag, resolved: false });
      const realizationFlag = checkCommentaryRealizationEvent({ fundName: fundDef.name, commentaryText });
      if (realizationFlag)
        await db.insert(validationFlags).values({ reportId: report.id, ...realizationFlag, resolved: false });
    }

    // Company valuations + developments, tied to the report for that (shifted) quarter
    const valuationsByCompany: Record<
      string,
      {
        key: string;
        year: number;
        quarter: number;
        valuation: number;
        grossIrr: number | null;
        grossMoic: number | null;
        netDebtToEbitda: number | null;
      }[]
    > = {};
    for (const c of fundDef.companies) {
      const companyId = companyIdByName[c.companyName];
      valuationsByCompany[c.companyName] = [];

      for (const cq of c.quarters) {
        const { year, quarter } = shift(cq.reportYear, cq.reportQuarter);
        const quarterKey = `${year}-Q${quarter}`;
        const reportId = reportIdByQuarter[quarterKey];
        if (!reportId) continue; // company data for a quarter the fund didn't report - skip

        await db.insert(portfolioCompanyValuations).values({
          reportId,
          companyId,
          valuation: cq.valuation.toString(),
          costBasis: cq.costBasis?.toString() ?? null,
          committedCapital: cq.committedCapital != null ? cq.committedCapital.toString() : null,
          ownershipPct: cq.ownershipPct?.toString() ?? null,
          grossMoic: cq.grossMoic?.toString() ?? null,
          grossIrr: cq.grossIrr?.toString() ?? null,
          netDebtToEbitda: cq.netDebtToEbitda != null ? cq.netDebtToEbitda.toString() : null,
          debtFacilityCapacity: cq.debtFacilityCapacity != null ? cq.debtFacilityCapacity.toString() : null,
          debtFacilityDrawn: cq.debtFacilityDrawn != null ? cq.debtFacilityDrawn.toString() : null,
          hedgedPct: cq.hedgedPct != null ? cq.hedgedPct.toString() : null,
          hedgeFloorPrice: cq.hedgeFloorPrice != null ? cq.hedgeFloorPrice.toString() : null,
          hedgePriceUnit: cq.hedgePriceUnit ?? null,
          realizedProceeds: cq.realizedProceeds != null ? cq.realizedProceeds.toString() : null,
          status: "active",
        });
        valuationsByCompany[c.companyName].push({
          key: quarterKey,
          year,
          quarter,
          valuation: cq.valuation,
          grossIrr: cq.grossIrr ?? null,
          grossMoic: cq.grossMoic ?? null,
          netDebtToEbitda: cq.netDebtToEbitda ?? null,
        });

        for (const dev of cq.developments ?? []) {
          await db.insert(portfolioCompanyDevelopments).values({
            companyId,
            reportId,
            developmentText: dev,
            taggedDate: new Date(year, (quarter - 1) * 3, 1),
          });
        }
      }
    }

    // --- Automated validation flags -----------------------------------
    // Same rule-based checks used on real uploads (lib/db/commit.ts) - the
    // demo data is validated the same way real data would be, not hand-authored
    // to look plausible. See lib/validation/rules.ts for what each check does.
    const quarterKeysInOrder = fundDef.quarters
      .map((q) => shift(q.reportYear, q.reportQuarter))
      .sort((a, b) => a.year * 4 + a.quarter - (b.year * 4 + b.quarter))
      .map(({ year, quarter }) => ({ year, quarter, key: `${year}-Q${quarter}` }));

    async function flag(reportId: string, candidate: FlagCandidate | null) {
      if (!candidate) return;
      await db.insert(validationFlags).values({ reportId, ...candidate, resolved: false });
    }

    for (let i = 1; i < quarterKeysInOrder.length; i++) {
      const cur = quarterKeysInOrder[i];
      const prior = quarterKeysInOrder[i - 1];
      const curMetrics = metricsByQuarterKey[cur.key] ?? [];
      const priorMetrics = metricsByQuarterKey[prior.key] ?? [];
      const reportId = reportIdByQuarter[cur.key];
      if (!reportId) continue;

      for (const m of curMetrics) {
        const priorMatch = priorMetrics.find((p) => p.vehicleId === m.vehicleId && p.basis === m.basis);
        await flag(
          reportId,
          checkNavDelta({
            fieldName: `fund_metrics.${m.vehicleId}.${m.basis}.nav`,
            currentNav: m.nav,
            priorNav: priorMatch?.nav ?? null,
            currentCalledCapital: m.calledCapital,
            priorCalledCapital: priorMatch?.calledCapital ?? null,
            vintageYear: fundDef.vintageYear,
            asOfYear: cur.year,
          })
        );
        await flag(
          reportId,
          checkTvpiReconciliation({
            fieldName: `fund_metrics.${m.vehicleId}.${m.basis}.tvpi`,
            dpi: m.dpi,
            rvpi: m.rvpi,
            tvpi: m.tvpi,
          })
        );
      }
    }

    for (const [companyName, quarters] of Object.entries(valuationsByCompany)) {
      const sorted = [...quarters].sort((a, b) => a.year * 4 + a.quarter - (b.year * 4 + b.quarter));

      for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i];
        const prior = sorted[i - 1];
        const reportId = reportIdByQuarter[cur.key];
        if (!reportId) continue;

        await flag(
          reportId,
          checkCompanyIrrTurnedNegative({
            companyName,
            currentIrr: cur.grossIrr,
            priorIrr: prior.grossIrr,
          })
        );
      }
    }
  }

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
