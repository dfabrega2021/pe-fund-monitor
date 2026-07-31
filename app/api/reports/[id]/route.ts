import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fundReports, documentTypeEnum } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const VALID_TYPES = documentTypeEnum.enumValues;

// Lets a human correct a wrong AI classification before extraction - small
// local vision models sometimes misjudge document_type (e.g. a glossy
// investor report cover page read as marketing material). This is not a
// workaround; a fiduciary-facing tool shouldn't blindly trust an AI
// classification any more than it should blindly trust an AI extraction -
// see architecture.md's "Data Handling & Confidentiality" section.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { documentType } = body;

  if (!VALID_TYPES.includes(documentType)) {
    return NextResponse.json(
      { error: `documentType must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const [report] = await db
    .update(fundReports)
    .set({ documentType, status: "classified" })
    .where(eq(fundReports.id, id))
    .returning();

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json(report);
}
