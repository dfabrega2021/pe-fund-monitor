"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CompanyOverviewRow } from "@/lib/db/queries";
import { formatCurrency, formatMultiple, formatPercent, ASSET_CLASS_LABELS, type AssetClass } from "@/lib/format";

type Props = {
  companies: CompanyOverviewRow[];
};

type SortKey = "valuation" | "grossMoic" | "grossIrr" | "companyName" | "fundName";

// Cross-fund portfolio company list - every position across every fund in one
// sortable, filterable table. This is the book-scale answer to "what do we
// own," as distinct from the per-fund PortfolioTable which only shows one
// fund's holdings at a time.
export function CompanyExplorer({ companies }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClass | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("valuation");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const assetClasses = useMemo(
    () => Array.from(new Set(companies.map((c) => c.assetClass))),
    [companies]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = companies.filter((c) => {
      if (assetClassFilter !== "all" && c.assetClass !== assetClassFilter) return false;
      if (
        q &&
        !c.companyName.toLowerCase().includes(q) &&
        !c.fundName.toLowerCase().includes(q) &&
        !(c.sector ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "companyName" || sortKey === "fundName") {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      } else {
        cmp = (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [companies, search, assetClassFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ^" : " v") : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card p-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAssetClassFilter("all")}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              assetClassFilter === "all" ? "border-navy bg-navy text-white" : "border-hairline bg-surface text-muted"
            }`}
          >
            All
          </button>
          {assetClasses.map((ac) => (
            <button
              key={ac}
              onClick={() => setAssetClassFilter(ac)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                assetClassFilter === ac ? "border-navy bg-navy text-white" : "border-hairline bg-surface text-muted"
              }`}
            >
              {ASSET_CLASS_LABELS[ac]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, fund, or sector..."
          className="ml-auto min-w-[220px] rounded-md border border-hairline px-3 py-1.5 text-sm text-navy placeholder:text-muted focus:border-gold focus:outline-none"
        />
      </div>

      <p className="text-xs text-muted">
        {filtered.length} of {companies.length} portfolio companies
      </p>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("companyName")}>
                Company{sortIndicator("companyName")}
              </th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("fundName")}>
                Fund{sortIndicator("fundName")}
              </th>
              <th className="px-4 py-3">Sector</th>
              <th className="cursor-pointer px-4 py-3 text-right" onClick={() => toggleSort("valuation")}>
                Valuation{sortIndicator("valuation")}
              </th>
              <th className="cursor-pointer px-4 py-3 text-right" onClick={() => toggleSort("grossMoic")}>
                MOIC{sortIndicator("grossMoic")}
              </th>
              <th className="cursor-pointer px-4 py-3 text-right" onClick={() => toggleSort("grossIrr")}>
                IRR{sortIndicator("grossIrr")}
              </th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" aria-hidden="true" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/companies/${c.id}`)}
                className="group cursor-pointer hover:bg-surface"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/companies/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-gold hover:underline"
                  >
                    {c.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/funds/${c.fundId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted hover:text-navy hover:underline"
                  >
                    {c.fundName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{c.sector ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-navy">{formatCurrency(c.valuation)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-navy">
                  {c.grossMoic != null ? formatMultiple(c.grossMoic) : "At Cost"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-navy">{formatPercent(c.grossIrr)}</td>
                <td className="px-4 py-3 capitalize text-muted">{c.status.replace("_", " ")}</td>
                <td className="px-4 py-3 text-right text-muted transition-all group-hover:translate-x-0.5 group-hover:text-gold">
                  →
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
