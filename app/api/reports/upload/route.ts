import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fundReports, reportingPackages, documentTypeEnum } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { uploadReportFile } from "@/lib/pdf/storage";
import { extractReport } from "@/lib/ai/extraction";
import { commitExtractionToHistory } from "@/lib/db/commit";

export const runtime = "nodejs";
export const maxDuration = 120; // extraction across a batch can take a minute+

// Every file uploaded here is assumed to be a quarterly report and gets
// extracted - no document-type picker, no AI classification guess. The
// document_type/marketing_other distinction in the schema exists for a
// scenario this exercise doesn't involve (bulk-ingesting an unfamiliar GP
// data room where file types genuinely aren't known upfront); for uploading
// your own fund's quarterly reports, you already know what you're uploading,
// so asking you to also label it was pure friction with no payoff - see
// architecture.md's Decisions Log. If a genuinely non-report file needs to be
// kept for reference without extraction, don't upload it here.
const ASSUMED_DOCUMENT_TYPE: (typeof documentTypeEnum.enumValues)[number] = "lp_letter";

type FileResult = {
  filename: string;
  reportId: string;
  document_type: string | null;
  status: string;
  error?: string;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const fundId = formData.get("fundId") as string | null;
  const reportYear = Number(formData.get("reportYear"));
  const reportQuarter = Number(formData.get("reportQuarter"));
  const files = formData.getAll("files") as File[];

  if (!fundId || !reportYear || !reportQuarter || files.length === 0) {
    return NextResponse.json(
      { error: "fundId, reportYear, reportQuarter, and at least one file are required." },
      { status: 400 }
    );
  }

  // Find or create the reporting package for this fund + quarter.
  let [pkg] = await db
    .select()
    .from(reportingPackages)
    .where(
      and(
        eq(reportingPackages.fundId, fundId),
        eq(reportingPackages.reportYear, reportYear),
        eq(reportingPackages.reportQuarter, reportQuarter)
      )
    );

  if (!pkg) {
    [pkg] = await db
      .insert(reportingPackages)
      .values({ fundId, reportYear, reportQuarter, status: "incomplete" })
      .returning();
  }

  const results: FileResult[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${fundId}/${reportYear}-Q${reportQuarter}/${Date.now()}-${file.name}`;

    let reportId = "";
    try {
      await uploadReportFile(storagePath, buffer);

      const [report] = await db
        .insert(fundReports)
        .values({
          fundId,
          reportingPackageId: pkg.id,
          reportYear,
          reportQuarter,
          sourceFileUrl: storagePath,
          documentType: ASSUMED_DOCUMENT_TYPE,
          status: "classified",
        })
        .returning();
      reportId = report.id;

      const extraction = await extractReport(buffer, ASSUMED_DOCUMENT_TYPE);
      await db
        .update(fundReports)
        .set({ rawExtractionJson: extraction, status: "extracted" })
        .where(eq(fundReports.id, reportId));

      await commitExtractionToHistory(fundId, reportId, reportYear, reportQuarter, extraction);

      results.push({
        filename: file.name,
        reportId,
        document_type: ASSUMED_DOCUMENT_TYPE,
        status: "extracted and on the dashboard",
      });
    } catch (err) {
      results.push({
        filename: file.name,
        reportId: reportId || "unknown",
        document_type: null,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await db
    .update(reportingPackages)
    .set({ status: "complete" })
    .where(eq(reportingPackages.id, pkg.id));

  return NextResponse.json({ packageId: pkg.id, results });
}
