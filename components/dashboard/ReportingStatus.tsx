import Link from "next/link";
import type { ReportingStatusRow } from "@/lib/db/queries";

type Props = {
  year: number;
  quarter: number;
  funds: ReportingStatusRow[];
};

export function ReportingStatus({ year, quarter, funds }: Props) {
  const reportedCount = funds.filter((f) => f.reported).length;
  const outstanding = funds.filter((f) => !f.reported);

  if (funds.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-card px-4 py-6 text-sm text-muted shadow-sm">
        No funds yet.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-hairline bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm text-muted">
        <span className="font-semibold text-navy">
          {reportedCount} of {funds.length}
        </span>{" "}
        funds have reported for {year} Q{quarter}.
      </p>

      {outstanding.length === 0 ? (
        <p className="text-sm text-muted">All funds are up to date.</p>
      ) : (
        <div className="space-y-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Not yet reported
          </p>
          {outstanding.map((f) => (
            <Link
              key={f.fundId}
              href={`/funds/${f.fundId}`}
              className="block rounded-md px-2 py-1.5 text-sm text-navy hover:bg-surface hover:underline"
            >
              {f.fundName}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
