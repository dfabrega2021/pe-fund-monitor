import type { FundKpi } from "@/lib/db/queries";
import { formatCurrency, formatPercent, formatMultiple } from "@/lib/format";

type Props = {
  kpis: FundKpi[];
};

type VehicleRow = {
  vehicleId: string;
  vehicleName: string;
  vehicleType: string;
  gross?: FundKpi;
  net?: FundKpi;
};

// Groups gross/net KPI rows by vehicle so gross-to-net spread (fee/carry drag)
// and, where disclosed, subscription-line leverage impact are visible side by
// side instead of buried in separate cards. Vehicle comparison (main vs.
// co-invest, etc.) falls out of the same grouping for multi-vehicle funds.
export function VehicleComparisonTable({ kpis }: Props) {
  if (kpis.length === 0) return null;

  const byVehicle = new Map<string, VehicleRow>();
  for (const k of kpis) {
    const existing = byVehicle.get(k.vehicleId) ?? {
      vehicleId: k.vehicleId,
      vehicleName: k.vehicleName,
      vehicleType: k.vehicleType,
    };
    if (k.returnBasis === "gross") existing.gross = k;
    else existing.net = k;
    byVehicle.set(k.vehicleId, existing);
  }
  const rows = Array.from(byVehicle.values());

  const hasLeverageData = kpis.some((k) => k.subscriptionLineBalance != null || k.unleveredIrr != null);

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hairline bg-surface text-left text-xs font-medium uppercase tracking-wide text-muted">
            <th className="px-4 py-3">Vehicle</th>
            <th className="px-4 py-3 text-right">Gross TVPI</th>
            <th className="px-4 py-3 text-right">Net TVPI</th>
            <th className="px-4 py-3 text-right">Gross IRR</th>
            <th className="px-4 py-3 text-right">Net IRR</th>
            <th className="px-4 py-3 text-right">IRR Spread (bps)</th>
            {hasLeverageData && <th className="px-4 py-3 text-right">Unlevered IRR</th>}
            {hasLeverageData && <th className="px-4 py-3 text-right">Sub Line Balance</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r) => {
            const irrSpread =
              r.gross?.irr != null && r.net?.irr != null ? r.gross.irr - r.net.irr : null;
            const leverageDrag =
              r.gross?.irr != null && r.gross.unleveredIrr != null
                ? r.gross.irr - r.gross.unleveredIrr
                : r.net?.irr != null && r.net.unleveredIrr != null
                  ? r.net.irr - r.net.unleveredIrr
                  : null;
            const unleveredIrr = r.gross?.unleveredIrr ?? r.net?.unleveredIrr ?? null;
            const subLineBalance = r.gross?.subscriptionLineBalance ?? r.net?.subscriptionLineBalance ?? null;

            return (
              <tr key={r.vehicleId}>
                <td className="px-4 py-3">
                  <p className="font-medium text-navy">{r.vehicleName}</p>
                  <p className="text-xs capitalize text-muted">{r.vehicleType.replace("_", "-")}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMultiple(r.gross?.tvpi ?? null)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMultiple(r.net?.tvpi ?? null)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPercent(r.gross?.irr ?? null)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPercent(r.net?.irr ?? null)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {irrSpread != null ? `${Math.round(irrSpread * 10_000)} bps` : "—"}
                </td>
                {hasLeverageData && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {unleveredIrr != null ? (
                      <span>
                        {formatPercent(unleveredIrr)}
                        {leverageDrag != null && (
                          <span className="ml-1 text-xs text-muted">
                            ({leverageDrag >= 0 ? "+" : ""}
                            {(leverageDrag * 100).toFixed(1)} pts from sub line)
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {hasLeverageData && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {subLineBalance != null ? formatCurrency(subLineBalance) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-hairline px-4 py-2 text-xs text-muted">
        IRR Spread = gross IRR minus net IRR, in basis points. Unlevered IRR shown only where disclosed.
      </p>
    </div>
  );
}
