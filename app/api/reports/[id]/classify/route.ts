import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fundReports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { downloadReportFile } from "@/lib/pdf/storage";
import { classifyDocument } from "@/lib/ai/classify";

// Standalone re-classify endpoint - used by the review screen (Phase 5b) to
// re-run classification on a single already-uploaded report.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [report] = await db.select().from(fundReports).where(eq(fundReports.id, id));
  if (!report || !report.sourceFileUrl) {
    return NextResponse.json({ error: "Report not found or has no source file." }, { status: 404 });
  }

  const buffer = await downloadReportFile(report.sourceFileUrl);
  const classification = await classifyDocument(buffer);

  await db
    .update(fundReports)
    .set({ documentType: classification.document_type, status: "classified" })
    .where(eq(fundReports.id, id));

  return NextResponse.json(classification);
}
