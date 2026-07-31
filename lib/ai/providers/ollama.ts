import { renderPdfToImages } from "@/lib/pdf/render";
import type { AIProvider } from "./types";
import {
  CLASSIFICATION_PROMPT,
  CLASSIFICATION_SCHEMA,
  FINANCIALS_PROMPT,
  FINANCIALS_SCHEMA,
  COMMENTARY_PROMPT,
  COMMENTARY_SCHEMA,
  type DocumentClassification,
  type DocumentType,
  type FundReportExtraction,
  type ExtractedPortfolioCompany,
} from "../schemas";

type FinancialsResult = Omit<FundReportExtraction, "gp_commentary">;
type CommentaryResult = FundReportExtraction["gp_commentary"];

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Combines partial FinancialsResults from successive page chunks of the same
// document into one. Each chunk only sees a handful of pages, so most fields
// are additive (a portfolio company's tear sheet is 1-2 pages; a chunk either
// has it or doesn't) rather than needing real conflict resolution.
function mergeFinancials(a: FinancialsResult, b: FinancialsResult): FinancialsResult {
  const returnBases = [...a.return_bases];
  for (const rb of b.return_bases) {
    const key = `${rb.vehicle_name.toLowerCase()}|${rb.basis}`;
    if (!returnBases.some((r) => `${r.vehicle_name.toLowerCase()}|${r.basis}` === key)) {
      returnBases.push(rb);
    }
  }

  const companies: ExtractedPortfolioCompany[] = [...a.portfolio_companies];
  for (const pc of b.portfolio_companies) {
    const existing = companies.find((c) => c.name.toLowerCase() === pc.name.toLowerCase());
    if (!existing) {
      companies.push(pc);
    } else {
      // Same company seen in an earlier chunk (e.g. mentioned on a summary
      // page, then again on its own tear sheet page) - fill in whichever
      // fields the earlier sighting was missing rather than duplicate the row.
      existing.sector ??= pc.sector;
      existing.investment_date ??= pc.investment_date;
      existing.valuation ??= pc.valuation;
      existing.cost_basis ??= pc.cost_basis;
      existing.committed_capital ??= pc.committed_capital;
      existing.ownership_pct ??= pc.ownership_pct;
      existing.gross_moic ??= pc.gross_moic;
      existing.gross_irr ??= pc.gross_irr;
      existing.net_debt_to_ebitda ??= pc.net_debt_to_ebitda;
      existing.debt_facility_capacity ??= pc.debt_facility_capacity;
      existing.debt_facility_drawn ??= pc.debt_facility_drawn;
      existing.hedged_pct ??= pc.hedged_pct;
      existing.hedge_floor_price ??= pc.hedge_floor_price;
      existing.hedge_price_unit ??= pc.hedge_price_unit;
      existing.realized_proceeds ??= pc.realized_proceeds;
      existing.investment_type ??= pc.investment_type;
      existing.board_seats ??= pc.board_seats;
      existing.investment_thesis ??= pc.investment_thesis;
      existing.significant_developments = [
        ...existing.significant_developments,
        ...pc.significant_developments.filter((d) => !existing.significant_developments.includes(d)),
      ];
    }
  }

  return {
    fund_name: a.fund_name || b.fund_name,
    report_period: a.report_period ?? b.report_period,
    return_bases: returnBases,
    portfolio_companies: companies,
    extraction_meta: {
      fields_with_low_confidence: Array.from(
        new Set([...a.extraction_meta.fields_with_low_confidence, ...b.extraction_meta.fields_with_low_confidence])
      ),
      source_page_refs: { ...b.extraction_meta.source_page_refs, ...a.extraction_meta.source_page_refs },
    },
  };
}

// The (only) AI backend: a vision-capable open model served by Ollama on the
// same machine (or another machine on your own network). Nothing about the
// document ever leaves the box running `ollama serve` - no third-party API
// call is made anywhere in this pipeline. This is what makes it safe to run
// against real, confidential GP reports under NDA. See architecture.md's
// "Data Handling & Confidentiality" section for the full reasoning.
//
// (A cloud backend using Gemini was prototyped behind a pluggable interface
// and then removed entirely once this local path was confirmed working -
// see the Decisions Log in architecture.md. No cloud AI code path exists in
// this project at all now, by design.)
//
// Setup (one-time, on whichever machine will run extraction):
//   1. Install Ollama: https://ollama.com/download
//   2. Pull a vision-capable model, sized to your machine's free RAM (not total RAM -
//      subtract whatever Chrome/VS Code/etc. are already using):
//        ollama pull llava-phi3     (default - tested stable on an 8GB MacBook Pro; moondream
//                                     was too weak for document classification, qwen2.5vl:7b
//                                     crashed the machine outright on the same hardware)
//        ollama pull moondream      (fallback if llava-phi3 is still too much - ~1.7GB, weaker)
//        ollama pull qwen2.5vl:7b   (best accuracy, only on a machine with real RAM to spare -
//                                     16GB+ recommended, since this alone can need 6-8GB)
//   3. Make sure `ollama serve` is running (it runs automatically after install on macOS).
//   4. Also install poppler for PDF->image rendering (see lib/pdf/render.ts):
//        macOS:  brew install poppler
//        Ubuntu: apt-get install poppler-utils
//
// Honest trade-off: local open vision models are a notch below top cloud
// models on raw accuracy, and this pipeline renders pages to images rather
// than using native PDF input. `llava-phi3` in particular has a hard, fixed
// ~4096-token context ceiling that page images alone can exceed on longer
// documents (e.g. multi-company tear sheets) - not overridable via num_ctx,
// this is baked into the model checkpoint. To work within that, extractReport()
// below sends PAGES_PER_CHUNK pages per call instead of the whole document at
// once, and merges the partial results. What you get in exchange for these
// constraints: zero data leaves your machine, which is the actual requirement
// for real GP reports under NDA.

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_VISION_MODEL ?? "llava-phi3";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 300_000); // local inference can be slow on CPU-only machines
// How many rendered page images go into a single Ollama call. Each page image
// costs real tokens out of the model's fixed context budget (confirmed via a
// real 400 error: 10 pages of a tear-sheet PDF alone cost 10,025 tokens
// against a 4096-token ceiling, before any output). 2 is conservative on
// purpose - safer to make more, faster calls than to hit this error again
// partway through a batch upload. Override with OLLAMA_PAGES_PER_CHUNK if a
// bigger local model changes the math.
const PAGES_PER_CHUNK = Number(process.env.OLLAMA_PAGES_PER_CHUNK ?? 2);

async function ollamaChat(images: Buffer[], prompt: string, schema: object): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: schema,
        messages: [
          {
            role: "user",
            content: prompt,
            images: images.map((img) => img.toString("base64")),
          },
        ],
        // Ollama's default context window is small enough that page images
        // alone can eat most of it, leaving too little room for the model to
        // finish writing a long extraction JSON - the symptom is a response
        // that cuts off mid-string ("Unterminated string in JSON"), not an
        // error from Ollama itself. Raised here to give it room to finish.
        // This does use more RAM; lower it again if it causes crashes on
        // constrained hardware, in which case a shorter document (fewer
        // pages per call) is the safer way to get a complete response.
        options: {
          num_ctx: 8192,
          num_predict: 4096,
        },
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(
        `Ollama request timed out after ${TIMEOUT_MS}ms. Local vision inference over multiple pages can be slow - ` +
          "raise OLLAMA_TIMEOUT_MS in .env.local if your hardware needs more time."
      );
    }
    throw new Error(
      `Could not reach Ollama at ${BASE_URL}. Is \`ollama serve\` running, and is "${MODEL}" pulled? ` +
        `(ollama pull ${MODEL})  Original error: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status} ${response.statusText}: ${await response.text()}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) {
    throw new Error("Ollama returned no message content.");
  }
  return content;
}

// Plain-text call for the AI investment summary (see lib/ai/summary.ts) - no
// page images, no JSON-schema-constrained output. The summary's input is
// already-structured data (numbers + GP commentary text already pulled out of
// the document by extractReport()), not a raw document, so this prompt is
// small and a free-text narrative answer is actually more useful here than
// forcing another JSON shape. Deliberately reuses the same local MODEL/BASE_URL -
// same "nothing leaves the machine" guarantee as document extraction.
async function ollamaChatText(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: "user", content: prompt }],
        options: { num_ctx: 8192, num_predict: 1024 },
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Ollama request timed out after ${TIMEOUT_MS}ms generating the investment summary.`);
    }
    throw new Error(
      `Could not reach Ollama at ${BASE_URL}. Is \`ollama serve\` running, and is "${MODEL}" pulled? ` +
        `Original error: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status} ${response.statusText}: ${await response.text()}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) {
    throw new Error("Ollama returned no message content.");
  }
  return content;
}

export async function generateNarrative(prompt: string): Promise<{ text: string; model: string }> {
  const text = await ollamaChatText(prompt);
  return { text: text.trim(), model: MODEL };
}

function parseModelJson<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (err) {
    const looksTruncated = /unterminated string|unexpected end of json/i.test((err as Error).message);
    throw new Error(
      `${label} response wasn't valid JSON${looksTruncated ? " - it looks like the model got cut off before finishing" : ""}. ` +
        `${looksTruncated ? "Try again (num_ctx/num_predict were raised to help this), or use a document with fewer pages. " : ""}` +
        `Raw error: ${(err as Error).message}`
    );
  }
}

async function classifyDocument(pdfBuffer: Buffer): Promise<DocumentClassification> {
  // Classification only needs the cover/first page - fund name, title, and
  // document type are always evident there in the sample reports.
  const pages = await renderPdfToImages(pdfBuffer);
  const firstPage = pages.slice(0, 1);
  const content = await ollamaChat(firstPage, CLASSIFICATION_PROMPT, CLASSIFICATION_SCHEMA);
  return parseModelJson<DocumentClassification>(content, "Classification");
}

async function extractReport(pdfBuffer: Buffer, documentType: DocumentType): Promise<FundReportExtraction> {
  if (documentType === "annual_letter" || documentType === "marketing_other") {
    throw new Error(`extractReport() should not be called for document_type "${documentType}"`);
  }

  const pages = await renderPdfToImages(pdfBuffer);
  const pageChunks = chunkArray(pages, PAGES_PER_CHUNK);

  // Financials: one call per PAGES_PER_CHUNK-page chunk, merged together.
  // Sequential (not parallel) on purpose - this is a single local model
  // process on constrained hardware, and running inferences concurrently
  // would compete for the same RAM/CPU rather than speed anything up.
  let financials: FinancialsResult | null = null;
  for (let i = 0; i < pageChunks.length; i++) {
    const content = await ollamaChat(pageChunks[i], FINANCIALS_PROMPT, FINANCIALS_SCHEMA);
    const partial = parseModelJson<FinancialsResult>(content, `Financials extraction (pages ${i * PAGES_PER_CHUNK + 1}-${i * PAGES_PER_CHUNK + pageChunks[i].length})`);
    financials = financials ? mergeFinancials(financials, partial) : partial;
  }
  if (!financials) {
    throw new Error("Document has no pages to extract from.");
  }

  // Commentary: just the first chunk. GP letters put their commentary/notable
  // changes up front, and running this on every chunk would multiply calls
  // for no benefit (tear sheets etc. rarely repeat GP-level commentary
  // per company page).
  const commentaryContent = await ollamaChat(pageChunks[0], COMMENTARY_PROMPT, COMMENTARY_SCHEMA);
  const gp_commentary = parseModelJson<CommentaryResult>(commentaryContent, "Commentary extraction");

  return { ...financials, gp_commentary };
}

export const ollamaProvider: AIProvider = { classifyDocument, extractReport };
