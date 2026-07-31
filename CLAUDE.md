# Working rules for this repo

Read `architecture.md` and `README.md` first for full design rationale - this file is
orientation plus hard rules that must not be violated, not a replacement for either.

## Non-negotiable: confidentiality

This project's schema/dashboard design was informed by 7 real, confidential GP quarterly
reports from a real fund, reviewed under NDA as part of a family office case study. Those
documents:

- Must never be pasted into, uploaded to, or read by any cloud AI tool - this includes
  you. Claude Code runs on a cloud model via the Anthropic API, same restriction as any
  other cloud AI, chat interface or otherwise.
- Have already had every real fund/company/person name scrubbed from this repo
  (`architecture.md`, `README.md`, `verify/verify-queries.mjs`) as of this commit. If you
  ever encounter a real fund or company name in this codebase again, stop and flag it
  instead of using it, committing it, or writing it into a new file.
- Real-document extraction is local-only, via Ollama (`lib/ai/providers/ollama.ts`) -
  there is no cloud AI code path for document extraction anywhere in this project, by
  design (see `architecture.md` Section 6.1 and Section 7). Do not add one.

All demo/seed data (`lib/db/seed-data.ts`) is 100% fictional: two funds, "Meridian Capital
Partners VII, LP" and "Ironwood Credit Partners IV, LP," with invented GPs, portfolio
companies, and financials, not modeled on or derived from any real report's actual
figures. Safe to read, edit, and extend freely.

## Current state

Working Next.js 16 / TypeScript / Drizzle ORM (Postgres, Supabase-hosted) / Recharts app.
Two-fund demo dataset: "Meridian Capital Partners VII, LP" (private equity/growth - the
original single-fund demo) and "Ironwood Credit Partners IV, LP" (private credit). The
second fund was added deliberately, shaped differently from Meridian (different asset
class, vintage, vehicle structure, return profile) rather than as a smaller copy, so that
multi-fund features (Consolidated aggregation, the Funds list) are demonstrably real
rather than placeholder.

Pages:
- Executive Summary (`/`) - consolidated book view only, no by-fund toggle
  (`components/dashboard/ExecutiveDashboard.tsx`): quarter-tab KPI grid (auto-fit/minmax, not
  a fixed column count, so a partial last row never leaves a large empty gap - this grid's
  card count has already changed more than once) including Total NAV, Gross/Net MOIC/DPI/IRR
  (Net figures are true bottom-line sums across every vehicle - main + co-invest + parallel -
  not just each fund's main vehicle; see `sumAllVehicles` in `getConsolidatedExecutiveData`),
  MOIC/IRR since-inception chart (labeled with quarters of reporting history so a short demo
  track record isn't mistaken for a data gap, and caveated when strategies mix, mirroring
  `irrIsApproximate`), % NAV at cost trend, manager/GP concentration donut, notable MOIC
  movement (capped to top 3, each row naming the fund it belongs to, not just the company;
  gated on `MOIC_DECLINE_THRESHOLD` from `lib/validation/rules.ts` so "notable" means big
  enough to matter, not just whichever moves ranked highest that quarter),
  an unmarked-positions summary stat plus table (also fund-attributed, linking each company
  to its detail page and each fund to its own), reporting status, and open flags scoped to
  the latest quarter. A single fund's own numbers belong on its full detail page (Funds tab
  below), not a lighter duplicate
  living inside this page - an earlier Consolidated/By-Fund toggle was removed for exactly
  this reason. Every widget here is deliberately book-level, not company-level: concentration
  is tracked by manager (`ManagerConcentrationSlice` in `lib/db/queries.ts`), not by
  portfolio company, because a single company's share of a many-fund book is a fund-level
  question (already covered by the "Concentrated" badge on the fund page's portfolio table,
  gated on `CONCENTRATION_THRESHOLD_PCT` from `lib/validation/rules.ts`), not a firm-level
  one, and dilutes into meaninglessness once there are dozens of funds behind it.
- Funds (`/funds`) - book-level list of every fund (`components/dashboard/BookExplorer.tsx`),
  filterable by asset class/sector, each row linking to `/funds/[fundId]` for that fund's
  full detail page: KPI header, gross/net vehicle comparison, allocation vs. target,
  NAV/TVPI trend charts (`TrendChart.tsx` - explicit computed y-axis domain, not Recharts'
  auto/string-expression domain, same reasoning as the Executive Summary's at-cost chart
  fix; toggles between absolute level and QoQ % change), a Fund Life (Cash Flow) chart
  (`CashFlowChart.tsx` - NAV + Distributed Capital stacked into a single Total Value bar per
  quarter, with Called Capital overlaid as a gold line, so the stack clearing the line is
  the moment TVPI passes 1.0x, at a glance rather than mental math; an area-chart version
  was tried first but an area chart is only honest with a zero-based y-axis and this fund's
  quarters sit in too narrow a band for that to read well, and a plain grouped-3-bars
  version was tried after that but left the CIO stacking two bars in their head - the
  current stacked-bar-plus-line version was settled on to fix both), a
  company-NAV-contribution bar chart (top 8 + Other, concentration at a glance) alongside
  the portfolio company table, GP commentary history, AI investment summary. The portfolio
  table itself badges two risk signals in-context rather than sending you to Alerts to learn
  they're bad: "Concentrated" on the % of NAV column once a position crosses
  `CONCENTRATION_THRESHOLD_PCT`, and an escalated "At Cost Nq" (vs. plain "At Cost") once a
  position's been unmarked for `AT_COST_STREAK_THRESHOLD`+ consecutive quarters
  (`consecutiveAtCostQuarters` in `getFundPortfolioCompanies`).
- Portfolio Companies (`/companies`) - cross-fund list, and `/companies/[id]` for a single
  position's deep-dive (Investment Profile, Capital, Realized vs. Unrealized MOIC, history,
  Capital Structure & Hedging, Open Flags for This Position, Key Milestones). Open Flags
  defaults to the position's latest reported quarter (`CompanyFlagsPanel.tsx`), with earlier
  quarters tucked behind a toggle rather than shown all at once - labeled "Earlier Quarters,"
  not "Resolved," since this app has no flag-resolution workflow (`validationFlags.resolved`
  is queried but never set true anywhere). Key Milestones (formerly "Development Timeline")
  shows newest-first with a compact period badge per entry, rather than oldest-first
  paragraphs. Capital Structure & Hedging (debt facility drawn/capacity, hedge coverage/floor
  price) is deliberately thin - a CIO-level risk read, not a GP risk desk's full swap book or
  price-deck sensitivity table - and only renders for positions that actually disclose it
  (`hasCapitalStructureData`); fields live on `portfolioCompanyValuations`
  (`debtFacilityCapacity`/`debtFacilityDrawn`/`hedgedPct`/`hedgeFloorPrice`/`hedgePriceUnit`)
  and flow through the same AI extraction schema as everything else (`lib/ai/schemas.ts`),
  same rule as always: the demo should reflect exactly what a real upload would produce. The
  Net Debt/EBITDA card also badges "Above Nx threshold" once it crosses `LEVERAGE_THRESHOLD`
  - in-context, same reasoning as the fund page's concentration/at-cost badges below.
- Alerts (`/alerts`) - the book-wide audit trail, distinct from the Executive Summary's
  current-quarter flags snapshot: every open issue, filterable by severity/category/fund,
  but grouped (`AlertsCenter.tsx`) rather than one row per quarter it was raised - this app
  has no flag-resolution workflow (`validationFlags.resolved` is queried but never set true
  anywhere), so the same fund/company/field/check recurring across quarters is one ongoing
  issue, not N unrelated alerts. Ranked by severity, then by how many quarters it's been
  open (persistence outranks freshness at the same severity) - a "Show history" toggle
  reveals every quarter's message for a recurring issue rather than showing them all by
  default. An "Open Issues by Fund" rollup sits above the list (same reasoning as manager
  concentration on the Executive Summary - a pattern across many funds doesn't show up in a
  flat row-by-row list, a rollup surfaces it directly), clickable to filter; a dropdown fund
  filter also exists for when you already know which fund you want, since free-text search
  alone doesn't scale once the book has more than a handful of funds.

  Deliberately narrower in scope than it once was - concentration, leverage, and
  at-cost-streak used to post here too, but they duplicated a number already visible (often
  better visualized) on the fund/company page itself, so they were pulled into in-context
  badges there instead (see the Funds and Portfolio Companies bullets above) and no longer
  write a `validationFlags` row at all. What's left here is specifically the stuff with no
  natural page of its own: NAV-move reasoning (capital call vs. real valuation swing), a
  fresh IRR flip to negative, the DPI+RVPI=TVPI math-consistency check, and GP-commentary
  keyword hits (risk language + realization/sale events).

`/trends` (`components/dashboard/TrendsExplorer.tsx`, a book-level or per-fund metric
explorer) is retired from `DashboardNav` - not a live tab - but intentionally not deleted.
Reasoning: with exactly one fund per asset class today, there's no same-strategy peer for
either fund to compare against, and a raw cross-strategy overlay (credit fund vs. equity
fund) reproduces the same mathematically-valid-but-strategically-misleading trap as
naively averaging IRR across vehicles (see `irrIsApproximate` below) - a private credit
fund is supposed to show high DPI/low TVPI early (it's a yield vehicle), while a growth
equity fund is supposed to show low DPI/high TVPI early (a multiple vehicle); overlaying
them without that framing reads as "underperformance" when it's actually just a different
strategy working as designed. Reactivate only once the book has 2+ funds sharing a
strategy - see Remaining work.

Design system: navy/gold tokens in `app/globals.css` (`@theme inline` + CSS custom
properties). Severity color convention (critical=red, warning=amber, info=gray) must stay
consistent everywhere flags render - see `components/dashboard/FlagsQueue.tsx` for the
canonical mapping.

Validation: rule-based (not AI), `lib/validation/rules.ts`, run identically on real
uploads (`lib/db/commit.ts`) and seed data (`lib/db/seed.ts`) - the demo should always
reflect exactly what a real upload would produce, never a hand-tuned version of it.
`RISK_KEYWORDS` is deliberately specific multi-word phrases ("capital structure amendment,"
"restructuring discussion," "non-accrual"), not bare common words - an earlier version used
single words like "paused"/"reduced"/"reset" that fired on routine commentary, a
false-positive rate high enough to make the whole flags feed feel untrustworthy. Four
threshold constants (`MOIC_DECLINE_THRESHOLD`, `AT_COST_STREAK_THRESHOLD`,
`CONCENTRATION_THRESHOLD_PCT`, `LEVERAGE_THRESHOLD`) are exported and consumed directly by
page components as in-context badges rather than producing `validationFlags` rows - see the
Alerts bullet above for why.

## Known environment note

`npm run db:push` / `db:reset` / `seed` should just work when run in your own terminal
against your real Supabase Postgres - the previous working session (Cowork) had a
sandbox/mount limitation that made these commands unrunnable there; that limitation
doesn't apply here.

## Remaining work

- ~~Confirm the demo Supabase project is fully set up~~ - done: real Supabase project
  configured, schema pushed, seed data loaded.
- ~~Deploy to Vercel for the case-study reviewer's demo link~~ - done: live at
  pe-fund-monitor.vercel.app, password-gated via `APP_PASSWORD`, deployed from
  `github.com/dfabrega2021/pe-fund-monitor` (main branch, auto-deploys on push).
- `How It Works Memo.md` (project root) is the actual case-study deliverable - keep it in
  sync with any material architecture or scaling-story changes.
- `/trends` is retired from nav, not deleted (see Current state above). Only bring it back
  once the book has 2+ funds sharing a strategy, and even then rework it first: default to
  grouping same-strategy/asset-class funds together rather than a flat picker that invites
  comparing a credit fund against an equity fund with no framing, and add an explicit label
  or caveat (mirroring `irrIsApproximate`) on any metric that isn't fairly comparable across
  asset classes (MOIC/TVPI/DPI). NAV growth, called-vs-committed, and deployment pace are
  fine to compare as-is regardless of strategy.
