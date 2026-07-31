import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fundReports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { downloadReportFile } from "@/lib/pdf/storage";
import { extractReport } from "@/lib/ai/extraction";

// Standalone re-extract endpoint - used by the review screen (Phase 5b) to
// re-run extraction on a single already-classified report.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [report] = await db.select().from(fundReports).where(eq(fundReports.id, id));
  if (!report || !report.sourceFileUrl) {
    return NextResponse.json({ error: "Report not found or has no source file." }, { status: 404 });
  }
  if (
    report.documentType !== "valuation_letter" &&
    report.documentType !== "lp_letter" &&
    report.documentType !== "tear_sheets"
  ) {
    return NextResponse.json(
      { error: `Cannot extract a document classified as "${report.documentType}".` },
      { status: 400 }
    );
  }

  const buffer = await downloadReportFile(report.sourceFileUrl);
  const extraction = await extractReport(buffer, report.documentType);

  await db
    .update(fundReports)
    .set({ rawExtractionJson: extraction, status: "extracted" })
    .where(eq(fundReports.id, id));

  return NextResponse.json(extraction);
}
