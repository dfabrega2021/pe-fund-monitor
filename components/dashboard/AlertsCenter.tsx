"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OpenFlagRow } from "@/lib/db/queries";
import { formatQuarter } from "@/lib/format";

type Props = {
  flags: OpenFlagRow[];
};

const SEVERITIES: OpenFlagRow["severity"][] = ["critical", "warning", "info"];
const CATEGORIES: OpenFlagRow["category"][] = ["Fund Metrics", "Portfolio Company", "Commentary", "Other"];
const SEVERITY_RANK: Record<OpenFlagRow["severity"], number> = { critical: 0, warning: 1, info: 2 };

const severityStyles: Record<OpenFlagRow["severity"], string> = {
  critical: "border-negative bg-negative-light text-negative",
  warning: "border-gold bg-gold-light text-navy",
  info: "border-hairline bg-surface text-muted",
};

type FlagGroup = {
  key: string;
  fundId: string;
  fundName: string;
  companyId: string | null;
  companyName: string | null;
  category: OpenFlagRow["category"];
  severity: OpenFlagRow["severity"]; // from the most recent occurrence
  latestMessage: string;
  latestYear: number;
  latestQuarter: number;
  occurrences: { year: number; quarter: number; message: string; severity: OpenFlagRow["severity"] }[];
};

// Same underlying issue (this fund/company, this specific field+check) raised
// quarter after quarter is one ongoing problem, not N unrelated alerts - this
// app has no flag-resolution workflow (validationFlags.resolved is queried
// but never set true anywhere), so without grouping, a single stuck issue
// clutters the list as one row per quarter it's been open. Grouping surfaces
// the thing a flat list can't: "this has been critical for 3 quarters
// running" is a materially different, more urgent signal than "this was
// flagged once, this quarter."
function groupFlags(flags: OpenFlagRow[]): FlagGroup[] {
  const groups = new Map<string, FlagGroup>();
  for (const f of flags) {
    const key = `${f.fundId}|${f.companyId ?? "fund"}|${f.fieldName}|${f.flagType}`;
    const existing = groups.get(key);
    const occurrence = { year: f.reportYear, quarter: f.reportQuarter, message: f.message, severity: f.severity };
    if (!existing) {
      groups.set(key, {
        key,
        fundId: f.fundId,
        fundName: f.fundName,
        companyId: f.companyId,
        companyName: f.companyName,
        category: f.category,
        severity: f.severity,
        latestMessage: f.message,
        latestYear: f.reportYear,
        latestQuarter: f.reportQuarter,
        occurrences: [occurrence],
      });
    } else {
      existing.occurrences.push(occurrence);
      // Keep whichever occurrence is most recent as the representative one -
      // severity can shift quarter to quarter (e.g. a warning escalating to
      // critical), so the latest read should win, not the first.
      const isNewer =
        f.reportYear > existing.latestYear ||
        (f.reportYear === existing.latestYear && f.reportQuarter > existing.latestQuarter);
      if (isNewer) {
        existing.severity = f.severity;
        existing.latestMessage = f.message;
        existing.latestYear = f.reportYear;
        existing.latestQuarter = f.reportQuarter;
      }
    }
  }
  return Array.from(groups.values()).map((g) => ({
    ...g,
    occurrences: g.occurrences.sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter)),
  }));
}

// Full, filterable audit trail of every open validation flag across the
// book - not a duplicate of the Executive Summary's current-quarter snapshot.
// Its job is different: rank every open issue by what actually matters
// (severity, then how long it's been dragging on) so a CIO can answer "what's
// our worst open problem" and "has this been ignored," not just "what's new
// this quarter."
export function AlertsCenter({ flags }: Props) {
  const [severityFilter, setSeverityFilter] = useState<Set<OpenFlagRow["severity"]>>(new Set(SEVERITIES));
  const [categoryFilter, setCategoryFilter] = useState<Set<OpenFlagRow["category"]>>(new Set(CATEGORIES));
  const [fundFilter, setFundFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const groups = useMemo(() => groupFlags(flags), [flags]);

  // Excludes fundFilter deliberately - this feeds both the fund picker
  // dropdown and the by-fund rollup below, and both need to keep showing
  // every fund (not just the one currently selected) so you can switch
  // funds without resetting the filter first.
  const preFundFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (!severityFilter.has(g.severity)) return false;
      if (!categoryFilter.has(g.category)) return false;
      if (q && !g.fundName.toLowerCase().includes(q) && !g.latestMessage.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, severityFilter, categoryFilter, search]);

  const filtered = useMemo(() => {
    return preFundFilter
      .filter((g) => !fundFilter || g.fundId === fundFilter)
      .sort((a, b) => {
        const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (sevDiff !== 0) return sevDiff;
        const persistenceDiff = b.occurrences.length - a.occurrences.length;
        if (persistenceDiff !== 0) return persistenceDiff;
        return (b.latestYear - a.latestYear) || (b.latestQuarter - a.latestQuarter);
      });
  }, [preFundFilter, fundFilter]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const g of filtered) counts[g.severity]++;
    return counts;
  }, [filtered]);

  // "Which funds are worst" at a glance - without this, spotting a pattern
  // like "3 funds all have leverage-creep flags" means scrolling the whole
  // list and tallying fund names by eye, the same problem book-level
  // concentration widgets elsewhere in this app solve by rolling up to the
  // entity level instead of listing every row. Ranked the same way the main
  // list is (severity, then count) so the worst funds sort to the top
  // regardless of how many funds are in the book. Only funds with at least
  // one open issue are listed - a 40-fund book where most funds are quiet
  // shouldn't show 35 rows of zeroes.
  const byFund = useMemo(() => {
    const byId = new Map<
      string,
      { fundId: string; fundName: string; critical: number; warning: number; info: number; total: number }
    >();
    for (const g of preFundFilter) {
      const entry = byId.get(g.fundId) ?? {
        fundId: g.fundId,
        fundName: g.fundName,
        critical: 0,
        warning: 0,
        info: 0,
        total: 0,
      };
      entry[g.severity]++;
      entry.total++;
      byId.set(g.fundId, entry);
    }
    return Array.from(byId.values()).sort(
      (a, b) => b.critical - a.critical || b.warning - a.warning || b.total - a.total
    );
  }, [preFundFilter]);

  const fundOptions = useMemo(
    () =>
      Array.from(new Map(groups.map((g) => [g.fundId, g.fundName])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1])
      ),
    [groups]
  );

  const toggleSeverity = (s: OpenFlagRow["severity"]) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleCategory = (c: OpenFlagRow["category"]) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-hairline bg-card p-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => toggleSeverity(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition ${
                severityFilter.has(s) ? severityStyles[s] : "border-hairline bg-surface text-muted opacity-60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-hairline" />
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                categoryFilter.has(c) ? "border-navy bg-navy text-white" : "border-hairline bg-surface text-muted opacity-60"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <select
          value={fundFilter ?? ""}
          onChange={(e) => setFundFilter(e.target.value || null)}
          className="rounded-md border border-hairline bg-card px-2.5 py-1.5 text-sm text-navy focus:border-gold focus:outline-none"
        >
          <option value="">All Funds</option>
          {fundOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fund or message..."
          className="ml-auto min-w-[200px] rounded-md border border-hairline px-3 py-1.5 text-sm text-navy placeholder:text-muted focus:border-gold focus:outline-none"
        />
      </div>

      {byFund.length > 1 && (
        <div className="rounded-lg border border-hairline bg-card p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Open Issues by Fund
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {byFund.map((f) => (
              <button
                key={f.fundId}
                onClick={() => setFundFilter(fundFilter === f.fundId ? null : f.fundId)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${
                  fundFilter === f.fundId ? "bg-navy text-white" : "hover:bg-surface"
                }`}
              >
                <span className={fundFilter === f.fundId ? "text-white" : "text-navy"}>{f.fundName}</span>
                <span className="flex items-center gap-1.5 text-xs">
                  {f.critical > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        fundFilter === f.fundId ? "bg-white/20 text-white" : "bg-negative-light text-negative"
                      }`}
                    >
                      {f.critical} critical
                    </span>
                  )}
                  {f.warning > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        fundFilter === f.fundId ? "bg-white/20 text-white" : "bg-gold-light text-navy"
                      }`}
                    >
                      {f.warning} warning
                    </span>
                  )}
                  {f.info > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        fundFilter === f.fundId ? "bg-white/20 text-white" : "bg-surface text-muted"
                      }`}
                    >
                      {f.info} info
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">
          {filtered.length} open issue{filtered.length === 1 ? "" : "s"}
        </span>
        {severityCounts.critical > 0 && (
          <span className="rounded-full border border-negative bg-negative-light px-2.5 py-0.5 text-xs font-medium text-negative">
            {severityCounts.critical} critical
          </span>
        )}
        {severityCounts.warning > 0 && (
          <span className="rounded-full border border-gold bg-gold-light px-2.5 py-0.5 text-xs font-medium text-navy">
            {severityCounts.warning} warning
          </span>
        )}
        {severityCounts.info > 0 && (
          <span className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
            {severityCounts.info} info
          </span>
        )}
      </div>
      <p className="text-xs text-muted">Ranked by severity, then by how long each issue has been open.</p>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-card px-4 py-6 text-sm text-muted shadow-sm">
          No open flags match the current filters.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => {
            const isRecurring = g.occurrences.length > 1;
            const isExpanded = expandedKey === g.key;
            return (
              <div key={g.key} className={`rounded-lg border px-4 py-3 ${severityStyles[g.severity]}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                  <span>{g.severity}</span>
                  <span className="opacity-60">·</span>
                  <span>{g.category}</span>
                  <span className="opacity-60">·</span>
                  <span>{formatQuarter(g.latestYear, g.latestQuarter)}</span>
                  {isRecurring && (
                    <>
                      <span className="opacity-60">·</span>
                      <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold normal-case text-white">
                        Open {g.occurrences.length} quarters running
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <Link href={`/funds/${g.fundId}`} className="text-sm font-semibold hover:underline">
                    {g.fundName}
                  </Link>
                  {g.companyId && (
                    <Link href={`/companies/${g.companyId}`} className="text-xs underline opacity-80 hover:opacity-100">
                      View {g.companyName}
                    </Link>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed opacity-90">{g.latestMessage}</p>
                {isRecurring && (
                  <div className="mt-2">
                    <button
                      onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                      className="text-xs font-medium underline opacity-80 hover:opacity-100"
                    >
                      {isExpanded ? "Hide" : "Show"} history ({g.occurrences.length} quarters)
                    </button>
                    {isExpanded && (
                      <ul className="mt-2 space-y-1.5 border-l-2 border-current/30 pl-3 opacity-90">
                        {g.occurrences.map((o) => (
                          <li key={`${o.year}-${o.quarter}`} className="text-xs">
                            <span className="font-medium">{formatQuarter(o.year, o.quarter)}:</span> {o.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
