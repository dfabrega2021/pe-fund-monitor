// Lives here (not lib/db/queries.ts) specifically so client components can
// import it without dragging in the Postgres driver - queries.ts's top-level
// `import { db }` isn't tree-shakeable across a "use client" boundary, so
// pulling ASSET_CLASS_LABELS from there broke the browser bundle entirely
// ("Module not found: Can't resolve 'tls'/'fs'/'net'" - Node built-ins the
// Postgres client needs, which don't exist in a browser).
export type AssetClass = "private_equity" | "private_credit" | "real_assets";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  private_equity: "Private Equity",
  private_credit: "Private Credit",
  real_assets: "Real Assets",
};

export function parseNum(val: string | null | undefined): number | null {
  if (val == null) return null;
  const n = parseFloat(val);
  return Number.isNaN(n) ? null : n;
}

export function quarterSortKey(year: number, quarter: number): number {
  return year * 10 + quarter;
}

export function getCurrentQuarter(date: Date = new Date()): { year: number; quarter: 1 | 2 | 3 | 4 } {
  return {
    year: date.getFullYear(),
    quarter: (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  };
}

// Shifts a (year, quarter) pair by `offset` quarters (positive = forward,
// negative = back). Used by seed.ts to anchor demo data's quarters relative
// to whenever it's actually seeded, instead of a hardcoded year - hardcoded
// seed quarters silently go stale (a demo dashboard whose "latest report" is
// a year old looks broken, not intentional) every time real time passes.
export function shiftQuarter(year: number, quarter: number, offset: number): { year: number; quarter: number } {
  const zeroBased = year * 4 + (quarter - 1) + offset;
  return {
    year: Math.floor(zeroBased / 4),
    quarter: (zeroBased % 4) + 1,
  };
}

export function formatQuarter(year: number, quarter: number): string {
  return `${year} Q${quarter}`;
}

export function formatCurrency(value: number | null, currency = "USD"): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatMultiple(value: number | null, decimals = 2): string {
  if (value == null) return "—";
  return `${value.toFixed(decimals)}x`;
}

export function formatPctChange(current: number | null, prior: number | null): string {
  if (current == null || prior == null || prior === 0) return "—";
  const change = ((current - prior) / prior) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function vehicleBasisLabel(vehicleName: string, basis: "gross" | "net"): string {
  const basisLabel = basis === "gross" ? "Gross" : "Net";
  return `${basisLabel} (${vehicleName})`;
}
