"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FundOverviewRow } from "@/lib/db/queries";
import { ConcentrationChart, type ConcentrationGroup } from "./ConcentrationChart";
import { FlagsBadge } from "./FlagsBadge";
import { formatCurrency, formatPercent, formatMultiple, formatDate, ASSET_CLASS_LABELS, type AssetClass } from "@/lib/format";

type Props = {
  funds: FundOverviewRow[];
};

const ASSET_CLASSES: AssetClass[] = ["private_equity", "private_credit", "real_assets"];

function aggregate(rows: FundOverviewRow[], keyFn: (r: FundOverviewRow) => string): ConcentrationGroup[] {
  const map = new Map<string, ConcentrationGroup>();
  for (const r of rows) {
    const key = keyFn(r);
    const existing = map.get(key) ?? { label: key, nav: 0, commitment: 0 };
    existing.nav += r.currentNav ?? 0;
    existing.commitment += r.commitmentAmount;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.nav - a.nav);
}

// Book-level explorer: an asset-class toggle, a sector multi-select, and a
// live fund search, all filtering the same dataset. Unfiltered, the chart
// shows the macro allocation view (by asset class) a CIO wants first; the
// moment any filter is applied, it expands to the sector-level detail that
// answers "where exactly is the concentration risk" - same data, same chart
// component, just regrouped, so there's no separate "drill-down" screen to build.
export function BookExplorer({ funds }: Props) {
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClass | "all">("all");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const allSectors = useMemo(
    () => Array.from(new Set(funds.map((f) => f.sector).filter((s): s is string => !!s))).sort(),
    [funds]
  );

  const filteredFunds = useMemo(() => {
    const term = search.trim().toLowerCase();
    return funds.filter((f) => {
      if (assetClassFilter !== "all" && f.assetClass !== assetClassFilter) return false;
      if (selectedSectors.length > 0 && (!f.sector || !selectedSectors.includes(f.sector))) return false;
      if (term && !f.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [funds, assetClassFilter, selectedSectors, search]);

  const isFiltered = assetClassFilter !== "all" || selectedSectors.length > 0 || search.trim() !== "";

  const chartData = isFiltered
    ? aggregate(filteredFunds, (f) => f.sector ?? "Uncategorized")
    : aggregate(funds, (f) => ASSET_CLASS_LABELS[f.assetClass]);

  const chartTitle = isFiltered ? "NAV and commitment by sector" : "NAV and commitment by asset class";

  const totalNav = filteredFunds.reduce((sum, f) => sum + (f.currentNav ?? 0), 0);
  const totalCommitment = filteredFunds.reduce((sum, f) => sum + f.commitmentAmount, 0);
  const totalUncalled = filteredFunds.reduce((sum, f) => sum + (f.unfundedCommitment ?? 0), 0);

  function toggleSector(sector: string) {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  }

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card p-3 shadow-sm">
        <div className="flex items-center gap-1 rounded-md bg-surface p-1">
          <button
            onClick={() => setAssetClassFilter("all")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              assetClassFilter === "all" ? "bg-card text-navy shadow-sm" : "text-muted hover:text-navy"
            }`}
          >
            All
          </button>
          {ASSET_CLASSES.map((ac) => (
            <button
              key={ac}
              onClick={() => setAssetClassFilter(ac)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                assetClassFilter === ac ? "bg-card text-navy shadow-sm" : "text-muted hover:text-navy"
              }`}
            >
              {ASSET_CLASS_LABELS[ac]}
            </button>
          ))}
        </div>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-hairline px-2.5 py-1 text-xs font-medium text-navy hover:bg-surface">
            Sector {selectedSectors.length > 0 ? `(${selectedSectors.length})` : ""}
          </summary>
          <div className="absolute z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-hairline bg-card p-2 shadow-lg">
            {allSectors.length === 0 && <p className="px-2 py-1 text-xs text-muted">No sectors yet</p>}
            {allSectors.map((sector) => (
              <label key={sector} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface">
                <input
                  type="checkbox"
                  checked={selectedSectors.includes(sector)}
                  onChange={() => toggleSector(sector)}
                  className="h-3.5 w-3.5"
                />
                {sector}
              </label>
            ))}
            {selectedSectors.length > 0 && (
              <button
                onClick={() => setSelectedSectors([])}
                className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-gold hover:bg-surface"
              >
                Clear sectors
              </button>
            )}
          </div>
        </details>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fund..."
          className="ml-auto w-48 rounded-md border border-hairline px-2.5 py-1.5 text-xs"
        />

        {isFiltered && (
          <button
            onClick={() => {
              setAssetClassFilter("all");
              setSelectedSectors([]);
              setSearch("");
            }}
            className="text-xs text-muted hover:text-navy"
          >
            Reset
          </button>
        )}
      </div>

      {/* Chart + totals */}
      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-navy">
              {isFiltered ? "Concentration (filtered)" : "Concentration"}
            </h2>
            <p className="text-sm text-muted">{chartTitle} (main vehicle, net basis, latest quarter)</p>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-muted">NAV</p>
              <p className="font-semibold tabular-nums">{formatCurrency(totalNav)}</p>
            </div>
            <div>
              <p className="text-muted">Commitment</p>
              <p className="font-semibold tabular-nums">{formatCurrency(totalCommitment)}</p>
            </div>
            <div>
              <p className="text-muted">Uncalled Capital</p>
              <p className="font-semibold tabular-nums">{formatCurrency(totalUncalled)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
          {chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">No funds match the current filters.</p>
          ) : (
            <ConcentrationChart data={chartData} />
          )}
        </div>
      </div>

      {/* Fund table, same filtered set */}
      <div>
        <h2 className="mb-4 text-lg font-medium text-navy">
          Fund Performance {isFiltered && <span className="text-sm font-normal text-muted">({filteredFunds.length} of {funds.length})</span>}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Fund</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3 text-right">NAV</th>
                <th className="px-4 py-3 text-right">QoQ NAV</th>
                <th className="px-4 py-3 text-right">TVPI</th>
                <th className="px-4 py-3 text-right">DPI</th>
                <th className="px-4 py-3 text-right">Net IRR</th>
                <th className="px-4 py-3 text-center">Flags</th>
                <th className="px-4 py-3">Last Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredFunds.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted">
                    No funds match the current filters.
                  </td>
                </tr>
              ) : (
                filteredFunds.map((fund) => (
                  <tr key={fund.id} className="hover:bg-surface">
                    <td className="px-4 py-3">
                      <Link href={`/funds/${fund.id}`} className="font-medium text-gold hover:text-navy hover:underline">
                        {fund.name}
                      </Link>
                      {fund.sector && <p className="text-xs text-muted">{fund.sector}</p>}
                    </td>
                    <td className="px-4 py-3 text-navy">{fund.strategy}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(fund.currentNav)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fund.qoqNavChangePct != null ? (
                        <span className={fund.qoqNavChangePct >= 0 ? "text-positive" : "text-negative"}>
                          {fund.qoqNavChangePct >= 0 ? "+" : ""}
                          {fund.qoqNavChangePct.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMultiple(fund.tvpi)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMultiple(fund.dpi)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPercent(fund.netIrr)}</td>
                    <td className="px-4 py-3 text-center">
                      <FlagsBadge flags={fund.openFlags} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {fund.lastReportQuarter && <p className="text-xs font-medium text-navy">{fund.lastReportQuarter}</p>}
                      <p className="text-xs text-muted">{formatDate(fund.lastReportDate)}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
