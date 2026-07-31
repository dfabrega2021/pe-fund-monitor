import Link from "next/link";
import type { OpenFlagRow } from "@/lib/db/queries";
import { formatQuarter } from "@/lib/format";

type Props = {
  flags: OpenFlagRow[];
};

const severityStyles = {
  critical: "border-negative bg-negative-light text-negative",
  warning: "border-gold bg-gold-light text-navy",
  info: "border-hairline bg-surface text-muted",
};

export function FlagsQueue({ flags }: Props) {
  if (flags.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-card px-4 py-6 text-sm text-muted shadow-sm">
        No open validation flags across the book.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {flags.map((flag) => (
        <div
          key={flag.id}
          className={`rounded-lg border px-4 py-3 ${severityStyles[flag.severity]}`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide">
            <span>{flag.severity}</span>
            <span className="opacity-60">·</span>
            <span>{flag.flagType.replace("_", " ")}</span>
            <span className="opacity-60">·</span>
            <span>{formatQuarter(flag.reportYear, flag.reportQuarter)}</span>
          </div>
          <Link
            href={`/funds/${flag.fundId}`}
            className="text-sm font-semibold hover:underline"
          >
            {flag.fundName}
          </Link>
          <p className="mt-1 text-sm leading-relaxed opacity-90">{flag.message}</p>
          <p className="mt-1 text-xs opacity-70">Field: {flag.fieldName}</p>
        </div>
      ))}
    </div>
  );
}
