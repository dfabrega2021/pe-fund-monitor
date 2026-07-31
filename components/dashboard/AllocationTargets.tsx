import type { AllocationTargetRow } from "@/lib/db/queries";

type Props = {
  targets: AllocationTargetRow[];
};

// Only renders for funds where a GP-mandated allocation range has been
// configured (fundAllocationTargets) - most funds won't have this, so an
// empty array is the normal case, not a data gap, and the caller should
// skip the whole section rather than show an empty state.
export function AllocationTargets({ targets }: Props) {
  if (targets.length === 0) return null;

  return (
    <div className="space-y-4">
      {targets.map((t) => {
        const barMin = Math.min(t.targetMinPct, t.currentPct, 0);
        const barMax = Math.max(t.targetMaxPct, t.currentPct, 100);
        const range = barMax - barMin || 1;
        const toPct = (v: number) => ((v - barMin) / range) * 100;

        return (
          <div key={t.categoryLabel}>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-sm font-medium text-navy">{t.categoryLabel}</p>
              <p className="text-sm tabular-nums text-muted">
                {t.currentPct.toFixed(1)}%{" "}
                <span className="text-xs text-muted">
                  (target {t.targetMinPct.toFixed(0)}–{t.targetMaxPct.toFixed(0)}%)
                </span>{" "}
                <span
                  className={
                    t.inRange
                      ? "ml-1 rounded-full bg-positive-light px-2 py-0.5 text-xs font-medium text-positive"
                      : "ml-1 rounded-full bg-gold-light px-2 py-0.5 text-xs font-medium text-gold"
                  }
                >
                  {t.inRange ? "In range" : "Off target"}
                </span>
              </p>
            </div>
            <div className="relative h-2.5 w-full rounded-full bg-surface">
              <div
                className="absolute top-0 h-2.5 rounded-full bg-hairline"
                style={{
                  left: `${toPct(t.targetMinPct)}%`,
                  width: `${toPct(t.targetMaxPct) - toPct(t.targetMinPct)}%`,
                }}
              />
              <div
                className={`absolute top-0 h-2.5 w-1 rounded-full ${t.inRange ? "bg-positive" : "bg-gold"}`}
                style={{ left: `calc(${toPct(t.currentPct)}% - 2px)` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        Grey band = GP target range. Marker = current allocation by portfolio-company sector, weighted by
        latest valuation.
      </p>
    </div>
  );
}
