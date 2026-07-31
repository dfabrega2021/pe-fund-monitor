import { ollamaProvider } from "./providers/ollama";
import type { DocumentType } from "./schemas";
import type {
  ExtractedPortfolioCompany,
  FundReportExtraction,
  ReturnBasisRow,
} from "./schemas";

export type { ExtractedPortfolioCompany, FundReportExtraction, ReturnBasisRow };

// Single backend: local Ollama vision model - see classify.ts and
// architecture.md's "Data Handling & Confidentiality" section for why.
// Mirrors the FundReportExtraction contract in architecture.md Section 5 -
// the validation layer and DB commit step key off this shape.
export async function extractReport(
  pdfBuffer: Buffer,
  documentType: DocumentType
): Promise<FundReportExtraction> {
  return ollamaProvider.extractReport(pdfBuffer, documentType);
}
