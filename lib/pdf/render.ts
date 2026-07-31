import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Renders each page of a PDF to a PNG buffer, using poppler's `pdftoppm`
// binary. This exists only for the local Ollama vision provider (see
// providers/ollama.ts) - vision-capable local models take images, not PDFs,
// unlike Gemini/Claude which accept a PDF document block directly.
//
// Requires poppler installed locally:
//   macOS:  brew install poppler
//   Ubuntu: apt-get install poppler-utils
//
// Deliberately shells out to the poppler CLI rather than pulling in a
// pdf.js + node-canvas dependency - canvas's native bindings are a common
// source of install friction, and poppler is a single, well-known system
// dependency that's already the standard tool for this on most machines.

const DPI = 150; // enough resolution for a vision model to read financial tables cleanly

export async function renderPdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "pe-fund-monitor-pdf-"));
  const inputPath = path.join(dir, "input.pdf");
  const outputPrefix = path.join(dir, "page");

  try {
    await writeFile(inputPath, pdfBuffer);
    await runPdftoppm(inputPath, outputPrefix);

    const files = (await readdir(dir))
      .filter((f) => f.startsWith("page") && f.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      throw new Error("pdftoppm produced no output pages - is the PDF valid/non-empty?");
    }

    return await Promise.all(files.map((f) => readFile(path.join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runPdftoppm(inputPath: string, outputPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pdftoppm", ["-png", "-r", String(DPI), inputPath, outputPrefix]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "pdftoppm not found. Install poppler first: macOS `brew install poppler`, Ubuntu `apt-get install poppler-utils`."
          )
        );
      } else {
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pdftoppm exited with code ${code}: ${stderr}`));
    });
  });
}
