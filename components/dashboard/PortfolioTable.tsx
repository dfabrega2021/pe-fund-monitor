"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { PortfolioCompanyRow, CompanyDevelopment } from "@/lib/db/queries";
import { formatCurrency, formatMultiple } from "@/lib/format";
import { CONCENTRATION_THRESHOLD_PCT, AT_COST_STREAK_THRESHOLD } from "@/lib/validation/rules";

type Props = {
  companies: PortfolioCompanyRow[];
  latestPeriod: string | null;
  developmentsByCompanyId: Record<string, CompanyDevelopment[]>;
};

export function PortfolioTable({
  companies,
  latestPeriod,
  developmentsByCompanyId,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (companies.length === 0) {
    return (
      <p className="text-sm text-muted">No portfolio company data for the latest quarter.</p>
    );
  }

  return (
    <div>
      {latestPeriod && (
        <p className="mb-3 text-sm text-muted">
          Sorted by contribution to fund NAV · {latestPeriod}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3 text-right">Valuation</th>
              <th className="px-4 py-3 text-right">% of NAV</th>
              <th className="px-4 py-3 text-right">QoQ Change</th>
              <th className="px-4 py-3 text-right">MOIC</th>
              <th className="px-4 py-3 text-right">Committed / Unfunded</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {companies.map((c) => {
              const developments = developmentsByCompanyId[c.id] ?? [];
              const isExpanded = expandedId === c.id;

              return (
                <Fragment key={c.id}>
                  <tr
                    className="cursor-pointer hover:bg-surface"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/companies/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-navy hover:text-gold hover:underline"
                      >
                        {c.companyName}
                      </Link>
                      {c.sector && <p className="text-xs text-muted">{c.sector}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(c.valuation)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.pctOfFundNav != null ? (
                        <span>
                          {c.pctOfFundNav.toFixed(1)}%
                          {c.pctOfFundNav >= CONCENTRATION_THRESHOLD_PCT && (
                            <span
                              className="ml-1.5 inline-flex items-center rounded-full bg-negative-light px-2 py-0.5 text-xs font-medium text-negative"
                              title={`Above the ${CONCENTRATION_THRESHOLD_PCT}% single-name concentration threshold.`}
                            >
                              Concentrated
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.qoqChangePct != null ? (
                        <span className={c.qoqChangePct >= 0 ? "text-positive" : "text-negative"}>
                          {c.qoqChangePct >= 0 ? "+" : ""}
                          {c.qoqChangePct.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.grossMoic != null ? (
                        formatMultiple(c.grossMoic)
                      ) : c.consecutiveAtCostQuarters >= AT_COST_STREAK_THRESHOLD ? (
                        <span
                          className="inline-flex items-center rounded-full bg-negative-light px-2 py-0.5 text-xs font-medium text-negative"
                          title={`Held "at cost" for ${c.consecutiveAtCostQuarters} consecutive quarters.`}
                        >
                          At Cost {c.consecutiveAtCostQuarters}q
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full bg-gold-light px-2 py-0.5 text-xs font-medium text-gold"
                          title="Held at cost — not yet marked to a fair value different from invested capital."
                        >
                          At Cost
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.committedCapital != null ? (
                        <span>
                          {formatCurrency(c.committedCapital)}
                          {c.unfundedCapital != null && c.unfundedCapital > 0 && (
                            <span className="ml-1 text-xs text-muted">
                              ({formatCurrency(c.unfundedCapital)} unfunded)
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted">
                      {c.status.replace("_", " ")}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="bg-surface px-4 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                          Development timeline — {c.companyName}
                        </p>
                        {developments.length === 0 ? (
                          <p className="text-sm text-muted">
                            No significant developments logged across quarters.
                          </p>
                        ) : (
                          <ol className="space-y-3 border-l-2 border-hairline pl-4">
                            {developments.map((d) => (
                              <li key={d.id} className="relative">
                                <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-gold" />
                                <p className="text-xs font-medium text-muted">{d.period}</p>
                                <p className="text-sm leading-relaxed text-navy">
                                  {d.developmentText}
                                </p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Click the company name for its full detail page, or elsewhere in the row to expand the development timeline.
      </p>
    </div>
  );
}
