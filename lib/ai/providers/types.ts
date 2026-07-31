import type { DocumentClassification, DocumentType, FundReportExtraction } from "../schemas";

// Every AI backend (Gemini, Ollama-local, and any future one) implements this
// exact shape. lib/ai/classify.ts and lib/ai/extraction.ts dispatch to
// whichever provider AI_PROVIDER selects - nothing else in the app (API
// routes, validation, review screen) ever imports a provider directly.
export interface AIProvider {
  classifyDocument(pdfBuffer: Buffer): Promise<DocumentClassification>;
  extractReport(pdfBuffer: Buffer, documentType: DocumentType): Promise<FundReportExtraction>;
}
