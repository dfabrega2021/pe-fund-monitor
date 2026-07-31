"use client";

import { useState } from "react";
import type { GpCommentaryHistoryEntry } from "@/lib/db/queries";

type Props = {
  history: GpCommentaryHistoryEntry[];
};

// Shows every quarter's GP commentary as an accordion, most recent first and
// expanded by default - previously this only ever showed the latest quarter,
// which meant there was no way to see how the GP's own narrative evolved
// (e.g. "watch list" language two quarters before a markdown actually shows up).
export function GpCommentaryPanel({ history }: Props) {
  const sorted = [...history].sort(
    (a, b) => b.reportYear * 4 + b.reportQuarter - (a.reportYear * 4 + a.reportQuarter)
  );
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(sorted[0]?.period ?? null);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted">No GP commentary available yet.</p>;
  }

  return (
    <div className="space-y-3">
      {sorted.map((entry) => {
        const isExpanded = expandedPeriod === entry.period;
        return (
          <div key={entry.period} className="rounded-md border border-hairline">
            <button
              onClick={() => setExpandedPeriod(isExpanded ? null : entry.period)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-surface"
            >
              <span className="text-sm font-medium text-navy">{entry.period}</span>
              <span className="text-xs text-muted">{isExpanded ? "Hide" : "Show"}</span>
            </button>
            {isExpanded && (
              <div className="space-y-3 border-t border-hairline px-4 py-3">
                {entry.rawText && (
                  <p className="text-sm leading-relaxed text-navy">{entry.rawText}</p>
                )}
                {entry.gpStatedNotableChanges.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      GP-Stated Notable Changes
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-navy">
                      {entry.gpStatedNotableChanges.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {entry.macroRiskMentions.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      Macro / Risk Mentions
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-navy">
                      {entry.macroRiskMentions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {entry.advanceCapitalCallNotes.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">
                      Advance Capital Call Notes
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-navy">
                      {entry.advanceCapitalCallNotes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!entry.rawText &&
                  entry.gpStatedNotableChanges.length === 0 &&
                  entry.macroRiskMentions.length === 0 &&
                  entry.advanceCapitalCallNotes.length === 0 && (
                    <p className="text-sm text-muted">No commentary text captured for this quarter.</p>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
