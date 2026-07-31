"use client";

import { useState } from "react";
import { formatQuarter } from "@/lib/format";

type FlagRow = {
  id: string;
  reportYear: number;
  reportQuarter: number;
  severity: "info" | "warning" | "critical";
  message: string;
};

type Props = {
  flags: FlagRow[];
  latestYear: number | null;
  latestQuarter: number | null;
};

// Same severity -> style mapping as FlagsQueue.tsx/AlertsCenter.tsx - kept in
// sync manually rather than shared, but must stay identical: severity is
// meant to be triaged by color at a glance, the same way everywhere else in
// the app already works.
const severityStyles = {
  critical: "border-negative bg-negative-light text-negative",
  warning: "border-gold bg-gold-light text-navy",
  info: "border-hairline bg-surface text-muted",
};

// Defaults to the position's latest reported quarter, not this position's
// entire flag history - a Q1 flag sitting alongside a Q4 one made it look
// like three separate live problems when really only the current quarter's
// picture matters day to day. Older flags aren't necessarily "resolved" (this
// app has no resolve workflow - `resolved` in the DB is never actually set to
// true anywhere), so they're labeled "Earlier Quarters," not "Resolved," and
// tucked behind a toggle instead of being deleted from view.
export function CompanyFlagsPanel({ flags, latestYear, latestQuarter }: Props) {
  const [showHistorical, setShowHistorical] = useState(false);

  if (flags.length === 0) return null;

  const current = flags.filter((f) => f.reportYear === latestYear && f.reportQuarter === latestQuarter);
  const historical = flags.filter((f) => !(f.reportYear === latestYear && f.reportQuarter === latestQuarter));
  const toShow = current.length > 0 ? current : flags;
  const remainder = current.length > 0 ? historical : [];

  return (
    <section>
      <h2 className="mb-4 text-lg font-medium text-navy">Open Flags for This Position</h2>
      <div className="space-y-2">
        {toShow.map((f) => (
          <div key={f.id} className={`rounded-lg border px-4 py-3 text-sm ${severityStyles[f.severity]}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">
              {f.severity} · {formatQuarter(f.reportYear, f.reportQuarter)}
            </p>
            <p className="mt-1">{f.message}</p>
          </div>
        ))}
      </div>
      {remainder.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistorical((v) => !v)}
            className="text-xs font-medium text-gold hover:underline"
          >
            {showHistorical ? "Hide" : "Show"} earlier quarters ({remainder.length})
          </button>
          {showHistorical && (
            <div className="mt-2 space-y-2">
              {remainder.map((f) => (
                <div
                  key={f.id}
                  className={`rounded-lg border px-4 py-3 text-sm opacity-70 ${severityStyles[f.severity]}`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                    {f.severity} · {formatQuarter(f.reportYear, f.reportQuarter)}
                  </p>
                  <p className="mt-1">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
