import type { FundKpi } from "@/lib/db/queries";
import { formatCurrency, formatPercent, formatMultiple } from "@/lib/format";

type Props = {
  kpis: FundKpi[];
};

// Flags Net-basis columns (fee/carry drag varies by LP class - unlike Gross,
// which is the same performance figure regardless of who the LP is) and any
// dollar amount (always the vehicle's total, not one LP's own capital account).
function VehicleLevelIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="ml-1 inline-block shrink-0 align-middle text-muted"
      aria-hidden="true"
    >
      <path d="M8 2 L14 5 L8 8 L2 5 Z" strokeLinejoin="round" />
      <path d="M2 8 L8 11 L14 8" strokeLinejoin="round" />
      <path d="M2 11 L8 14 L14 11" strokeLinejoin="round" />
    </svg>
  );
}

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
            <th className="px-4 py-3 text-right">
              <span title="Net figures are fee-class-dependent - not a specific LP's own capital account">
                Net TVPI
                <VehicleLevelIcon />
              </span>
            </th>
            <th className="px-4 py-3 text-right">Gross IRR</th>
            <th className="px-4 py-3 text-right">
              <span title="Net figures are fee-class-dependent - not a specific LP's own capital account">
                Net IRR
                <VehicleLevelIcon />
              </span>
            </th>
            <th className="px-4 py-3 text-right">
              <span title="Derived from Net IRR, which is fee-class-dependent">
                IRR Spread (bps)
                <VehicleLevelIcon />
              </span>
            </th>
            {hasLeverageData && <th className="px-4 py-3 text-right">Unlevered IRR</th>}
            {hasLeverageData && (
              <th className="px-4 py-3 text-right">
                <span title="Vehicle-total dollar amount, not one LP's own capital account">
                  Sub Line Balance
                  <VehicleLevelIcon />
                </span>
              </th>
            )}
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
