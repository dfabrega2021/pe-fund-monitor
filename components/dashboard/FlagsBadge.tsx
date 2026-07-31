type Flag = {
  message: string;
  severity: "info" | "warning" | "critical";
};

type Props = {
  flags: Flag[];
};

const SEVERITY_STYLES: Record<Flag["severity"], string> = {
  critical: "bg-negative-light text-negative",
  warning: "bg-gold-light text-gold",
  info: "bg-surface text-muted",
};

// Hover shows what each flag actually means, instead of leaving the viewer to
// guess from a bare count - the badge's native `title` attribute is the
// simplest reliable way to do this without a new popover component.
export function FlagsBadge({ flags }: Props) {
  if (flags.length === 0) {
    return <span className="text-muted">—</span>;
  }

  const worstSeverity = flags.some((f) => f.severity === "critical")
    ? "critical"
    : flags.some((f) => f.severity === "warning")
      ? "warning"
      : "info";

  const tooltip = flags.map((f) => `[${f.severity}] ${f.message}`).join("\n\n");

  return (
    <span
      title={tooltip}
      className={`inline-flex min-w-[1.5rem] cursor-help items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[worstSeverity]}`}
    >
      {flags.length}
    </span>
  );
}
