import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { funds, fundVehicles, reportingPackages, fundReports } from "../lib/db/schema";

const client = postgres("postgresql://postgres:postgres@127.0.0.1:55432/postgres");
const db = drizzle(client, { schema: {} });

async function main() {
  const [fund] = await db
    .insert(funds)
    .values({
      name: "Test Fund",
      gpName: "Test GP",
      strategy: "Buyout",
      sector: "Industrials",
      geographyFocus: "US",
      vintageYear: 2022,
      commitmentAmount: "10000000",
      currency: "USD",
    })
    .returning();
  console.log("fund created:", fund.id);

  let [pkg] = await db
    .select()
    .from(reportingPackages)
    .where(
      and(
        eq(reportingPackages.fundId, fund.id),
        eq(reportingPackages.reportYear, 2025),
        eq(reportingPackages.reportQuarter, 2)
      )
    );
  if (!pkg) {
    [pkg] = await db
      .insert(reportingPackages)
      .values({ fundId: fund.id, reportYear: 2025, reportQuarter: 2, status: "incomplete" })
      .returning();
  }
  console.log("package:", pkg.id);

  const [report] = await db
    .insert(fundReports)
    .values({
      fundId: fund.id,
      reportingPackageId: pkg.id,
      reportYear: 2025,
      reportQuarter: 2,
      sourceFileUrl: "test/path.pdf",
      status: "pending",
    })
    .returning();
  console.log("report:", report.id);

  // simulate classify update
  await db
    .update(fundReports)
    .set({ documentType: "lp_letter", status: "classified" })
    .where(eq(fundReports.id, report.id));

  // simulate extract update with a nested JSON object (jsonb column)
  const mockExtraction = {
    fund_name: "Test Fund",
    report_period: { year: 2025, quarter: 2 },
    return_bases: [{ vehicle_name: "Test Fund", basis: "gross", nav: 1000, currency: "USD" }],
    portfolio_companies: [{ name: "Acme Co", status: "active", significant_developments: ["did a thing"] }],
    gp_commentary: { raw_text: "hello", key_themes: [], gp_stated_notable_changes: [], macro_risk_mentions: [] },
    extraction_meta: { fields_with_low_confidence: [], source_page_refs: {} },
  };
  await db
    .update(fundReports)
    .set({ rawExtractionJson: mockExtraction, status: "extracted" })
    .where(eq(fundReports.id, report.id));

  const [final] = await db.select().from(fundReports).where(eq(fundReports.id, report.id));
  console.log("final report status:", final.status, "document_type:", final.documentType);
  console.log("raw_extraction_json round-trips correctly:", JSON.stringify(final.rawExtractionJson).includes("Acme Co"));

  await db.update(reportingPackages).set({ status: "complete" }).where(eq(reportingPackages.id, pkg.id));
  console.log("OK - all upload-flow DB operations succeeded");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
