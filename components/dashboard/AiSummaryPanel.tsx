"use client";

import { useEffect, useState } from "react";

// Same flag used to gate the Upload page: whether this deployment can reach
// a local Ollama instance at all. Summary generation is a much lighter, text-only
// call than document extraction, but it still needs the same local model, so
// the same on/off switch applies - a hosted deployment shows whatever summary
// was already generated (or none) rather than a "Generate" button that can't work.
const EXTRACTION_AVAILABLE = process.env.NEXT_PUBLIC_EXTRACTION_AVAILABLE !== "false";

type Summary = { text: string; modelUsed: string; createdAt: string } | null;

export function AiSummaryPanel({ fundId }: { fundId: string }) {
  const [summary, setSummary] = useState<Summary>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/funds/${fundId}/summary`)
      .then((r) => r.json())
      .then((data) => setSummary(data.summary))
      .finally(() => setLoading(false));
  }, [fundId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/funds/${fundId}/summary`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate summary.");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-hairline bg-card p-6 text-sm text-muted shadow-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-hairline bg-card p-6 shadow-sm">
      {summary ? (
        <>
          <p className="whitespace-pre-line text-sm leading-relaxed text-navy">{summary.text}</p>
          <p className="mt-4 text-xs text-muted">
            Generated locally by {summary.modelUsed} (not a third-party AI service) ·{" "}
            {new Date(summary.createdAt).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">No AI summary generated yet for this fund.</p>
      )}

      {EXTRACTION_AVAILABLE ? (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-4 rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy2 disabled:opacity-50"
        >
          {generating
            ? "Generating (can take a minute on local hardware)..."
            : summary
              ? "Regenerate summary"
              : "Generate AI summary"}
        </button>
      ) : (
        !summary && (
          <p className="mt-2 text-xs text-muted">
            Summary generation runs against a local model and isn&apos;t available on this hosted demo.
          </p>
        )
      )}
      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
    </div>
  );
}
