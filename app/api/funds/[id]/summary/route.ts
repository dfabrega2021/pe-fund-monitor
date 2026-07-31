import { NextResponse } from "next/server";
import { getLatestAiSummary } from "@/lib/db/queries";
import { generateFundSummary } from "@/lib/ai/summary";

// GET returns whatever summary is already stored (fast, no AI call - safe to
// call on every page load, including on a hosted deployment with no reachable
// Ollama instance). POST actually (re)generates one - only works wherever
// Ollama is reachable, i.e. locally, not on the hosted demo.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = await getLatestAiSummary(id);
  return NextResponse.json({ summary });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await generateFundSummary(id);
    if (!result) {
      return NextResponse.json(
        { error: "No reported data for this fund yet - upload at least one quarter first." },
        { status: 400 }
      );
    }
    return NextResponse.json({ summary: { text: result.text, modelUsed: result.model, createdAt: new Date() } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
