import { ollamaProvider } from "./providers/ollama";
import type { DocumentClassification, DocumentType } from "./schemas";

export type { DocumentClassification, DocumentType };

// Single backend: local Ollama vision model. Nothing about the document ever
// leaves this machine - see architecture.md's "Data Handling & Confidentiality"
// section. (A cloud/Gemini backend was prototyped and removed once the local
// path was confirmed working - see the Decisions Log.)
export async function classifyDocument(pdfBuffer: Buffer): Promise<DocumentClassification> {
  return ollamaProvider.classifyDocument(pdfBuffer);
}
