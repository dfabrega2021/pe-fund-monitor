import { formatCurrency } from "../format";

// Rule-based (not AI) checks that turn "the numbers moved" into "here's why,
// and whether it's worth a closer look." Runs both on real uploaded data
// (lib/db/commit.ts) and on seeded demo data (lib/db/seed.ts) so the two
// behave identically - what you see in the demo is exactly what the real
// pipeline would produce, not a hand-authored stand-in.
//
// Deliberately simple, explainable thresholds rather than statistical anomaly
// detection - a CIO reviewing a flag needs to trust *why* it fired, and a
// fixed, documented threshold is easier to reason about (and to challenge)
// than a black-box score.

export type FlagCandidate = {
  fieldName: string;
  flagType: "missing" | "out_of_bounds" | "large_delta" | "inconsistent";
  severity: "info" | "warning" | "critical";
  message: string;
};

const NAV_DELTA_THRESHOLD = 0.25; // 25% QoQ move before it's worth a flag at all
const NAV_DELTA_CRITICAL_THRESHOLD = 0.5;
const TVPI_RECONCILIATION_TOLERANCE = 0.05; // DPI + RVPI should be close to TVPI

// These four thresholds are exported (unlike the ones above) because they no
// longer drive a validationFlags row in the book-wide Alerts feed - they're
// consumed directly by the fund/company pages as in-context badges instead
// (e.g. a "20%+ of fund NAV" badge right next to the number on the fund
// page's portfolio table, rather than a separate list entry on Alerts). That
// change came out of a straight look at what Alerts was actually adding:
// concentration, leverage, at-cost-streak, and MOIC/valuation decline all
// duplicated a number already visible (often better visualized) on the fund
// or company page itself, while Alerts is a better fit for things with no
// natural page of their own - NAV-move reasoning, a fresh IRR flip, a
// DPI+RVPI math mismatch, and GP-commentary keyword hits. One threshold,
// reused wherever the underlying number is actually shown, rather than two
// independently-chosen numbers (a flag's bar and a badge's bar) that could
// quietly drift apart.
export const MOIC_DECLINE_THRESHOLD = 0.2; // absolute multiple-point QoQ decline, e.g. 1.8x -> 1.6x
export const AT_COST_STREAK_THRESHOLD = 3; // consecutive quarters at cost before it's worth a badge
export const CONCENTRATION_THRESHOLD_PCT = 20; // single position as % of fund NAV
export const LEVERAGE_THRESHOLD = 3.5; // Net Debt / EBITDA

// Keyword lists deliberately simple substring matches, not NLP - a CIO reviewing
// a flag needs to see exactly which phrase fired and why, the same way the
// numeric thresholds above are meant to be checked by eye, not trusted blindly.
//
// Deliberately specific multi-word phrases, not single common words. An
// earlier version of this list used bare words like "paused," "reduced," and
// "reset," which fire on completely routine commentary ("hiring was paused
// for Q4," "capex was reduced due to seasonality") - a false-positive rate
// high enough to make the whole flags queue feel untrustworthy. Every phrase
// below is specific enough that it's very unlikely to appear in benign
// commentary, and several (capital structure amendment, restructuring
// discussion, non-accrual) were added because they're genuinely serious
// distress signals the old bare-word list didn't catch at all.
const RISK_KEYWORDS = [
  "reset return expectations",
  "reset near-term return expectations",
  "reduced return expectations",
  "comprehensive review of its capital structure",
  "comprehensive review of the company's capital structure",
  "capital structure amendment",
  "restructuring discussion",
  "non-accrual",
  "underperformance",
  "covenant breach",
  "covenant waiver",
  "going concern",
];
const REALIZATION_KEYWORDS = [
  "letter of intent",
  "non-binding loi",
  "agreed to sell",
  "definitive agreement to sell",
  "sale process",
  "majority stake sale",
];

// A fund's NAV can jump sharply for two very different reasons: it got more
// valuable, or the GP called more capital and deployed it. Those look
// identical on a bare "QoQ NAV change" number but mean opposite things - the
// first is a real return signal, the second is just more of your committed
// capital becoming called capital. This check tells them apart using the
// called-capital figure that's already captured alongside NAV.
export function checkNavDelta(params: {
  fieldName: string;
  currentNav: number | null;
  priorNav: number | null;
  currentCalledCapital: number | null;
  priorCalledCapital: number | null;
  vintageYear: number;
  asOfYear: number;
}): FlagCandidate | null {
  const { fieldName, currentNav, priorNav, currentCalledCapital, priorCalledCapital, vintageYear, asOfYear } =
    params;
  if (currentNav == null || priorNav == null || priorNav === 0) return null;

  const navChangePct = (currentNav - priorNav) / priorNav;
  if (Math.abs(navChangePct) < NAV_DELTA_THRESHOLD) return null;

  const calledDelta = (currentCalledCapital ?? 0) - (priorCalledCapital ?? 0);
  const navDelta = currentNav - priorNav;
  const explainedByCapitalCalls =
    calledDelta > 0 && Math.abs(navDelta - calledDelta) / Math.abs(navDelta) < 0.35;

  const fundAgeMonths = (asOfYear - vintageYear) * 12;
  const isYoungFund = fundAgeMonths <= 24;
  const pctLabel = `${navChangePct >= 0 ? "+" : ""}${(navChangePct * 100).toFixed(1)}%`;

  if (explainedByCapitalCalls) {
    return {
      fieldName,
      flagType: "large_delta",
      severity: "info",
      message:
        `NAV moved ${pctLabel} quarter-over-quarter, tracking a called-capital increase of roughly ` +
        `${formatCurrency(calledDelta)} - consistent with capital deployment` +
        `${isYoungFund ? " on a fund still in its early ramp-up period" : ""} rather than a valuation swing.`,
    };
  }

  return {
    fieldName,
    flagType: "large_delta",
    severity: Math.abs(navChangePct) > NAV_DELTA_CRITICAL_THRESHOLD ? "critical" : "warning",
    message:
      `NAV moved ${pctLabel} quarter-over-quarter without a proportional change in called capital - ` +
      "review the underlying valuation drivers before the next IC review.",
  };
}

// A position's IRR flipping from positive to negative is one of the clearest
// "needs a human look" signals in credit/growth positions specifically - it
// usually means a real impairment or covenant event, not noise.
export function checkCompanyIrrTurnedNegative(params: {
  companyName: string;
  currentIrr: number | null;
  priorIrr: number | null;
}): FlagCandidate | null {
  const { companyName, currentIrr, priorIrr } = params;
  if (currentIrr == null || priorIrr == null) return null;
  if (currentIrr >= 0 || priorIrr < 0) return null; // only flag a fresh flip to negative

  return {
    fieldName: `portfolio_companies.${companyName}.gross_irr`,
    flagType: "out_of_bounds",
    severity: "critical",
    message:
      `${companyName}'s gross IRR turned negative (${(currentIrr * 100).toFixed(1)}%) this quarter after ` +
      "previously being positive - recommend IC review before the next distribution decision.",
  };
}

// Sanity check on the return-metric math itself: DPI + RVPI should equal TVPI
// by definition (distributed + remaining value, both as multiples of paid-in
// capital). A material mismatch usually means a units/basis mix-up in the
// source document (or in extraction) rather than a real investment event.
export function checkTvpiReconciliation(params: {
  fieldName: string;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
}): FlagCandidate | null {
  const { fieldName, dpi, rvpi, tvpi } = params;
  if (dpi == null || rvpi == null || tvpi == null) return null;

  const expectedTvpi = dpi + rvpi;
  if (Math.abs(expectedTvpi - tvpi) <= TVPI_RECONCILIATION_TOLERANCE) return null;

  return {
    fieldName,
    flagType: "inconsistent",
    severity: "warning",
    message:
      `DPI (${dpi.toFixed(2)}x) + RVPI (${rvpi.toFixed(2)}x) = ${expectedTvpi.toFixed(2)}x, which doesn't match ` +
      `the reported TVPI (${tvpi.toFixed(2)}x) - worth confirming basis/units before using this figure.`,
  };
}

// Keyword-scans GP commentary for language that tends to precede a markdown
// by a quarter or two - the same "read what the GP said two quarters ago"
// pattern the fund page's commentary history is built to surface, applied
// automatically instead of relying on someone rereading the letter closely.
export function checkCommentaryRiskKeywords(params: {
  fundName: string;
  commentaryText: string | null;
}): FlagCandidate | null {
  const { fundName, commentaryText } = params;
  if (!commentaryText) return null;

  const lower = commentaryText.toLowerCase();
  const hit = RISK_KEYWORDS.find((k) => lower.includes(k));
  if (!hit) return null;

  return {
    fieldName: `gp_commentary.${fundName}`,
    flagType: "large_delta",
    severity: "warning",
    message:
      `This quarter's GP commentary includes the phrase "${hit}" - language worth reading closely rather than ` +
      "skimming past, even before the numbers show anything unusual.",
  };
}

// A real realization/sale event changes a fund's near-term liquidity and
// return profile more than almost anything else that shows up in commentary
// - flagged critical specifically so it can't get lost in a queue of routine
// valuation-delta flags.
export function checkCommentaryRealizationEvent(params: {
  fundName: string;
  commentaryText: string | null;
}): FlagCandidate | null {
  const { fundName, commentaryText } = params;
  if (!commentaryText) return null;

  const lower = commentaryText.toLowerCase();
  const hit = REALIZATION_KEYWORDS.find((k) => lower.includes(k));
  if (!hit) return null;

  return {
    fieldName: `gp_commentary.${fundName}`,
    flagType: "large_delta",
    severity: "critical",
    message:
      `This quarter's GP commentary references a potential realization event ("${hit}") - flagged high priority ` +
      "since a sale or LOI materially changes the fund's near-term liquidity and return profile.",
  };
}
