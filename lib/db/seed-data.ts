// Seed data definitions - kept separate from seed.ts (the insertion logic) so the
// data itself is easy to read/tweak without touching insertion order.
//
// Composition rationale:
// - Quarters below are hardcoded as Q4'23-Q1'25 (6 quarters), but that's not
//   what actually renders - lib/db/seed.ts shifts every reportYear/reportQuarter
//   at seed time so the *latest* quarter always lands on "one quarter behind
//   whenever you run npm run seed" (see computeOffset() there). What matters
//   here is the quarter *count* and the story arc across them, not the literal
//   calendar labels - those float forward every time this gets reseeded.
// - A single fund - "Meridian Capital Partners VII, LP" - fully invented fund,
//   GP, portfolio companies, and narrative, not modeled on or derived from any
//   real report. Two vehicles (main + co-invest) across 6 quarters,
//   deliberately built around a set of distinct portfolio-company "archetypes"
//   (steady compounder, re-rating-then-realization, markdown/reversal, long
//   at-cost lag, capital-deployment ramp, leverage creep, an aggregate venture
//   bucket, and a couple of quiet performers) so the dashboard has a real range
//   of stories to tell in one fund, instead of needing several funds to cover them.
// - The fund-level KPI arc deliberately keeps "% of NAV held at cost" non-monotonic
//   (48% -> 34% -> 26% -> 31%) - the Q1'25 uptick is new capital into young
//   positions (Highland Energy III, Delaware Basin Ventures) outpacing re-marks
//   elsewhere, not a data error, and is the single most interesting derived
//   read in the whole dataset.
// - Every company also carries investmentType/boardSeats/investmentThesis (static,
//   set once) and per-quarter realizedProceeds (only non-null for Apex Resources
//   Partners, the Fund's sole source of realized proceeds so far) - together these
//   let the company detail page show Realized vs. Unrealized MOIC, not just one
//   blended multiple, mirroring the DPI split already shown at the fund level.
// - A second fund - "Ironwood Credit Partners IV, LP" - a private CREDIT fund,
//   deliberately in the same broad energy/infrastructure world as Meridian (so
//   book-level sector concentration stays coherent) but a genuinely different
//   shape, not a smaller copy: single vehicle (no co-invest), 2021 vintage (one
//   year ahead of Meridian, already distributing current income instead of still
//   ramping), lower absolute multiples with steadily climbing DPI instead of
//   Meridian's near-zero DPI/high-MOIC profile. Exists specifically so the
//   Consolidated view blends two funds' numbers for real (proving the
//   sum-of-numerator/sum-of-denominator MOIC/DPI math and the commitment-weighted
//   IRR approximation actually do something), so the By-Fund search/picker has
//   more than one option, and so the "private_credit" asset class and "credit"
//   investmentType - both defined in the schema, unused until now - actually
//   get exercised. Five borrower positions echo Meridian's archetypes adapted to
//   credit (quiet stable payer, leverage-creep watchlist, a stress/markdown case
//   headed to non-accrual, a de-leveraging improver, a freshly-funded delayed-draw
//   loan) and reuse the exact same validation rule engine - no new rules needed.
//   Most positions carry non-null realizedProceeds (interest collected to date),
//   unlike Meridian where only Apex did - a genuine reflection of a credit fund's
//   current-income-heavy return profile vs. a PE fund's appreciation-heavy one.
//   Company valuations and realized proceeds intentionally don't sum to the
//   fund-level NAV/distributions - only 5 of the book's positions get a full
//   tear-sheet treatment here, same as Meridian's "Innovation Sleeve (Aggregate)"
//   already signals, and some fund-level distributions come from loan
//   prepayments/repayments on positions not individually shown.

export type QuarterMetric = {
  reportYear: number;
  reportQuarter: number;
  vehicle: "main" | "co_invest"; // which vehicle this row belongs to
  basis: "gross" | "net";
  nav: number;
  calledCapital: number;
  distributedCapital: number;
  remainingValue: number;
  dpi: number;
  rvpi: number;
  tvpi: number;
  irr: number; // fraction, e.g. 0.23 = 23%
  unfundedCommitment: number;
  // Only set for funds/quarters that disclose subscription-line/leverage usage -
  // undefined is the normal case, not a missing-data problem.
  subscriptionLineBalance?: number | null;
  unleveredIrr?: number | null;
};

export type CompanyQuarterData = {
  reportYear: number;
  reportQuarter: number;
  valuation: number;
  costBasis: number | null;
  committedCapital?: number | null; // total committed to this position, if distinct from costBasis (drawn-to-date)
  ownershipPct: number | null;
  grossMoic: number | null; // null = "at cost" / not meaningful yet, never 0
  grossIrr: number | null;
  netDebtToEbitda?: number | null; // credit/leveraged positions only, if disclosed
  // Credit facility (e.g. RBL borrowing base) capacity/drawn, and a thin commodity-hedging
  // summary - both only for positions that actually disclose them (commodity-exposed E&P
  // positions, mainly). Undrawn headroom is derived from capacity - drawn, not stored twice.
  debtFacilityCapacity?: number | null;
  debtFacilityDrawn?: number | null;
  hedgedPct?: number | null; // 0-100, not 0-1
  hedgeFloorPrice?: number | null;
  hedgePriceUnit?: string | null; // e.g. "$/bbl WTI"
  // Cumulative distributions attributable to THIS position specifically (not
  // the fund-level total) - null until the first realization event, never 0
  // for a position that simply hasn't distributed yet. Lets the company
  // detail page split Gross MOIC into Realized vs. Unrealized.
  realizedProceeds?: number | null;
  developments?: string[];
};

export type SeedCompany = {
  companyName: string;
  sector: string;
  geography: string;
  investmentDate: string; // ISO date
  status: "active" | "exited" | "written_off";
  // Static, set once - defaults applied in seed.ts if omitted (equity / null / null).
  investmentType?: "equity" | "preferred_equity" | "credit" | "structured";
  boardSeats?: number | null;
  investmentThesis?: string | null;
  quarters: CompanyQuarterData[];
};

export type SeedVehicle = {
  vehicleName: string;
  vehicleType: "main" | "co_invest" | "parallel";
  commitmentAmount: number;
  key: "main" | "co_invest";
};

export type SeedFund = {
  name: string;
  gpName: string;
  strategy: string;
  assetClass: "private_equity" | "private_credit" | "real_assets";
  sector: string;
  geographyFocus: string;
  vintageYear: number;
  commitmentAmount: number;
  currency: string;
  vehicles: SeedVehicle[];
  quarters: {
    reportYear: number;
    reportQuarter: number;
    documentType: "valuation_letter" | "lp_letter";
    gpCommentaryText: string;
    gpStatedNotableChanges: string[];
    macroRiskMentions: string[];
    advanceCapitalCallNotes?: string[];
    metrics: QuarterMetric[];
  }[];
  companies: SeedCompany[];
  // Optional GP-mandated sector/sub-strategy allocation ranges, checked against
  // actual portfolio-company-weighted allocation. Most funds won't have this
  // configured - empty/undefined is expected, not a gap.
  allocationTargets?: { categoryLabel: string; targetMinPct: number; targetMaxPct: number }[];
};

export const seedFunds: SeedFund[] = [
  // -------------------------------------------------------------------------
  // Meridian Capital Partners VII, LP - energy & infrastructure fund, 2022
  // vintage, main + co-invest vehicles. Fully invented fund, GP, portfolio
  // companies, and narrative - not modeled on or derived from any real report.
  // -------------------------------------------------------------------------
  {
    name: "Meridian Capital Partners VII, LP",
    gpName: "Meridian Capital Partners",
    strategy: "Energy & Infrastructure Private Equity",
    assetClass: "private_equity",
    sector: "Energy & Infrastructure",
    geographyFocus: "North America & International",
    vintageYear: 2022,
    commitmentAmount: 3_950_000_000,
    currency: "USD",
    vehicles: [
      { vehicleName: "Meridian Capital Partners VII, LP", vehicleType: "main", commitmentAmount: 3_357_500_000, key: "main" },
      { vehicleName: "Meridian Capital Partners VII Co-Invest", vehicleType: "co_invest", commitmentAmount: 592_500_000, key: "co_invest" },
    ],
    quarters: [
      {
        reportYear: 2023, reportQuarter: 4, documentType: "valuation_letter",
        gpCommentaryText:
          "The Fund continued its initial capital deployment phase during the quarter, closing a new position in " +
          "Highland Energy III and adding to existing upstream and midstream holdings. All positions remain held " +
          "at or near cost, consistent with the Fund's early stage.",
        gpStatedNotableChanges: ["Highland Energy III - initial capital deployed"],
        macroRiskMentions: ["Commodity price volatility remains a monitored risk across the upstream portfolio."],
        metrics: [
          { reportYear: 2023, reportQuarter: 4, vehicle: "main", basis: "gross", nav: 1_113_000_000, calledCapital: 1_050_000_000, distributedCapital: 0, remainingValue: 1_113_000_000, dpi: 0.0, rvpi: 1.06, tvpi: 1.06, irr: 0.07, unfundedCommitment: 2_300_000_000 },
          { reportYear: 2023, reportQuarter: 4, vehicle: "main", basis: "net", nav: 892_500_000, calledCapital: 892_500_000, distributedCapital: 0, remainingValue: 892_500_000, dpi: 0.0, rvpi: 1.00, tvpi: 1.00, irr: 0.03, unfundedCommitment: 1_955_000_000 },
          { reportYear: 2023, reportQuarter: 4, vehicle: "co_invest", basis: "net", nav: 173_250_000, calledCapital: 157_500_000, distributedCapital: 0, remainingValue: 173_250_000, dpi: 0.0, rvpi: 1.10, tvpi: 1.10, irr: 0.10, unfundedCommitment: 300_000_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 1, documentType: "lp_letter",
        gpCommentaryText:
          "The Fund continued to deploy capital across its core positions during the quarter. Coastal Midstream " +
          "Co.'s leverage ticked up modestly as the company funded growth capital expenditures ahead of " +
          "anticipated EBITDA growth. No valuation events of note occurred this quarter.",
        gpStatedNotableChanges: ["Coastal Midstream Co. - modest increase in leverage tied to growth capex"],
        macroRiskMentions: ["Commodity price volatility remains a monitored risk across the upstream portfolio."],
        metrics: [
          { reportYear: 2024, reportQuarter: 1, vehicle: "main", basis: "gross", nav: 1_350_000_000, calledCapital: 1_250_000_000, distributedCapital: 0, remainingValue: 1_350_000_000, dpi: 0.0, rvpi: 1.08, tvpi: 1.08, irr: 0.11, unfundedCommitment: 2_050_000_000 },
          { reportYear: 2024, reportQuarter: 1, vehicle: "main", basis: "net", nav: 1_062_500_000, calledCapital: 1_062_500_000, distributedCapital: 0, remainingValue: 1_062_500_000, dpi: 0.0, rvpi: 1.00, tvpi: 1.00, irr: 0.06, unfundedCommitment: 1_742_500_000 },
          { reportYear: 2024, reportQuarter: 1, vehicle: "co_invest", basis: "net", nav: 218_500_000, calledCapital: 190_000_000, distributedCapital: 0, remainingValue: 218_500_000, dpi: 0.0, rvpi: 1.15, tvpi: 1.15, irr: 0.14, unfundedCommitment: 280_000_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 2, documentType: "valuation_letter",
        gpCommentaryText:
          "The Fund continued to deploy capital across its upstream and midstream positions during the quarter. " +
          "Highland Energy III closed its first bolt-on acquisition. No valuation events of note occurred this quarter.",
        gpStatedNotableChanges: ["Highland Energy III - first bolt-on acquisition closed"],
        macroRiskMentions: ["Commodity price volatility remains a monitored risk across the upstream portfolio."],
        metrics: [
          { reportYear: 2024, reportQuarter: 2, vehicle: "main", basis: "gross", nav: 1_595_000_000, calledCapital: 1_450_000_000, distributedCapital: 0, remainingValue: 1_595_000_000, dpi: 0.0, rvpi: 1.10, tvpi: 1.10, irr: 0.15, unfundedCommitment: 1_750_000_000 },
          { reportYear: 2024, reportQuarter: 2, vehicle: "main", basis: "net", nav: 1_232_500_000, calledCapital: 1_232_500_000, distributedCapital: 0, remainingValue: 1_232_500_000, dpi: 0.0, rvpi: 1.00, tvpi: 1.00, irr: 0.08, unfundedCommitment: 1_487_500_000 },
          { reportYear: 2024, reportQuarter: 2, vehicle: "co_invest", basis: "net", nav: 261_000_000, calledCapital: 217_500_000, distributedCapital: 0, remainingValue: 261_000_000, dpi: 0.0, rvpi: 1.20, tvpi: 1.20, irr: 0.18, unfundedCommitment: 262_500_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 3, documentType: "valuation_letter",
        gpCommentaryText:
          "Continental Basin Partners crossed $230 million of deployed capital this quarter, remaining held at cost. " +
          "Northshore Infrastructure's valuation was adjusted down pending clarity on a regulatory review of subsidy " +
          "eligibility in its home market.",
        gpStatedNotableChanges: ["Northshore Infrastructure - valuation adjustment pending regulatory review"],
        macroRiskMentions: ["Commodity price volatility remains a monitored risk across the upstream portfolio."],
        metrics: [
          { reportYear: 2024, reportQuarter: 3, vehicle: "main", basis: "gross", nav: 2_016_000_000, calledCapital: 1_680_000_000, distributedCapital: 0, remainingValue: 2_016_000_000, dpi: 0.0, rvpi: 1.20, tvpi: 1.20, irr: 0.19, unfundedCommitment: 1_770_000_000 },
          { reportYear: 2024, reportQuarter: 3, vehicle: "main", basis: "net", nav: 1_570_800_000, calledCapital: 1_428_000_000, distributedCapital: 0, remainingValue: 1_570_800_000, dpi: 0.0, rvpi: 1.10, tvpi: 1.10, irr: 0.10, unfundedCommitment: 1_504_500_000 },
          { reportYear: 2024, reportQuarter: 3, vehicle: "co_invest", basis: "net", nav: 302_400_000, calledCapital: 252_000_000, distributedCapital: 0, remainingValue: 302_400_000, dpi: 0.0, rvpi: 1.20, tvpi: 1.20, irr: 0.21, unfundedCommitment: 265_500_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 4, documentType: "lp_letter",
        gpCommentaryText:
          "Meridian Power Holdings was re-valued this quarter to 1.5x cost, reflecting improved contracted cash flows. " +
          "Coastal Midstream Co.'s Net Debt/EBITDA rose to approximately 3.6x as distributions to its parent outpaced " +
          "EBITDA growth; management has outlined a deleveraging plan. The Fund made its first distribution this quarter.",
        gpStatedNotableChanges: [
          "Meridian Power Holdings - re-valuation to 1.5x cost",
          "Coastal Midstream Co. - leverage increase to ~3.6x Net Debt/EBITDA",
        ],
        macroRiskMentions: ["Commodity price volatility remains a monitored risk across the upstream portfolio."],
        metrics: [
          { reportYear: 2024, reportQuarter: 4, vehicle: "main", basis: "gross", nav: 2_292_000_000, calledCapital: 1_920_000_000, distributedCapital: 12_000_000, remainingValue: 2_292_000_000, dpi: 0.01, rvpi: 1.19, tvpi: 1.20, irr: 0.22, unfundedCommitment: 1_780_000_000 },
          { reportYear: 2024, reportQuarter: 4, vehicle: "main", basis: "net", nav: 1_783_200_000, calledCapital: 1_632_000_000, distributedCapital: 12_000_000, remainingValue: 1_783_200_000, dpi: 0.01, rvpi: 1.09, tvpi: 1.10, irr: 0.12, unfundedCommitment: 1_513_000_000 },
          { reportYear: 2024, reportQuarter: 4, vehicle: "co_invest", basis: "net", nav: 374_400_000, calledCapital: 288_000_000, distributedCapital: 0, remainingValue: 374_400_000, dpi: 0.0, rvpi: 1.30, tvpi: 1.30, irr: 0.24, unfundedCommitment: 267_000_000 },
        ],
      },
      {
        reportYear: 2025, reportQuarter: 1, documentType: "lp_letter",
        gpCommentaryText:
          "Meridian Power Holdings entered into a non-binding letter of intent to sell a majority stake in the " +
          "company; the process is ongoing with no assurance of completion. Separately, following confirmation of " +
          "reduced subsidy support, Northshore Infrastructure initiated a comprehensive review of its capital " +
          "structure and the Fund has reset near-term return expectations for the position. Apex Resources Partners " +
          "became the Fund's largest single holding this quarter. New commitments were made to Delaware Basin Ventures.",
        gpStatedNotableChanges: [
          "Meridian Power Holdings - non-binding LOI to sell a majority stake",
          "Northshore Infrastructure - comprehensive review, return expectations reset",
          "Apex Resources Partners now the Fund's largest holding",
          "New commitment: Delaware Basin Ventures",
        ],
        macroRiskMentions: [
          "Commodity price volatility and regulatory/subsidy risk in international power markets remain monitored themes across the portfolio.",
        ],
        metrics: [
          { reportYear: 2025, reportQuarter: 1, vehicle: "main", basis: "gross", nav: 2_816_000_000, calledCapital: 2_180_000_000, distributedCapital: 18_000_000, remainingValue: 2_816_000_000, dpi: 0.01, rvpi: 1.29, tvpi: 1.30, irr: 0.24, unfundedCommitment: 1_770_000_000 },
          { reportYear: 2025, reportQuarter: 1, vehicle: "main", basis: "net", nav: 2_020_300_000, calledCapital: 1_853_000_000, distributedCapital: 18_000_000, remainingValue: 2_020_300_000, dpi: 0.01, rvpi: 1.09, tvpi: 1.10, irr: 0.13, unfundedCommitment: 1_504_500_000 },
          { reportYear: 2025, reportQuarter: 1, vehicle: "co_invest", basis: "net", nav: 425_100_000, calledCapital: 327_000_000, distributedCapital: 0, remainingValue: 425_100_000, dpi: 0.0, rvpi: 1.30, tvpi: 1.30, irr: 0.23, unfundedCommitment: 265_500_000 },
        ],
      },
    ],
    companies: [
      {
        // Steady compounder, becomes the Fund's largest holding. Also the
        // Fund's sole source of realized proceeds so far - the modest
        // distributions in the fund-level metrics (12MM at Q4'24, 18MM at
        // Q1'25) are entirely attributable to this position.
        companyName: "Apex Resources Partners", sector: "Upstream E&P", geography: "US (Permian Basin, Texas)", investmentDate: "2021-11-01", status: "active",
        investmentType: "equity", boardSeats: 2,
        investmentThesis:
          "Backed an experienced Permian Basin operating team to consolidate high-quality acreage and scale " +
          "production through disciplined drilling and bolt-on M&A.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 255_000_000, costBasis: 245_000_000, committedCapital: 300_000_000, ownershipPct: 82, grossMoic: 1.04, grossIrr: 0.10, realizedProceeds: null },
          { reportYear: 2024, reportQuarter: 1, valuation: 280_000_000, costBasis: 260_000_000, committedCapital: 310_000_000, ownershipPct: 82, grossMoic: 1.08, grossIrr: 0.13, realizedProceeds: null },
          { reportYear: 2024, reportQuarter: 2, valuation: 303_000_000, costBasis: 275_000_000, committedCapital: 320_000_000, ownershipPct: 82, grossMoic: 1.10, grossIrr: 0.16, realizedProceeds: null },
          { reportYear: 2024, reportQuarter: 3, valuation: 403_000_000, costBasis: 310_000_000, committedCapital: 320_000_000, ownershipPct: 82, grossMoic: 1.30, grossIrr: 0.20, realizedProceeds: null },
          { reportYear: 2024, reportQuarter: 4, valuation: 504_000_000, costBasis: 315_000_000, committedCapital: 340_000_000, ownershipPct: 82, grossMoic: 1.60, grossIrr: 0.24, realizedProceeds: 12_000_000 },
          { reportYear: 2025, reportQuarter: 1, valuation: 676_000_000, costBasis: 356_000_000, committedCapital: 360_000_000, ownershipPct: 82, grossMoic: 1.90, grossIrr: 0.28, realizedProceeds: 18_000_000, debtFacilityCapacity: 200_000_000, debtFacilityDrawn: 85_000_000, hedgedPct: 65, hedgeFloorPrice: 68, hedgePriceUnit: "$/bbl WTI", developments: ["Became the Fund's largest position - two bolt-on acquisitions plus continued organic production growth drove valuation up to $676M from $504M last quarter."] },
        ],
      },
      {
        // Re-rating + realization signal - at cost, then a markup, then an LOI to sell.
        companyName: "Meridian Power Holdings", sector: "Power/Infrastructure", geography: "US", investmentDate: "2022-03-15", status: "active",
        investmentType: "equity", boardSeats: 1,
        investmentThesis:
          "Invested in contracted power generation assets with long-term offtake agreements, targeting steady " +
          "cash yield with upside from contract re-pricing at expiry.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 120_000_000, costBasis: 120_000_000, committedCapital: 150_000_000, ownershipPct: 70, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 1, valuation: 140_000_000, costBasis: 140_000_000, committedCapital: 160_000_000, ownershipPct: 70, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 2, valuation: 150_000_000, costBasis: 150_000_000, committedCapital: 175_000_000, ownershipPct: 70, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 3, valuation: 150_000_000, costBasis: 150_000_000, committedCapital: 175_000_000, ownershipPct: 70, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 4, valuation: 225_000_000, costBasis: 150_000_000, committedCapital: 175_000_000, ownershipPct: 70, grossMoic: 1.50, grossIrr: 0.19, developments: ["Received a re-valuation this quarter reflecting improved contracted cash flows; gross multiple increased to 1.5x from cost."] },
          { reportYear: 2025, reportQuarter: 1, valuation: 255_000_000, costBasis: 150_000_000, committedCapital: 175_000_000, ownershipPct: 70, grossMoic: 1.70, grossIrr: 0.24, developments: ["Entered into a non-binding letter of intent to sell a majority stake in the company to a strategic buyer; the process is ongoing with no assurance of completion."] },
        ],
      },
      {
        // Markdown / reversal - steady decline, regulatory/subsidy setback.
        companyName: "Northshore Infrastructure Ltd.", sector: "Power/Infrastructure", geography: "International (United Kingdom)", investmentDate: "2022-06-01", status: "active",
        investmentType: "equity", boardSeats: 1,
        investmentThesis:
          "Provided growth capital to an operating renewable power platform in a regulated market with " +
          "government-backed subsidy support for contracted output.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 170_000_000, costBasis: 165_000_000, committedCapital: 195_000_000, ownershipPct: 60, grossMoic: 1.03, grossIrr: 0.05 },
          { reportYear: 2024, reportQuarter: 1, valuation: 195_000_000, costBasis: 185_000_000, committedCapital: 205_000_000, ownershipPct: 60, grossMoic: 1.05, grossIrr: 0.08 },
          { reportYear: 2024, reportQuarter: 2, valuation: 220_000_000, costBasis: 200_000_000, committedCapital: 210_000_000, ownershipPct: 60, grossMoic: 1.10, grossIrr: 0.12 },
          { reportYear: 2024, reportQuarter: 3, valuation: 180_000_000, costBasis: 200_000_000, committedCapital: 210_000_000, ownershipPct: 60, grossMoic: 0.90, grossIrr: 0.04, developments: ["A regulatory review of subsidy eligibility in the company's home market introduced uncertainty; valuation adjusted down pending clarity."] },
          { reportYear: 2024, reportQuarter: 4, valuation: 130_000_000, costBasis: 200_000_000, committedCapital: 210_000_000, ownershipPct: 60, grossMoic: 0.65, grossIrr: -0.09 },
          { reportYear: 2025, reportQuarter: 1, valuation: 110_000_000, costBasis: 200_000_000, committedCapital: 210_000_000, ownershipPct: 60, grossMoic: 0.55, grossIrr: -0.14, developments: ["Following confirmation of reduced subsidy support, management initiated a comprehensive review of the company's capital structure and reset near-term return expectations for the position."] },
        ],
      },
      {
        // At-cost lag (long) - large capital deployed, longest unmarked position in the Fund.
        companyName: "Continental Basin Partners", sector: "Upstream E&P", geography: "US", investmentDate: "2023-01-10", status: "active",
        investmentType: "equity", boardSeats: 2,
        investmentThesis:
          "Committed capital to fund a multi-year drilling and infrastructure buildout program on newly " +
          "consolidated acreage, ahead of first material production.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 90_000_000, costBasis: 90_000_000, committedCapital: 350_000_000, ownershipPct: 75, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 1, valuation: 140_000_000, costBasis: 140_000_000, committedCapital: 350_000_000, ownershipPct: 75, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 2, valuation: 180_000_000, costBasis: 180_000_000, committedCapital: 350_000_000, ownershipPct: 75, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 3, valuation: 230_000_000, costBasis: 230_000_000, committedCapital: 350_000_000, ownershipPct: 75, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 4, valuation: 270_000_000, costBasis: 270_000_000, committedCapital: 350_000_000, ownershipPct: 75, grossMoic: null, grossIrr: null },
          { reportYear: 2025, reportQuarter: 1, valuation: 312_000_000, costBasis: 312_000_000, committedCapital: 350_000_000, ownershipPct: 75, grossMoic: null, grossIrr: null, developments: ["Cumulative capital deployed surpassed $300 million this quarter; the position remains held at cost pending a formal valuation event - the longest unmarked holding in the Fund."] },
        ],
      },
      {
        // Growing commitment / capital deployment ramp - roughly triples across the 4 quarters.
        companyName: "Highland Energy III", sector: "Upstream E&P", geography: "US", investmentDate: "2023-08-01", status: "active",
        investmentType: "equity", boardSeats: 1,
        investmentThesis:
          "Backed a roll-up strategy acquiring complementary upstream assets to build scale faster than " +
          "organic development alone would allow.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 12_000_000, costBasis: 12_000_000, committedCapital: 150_000_000, ownershipPct: 68, grossMoic: null, grossIrr: null, developments: ["Initial capital deployed following the Fund's commitment in August 2023."] },
          { reportYear: 2024, reportQuarter: 1, valuation: 25_000_000, costBasis: 25_000_000, committedCapital: 150_000_000, ownershipPct: 68, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 2, valuation: 40_000_000, costBasis: 40_000_000, committedCapital: 150_000_000, ownershipPct: 68, grossMoic: null, grossIrr: null },
          { reportYear: 2024, reportQuarter: 3, valuation: 78_000_000, costBasis: 78_000_000, committedCapital: 150_000_000, ownershipPct: 68, grossMoic: null, grossIrr: null, developments: ["Closed the first of several planned bolt-on acquisitions, roughly doubling invested capital in the position quarter over quarter."] },
          { reportYear: 2024, reportQuarter: 4, valuation: 118_000_000, costBasis: 118_000_000, committedCapital: 150_000_000, ownershipPct: 68, grossMoic: null, grossIrr: null, developments: ["Closed a second bolt-on acquisition; cumulative invested capital has now nearly tripled since Q2 2024."] },
          { reportYear: 2025, reportQuarter: 1, valuation: 132_000_000, costBasis: 132_000_000, committedCapital: 150_000_000, ownershipPct: 68, grossMoic: null, grossIrr: null },
        ],
      },
      {
        // Recent add, small, at cost - only appears starting Q1'25.
        companyName: "Delaware Basin Ventures", sector: "Upstream E&P", geography: "US", investmentDate: "2025-01-15", status: "active",
        investmentType: "equity", boardSeats: 2,
        investmentThesis:
          "New commitment to acquire and develop core Delaware Basin acreage alongside a repeat management " +
          "team from a prior fund vintage.",
        quarters: [
          { reportYear: 2025, reportQuarter: 1, valuation: 15_000_000, costBasis: 15_000_000, committedCapital: 60_000_000, ownershipPct: 90, grossMoic: null, grossIrr: null, developments: ["New commitment closed in January 2025; initial capital deployed toward acreage acquisition, held at cost."] },
        ],
      },
      {
        // Leverage creep - Net Debt/EBITDA rises steadily while MOIC holds flat/slightly up.
        // Note investmentType is still "equity": netDebtToEbitda describes leverage on the
        // portfolio company's own balance sheet, not the instrument the Fund holds - the
        // two are independent, and this position is a case where both happen to be true
        // (an equity stake in a company that itself uses leverage).
        companyName: "Coastal Midstream Co.", sector: "Midstream", geography: "US", investmentDate: "2021-05-01", status: "active",
        investmentType: "equity", boardSeats: 2,
        investmentThesis:
          "Acquired a controlling stake in contracted midstream gathering and processing infrastructure with " +
          "stable, fee-based cash flows.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 248_000_000, costBasis: 225_000_000, committedCapital: 230_000_000, ownershipPct: 85, grossMoic: 1.10, grossIrr: 0.12, netDebtToEbitda: 2.5 },
          { reportYear: 2024, reportQuarter: 1, valuation: 253_000_000, costBasis: 225_000_000, committedCapital: 230_000_000, ownershipPct: 85, grossMoic: 1.12, grossIrr: 0.13, netDebtToEbitda: 2.6, developments: ["Net Debt/EBITDA ticked up modestly to ~2.6x as the company funded growth capital expenditures ahead of anticipated EBITDA growth."] },
          { reportYear: 2024, reportQuarter: 2, valuation: 258_000_000, costBasis: 225_000_000, committedCapital: 230_000_000, ownershipPct: 85, grossMoic: 1.15, grossIrr: 0.14, netDebtToEbitda: 2.8 },
          { reportYear: 2024, reportQuarter: 3, valuation: 261_000_000, costBasis: 225_000_000, committedCapital: 230_000_000, ownershipPct: 85, grossMoic: 1.16, grossIrr: 0.145, netDebtToEbitda: 3.2 },
          { reportYear: 2024, reportQuarter: 4, valuation: 265_000_000, costBasis: 225_000_000, committedCapital: 230_000_000, ownershipPct: 85, grossMoic: 1.18, grossIrr: 0.15, netDebtToEbitda: 3.6, developments: ["Net Debt/EBITDA rose to approximately 3.6x this quarter as trailing distributions to the parent outpaced EBITDA growth; management has outlined a deleveraging plan."] },
          { reportYear: 2025, reportQuarter: 1, valuation: 270_000_000, costBasis: 225_000_000, committedCapital: 230_000_000, ownershipPct: 85, grossMoic: 1.20, grossIrr: 0.155, netDebtToEbitda: 4.1 },
        ],
      },
      {
        // Venture/Innovation aggregate bucket - structurally lower MOIC, not individually tear-sheeted
        // in spirit (still gets a detail page here, but carries no per-company narrative).
        // boardSeats is null (not just 0) - "how many seats on a basket of positions" isn't
        // a meaningful question the way it is for a single-company stake.
        companyName: "Innovation Sleeve (Aggregate)", sector: "Venture/Innovation", geography: "US", investmentDate: "2022-01-01", status: "active",
        investmentType: "equity", boardSeats: null,
        investmentThesis:
          "A diversified sleeve of early-stage energy-technology investments, sized to provide optional " +
          "upside exposure without concentrating the Fund's core upstream/midstream strategy.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 64_000_000, costBasis: 80_000_000, ownershipPct: null, grossMoic: 0.80, grossIrr: -0.06 },
          { reportYear: 2024, reportQuarter: 1, valuation: 66_000_000, costBasis: 82_000_000, ownershipPct: null, grossMoic: 0.80, grossIrr: -0.055 },
          { reportYear: 2024, reportQuarter: 2, valuation: 68_000_000, costBasis: 85_000_000, ownershipPct: null, grossMoic: 0.80, grossIrr: -0.05 },
          { reportYear: 2024, reportQuarter: 3, valuation: 70_000_000, costBasis: 85_000_000, ownershipPct: null, grossMoic: 0.82, grossIrr: -0.04 },
          { reportYear: 2024, reportQuarter: 4, valuation: 74_000_000, costBasis: 85_000_000, ownershipPct: null, grossMoic: 0.87, grossIrr: -0.02 },
          { reportYear: 2025, reportQuarter: 1, valuation: 76_000_000, costBasis: 85_000_000, ownershipPct: null, grossMoic: 0.89, grossIrr: -0.01 },
        ],
      },
      {
        // Quiet performer, no major story.
        companyName: "Westbrook Gathering Partners", sector: "Midstream", geography: "US", investmentDate: "2022-09-01", status: "active",
        investmentType: "equity", boardSeats: 1,
        investmentThesis:
          "Invested in a fee-based natural gas gathering system underpinned by long-term, largely fixed-fee " +
          "contracts with a diversified shipper base.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 52_000_000, costBasis: 50_000_000, committedCapital: 60_000_000, ownershipPct: 72, grossMoic: 1.04, grossIrr: 0.05 },
          { reportYear: 2024, reportQuarter: 1, valuation: 58_000_000, costBasis: 55_000_000, committedCapital: 60_000_000, ownershipPct: 72, grossMoic: 1.05, grossIrr: 0.07 },
          { reportYear: 2024, reportQuarter: 2, valuation: 63_000_000, costBasis: 60_000_000, committedCapital: 60_000_000, ownershipPct: 72, grossMoic: 1.05, grossIrr: 0.08 },
          { reportYear: 2024, reportQuarter: 3, valuation: 64_800_000, costBasis: 60_000_000, committedCapital: 60_000_000, ownershipPct: 72, grossMoic: 1.08, grossIrr: 0.09 },
          { reportYear: 2024, reportQuarter: 4, valuation: 66_000_000, costBasis: 60_000_000, committedCapital: 60_000_000, ownershipPct: 72, grossMoic: 1.10, grossIrr: 0.10 },
          { reportYear: 2025, reportQuarter: 1, valuation: 67_200_000, costBasis: 60_000_000, committedCapital: 60_000_000, ownershipPct: 72, grossMoic: 1.12, grossIrr: 0.11 },
        ],
      },
      {
        // Quiet performer, no major story.
        companyName: "Sabine Pass Resources", sector: "Upstream E&P", geography: "US", investmentDate: "2023-03-01", status: "active",
        investmentType: "equity", boardSeats: 2,
        investmentThesis:
          "Backed a low-cost operator with a multi-year development inventory in an established basin, " +
          "prioritizing free cash flow generation over rapid growth.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 32_000_000, costBasis: 30_000_000, committedCapital: 50_000_000, ownershipPct: 80, grossMoic: 1.07, grossIrr: 0.08 },
          { reportYear: 2024, reportQuarter: 1, valuation: 41_500_000, costBasis: 38_000_000, committedCapital: 50_000_000, ownershipPct: 80, grossMoic: 1.09, grossIrr: 0.11 },
          { reportYear: 2024, reportQuarter: 2, valuation: 49_500_000, costBasis: 45_000_000, committedCapital: 50_000_000, ownershipPct: 80, grossMoic: 1.10, grossIrr: 0.13 },
          { reportYear: 2024, reportQuarter: 3, valuation: 51_750_000, costBasis: 45_000_000, committedCapital: 50_000_000, ownershipPct: 80, grossMoic: 1.15, grossIrr: 0.15 },
          { reportYear: 2024, reportQuarter: 4, valuation: 54_000_000, costBasis: 45_000_000, committedCapital: 50_000_000, ownershipPct: 80, grossMoic: 1.20, grossIrr: 0.17 },
          { reportYear: 2025, reportQuarter: 1, valuation: 56_250_000, costBasis: 45_000_000, committedCapital: 50_000_000, ownershipPct: 80, grossMoic: 1.25, grossIrr: 0.19 },
        ],
      },
    ],
    // Illustrative sector/sub-strategy targets - generic ranges, not modeled on
    // any real IC memo or LPA. Upstream E&P is deliberately set to run slightly
    // "off target" as of Q1'25 (actual ~60% vs. an 45-58% band) since Apex
    // Resources Partners' continued markup pushed concentration up - a real
    // drift worth an IC conversation, not a data error.
    allocationTargets: [
      { categoryLabel: "Upstream E&P", targetMinPct: 45, targetMaxPct: 58 },
      { categoryLabel: "Power/Infrastructure", targetMinPct: 10, targetMaxPct: 25 },
      { categoryLabel: "Midstream", targetMinPct: 10, targetMaxPct: 20 },
      { categoryLabel: "Venture/Innovation", targetMinPct: 2, targetMaxPct: 10 },
    ],
  },
  // -------------------------------------------------------------------------
  // Ironwood Credit Partners IV, LP - private credit fund, 2021 vintage,
  // single vehicle. Fully invented fund, GP, borrowers, and narrative - not
  // modeled on or derived from any real report. See the file header comment
  // for why this fund exists and how it's deliberately shaped differently
  // from Meridian rather than being a smaller copy of it.
  // -------------------------------------------------------------------------
  {
    name: "Ironwood Credit Partners IV, LP",
    gpName: "Ironwood Capital Management",
    strategy: "Energy & Infrastructure Private Credit",
    assetClass: "private_credit",
    sector: "Energy & Infrastructure Credit",
    geographyFocus: "North America",
    vintageYear: 2021,
    commitmentAmount: 850_000_000,
    currency: "USD",
    vehicles: [
      { vehicleName: "Ironwood Credit Partners IV, LP", vehicleType: "main", commitmentAmount: 850_000_000, key: "main" },
    ],
    quarters: [
      {
        reportYear: 2023, reportQuarter: 4, documentType: "valuation_letter",
        gpCommentaryText:
          "The Fund continued to deploy capital into senior secured and unitranche credit facilities during the " +
          "quarter, with distributions from existing borrowers continuing on schedule. No credit events of note " +
          "occurred this quarter.",
        gpStatedNotableChanges: [],
        macroRiskMentions: ["Elevated interest rates continue to pressure borrower free cash flow across the portfolio's floating-rate obligations."],
        metrics: [
          { reportYear: 2023, reportQuarter: 4, vehicle: "main", basis: "gross", nav: 532_000_000, calledCapital: 560_000_000, distributedCapital: 25_000_000, remainingValue: 532_000_000, dpi: 0.045, rvpi: 0.95, tvpi: 0.995, irr: 0.08, unfundedCommitment: 290_000_000 },
          { reportYear: 2023, reportQuarter: 4, vehicle: "main", basis: "net", nav: 463_500_000, calledCapital: 515_000_000, distributedCapital: 22_400_000, remainingValue: 463_500_000, dpi: 0.0435, rvpi: 0.90, tvpi: 0.944, irr: 0.065, unfundedCommitment: 335_000_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 1, documentType: "lp_letter",
        gpCommentaryText:
          "The Fund made a further quarterly distribution during the period. Palisade Power's Net Debt/EBITDA " +
          "ticked up modestly on softer contracted margins, consistent with the position's pricing at closing. " +
          "No other developments of note occurred this quarter.",
        gpStatedNotableChanges: ["Palisade Power LLC - modest increase in leverage"],
        macroRiskMentions: ["Elevated interest rates continue to pressure borrower free cash flow across the portfolio's floating-rate obligations."],
        metrics: [
          { reportYear: 2024, reportQuarter: 1, vehicle: "main", basis: "gross", nav: 576_600_000, calledCapital: 620_000_000, distributedCapital: 55_000_000, remainingValue: 576_600_000, dpi: 0.0887, rvpi: 0.93, tvpi: 1.019, irr: 0.085, unfundedCommitment: 230_000_000 },
          { reportYear: 2024, reportQuarter: 1, vehicle: "main", basis: "net", nav: 501_600_000, calledCapital: 570_000_000, distributedCapital: 49_300_000, remainingValue: 501_600_000, dpi: 0.0865, rvpi: 0.88, tvpi: 0.967, irr: 0.07, unfundedCommitment: 280_000_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 2, documentType: "valuation_letter",
        gpCommentaryText:
          "The Fund continued to deploy capital into senior secured and unitranche credit facilities across the " +
          "energy and infrastructure sector. Palisade Power's closing leverage of approximately 4.2x Net Debt/EBITDA " +
          "is already above the Fund's internal 3.5x watchlist threshold - a known characteristic of the transaction " +
          "reflected in pricing at closing, not a new development.",
        gpStatedNotableChanges: ["Palisade Power LLC - closing leverage of ~4.2x Net Debt/EBITDA, above internal watchlist threshold"],
        macroRiskMentions: ["Elevated interest rates continue to pressure borrower free cash flow across the portfolio's floating-rate obligations."],
        metrics: [
          { reportYear: 2024, reportQuarter: 2, vehicle: "main", basis: "gross", nav: 620_000_000, calledCapital: 680_000_000, distributedCapital: 85_000_000, remainingValue: 620_000_000, dpi: 0.125, rvpi: 0.912, tvpi: 1.037, irr: 0.09, unfundedCommitment: 170_000_000 },
          { reportYear: 2024, reportQuarter: 2, vehicle: "main", basis: "net", nav: 540_000_000, calledCapital: 625_000_000, distributedCapital: 76_000_000, remainingValue: 540_000_000, dpi: 0.1216, rvpi: 0.864, tvpi: 0.9856, irr: 0.075, unfundedCommitment: 225_000_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 3, documentType: "valuation_letter",
        gpCommentaryText:
          "Timberline Renewables completed a partial refinancing that lowered its leverage this quarter, while " +
          "Palisade Power's Net Debt/EBITDA increased further on softer contracted margins. Sundance Drilling " +
          "Services' loan was marked down and its IRR turned negative following a slowdown in customer completions activity.",
        gpStatedNotableChanges: [
          "Timberline Renewables Corp. - leverage lowered via partial refinancing",
          "Palisade Power LLC - leverage increased to ~4.6x",
          "Sundance Drilling Services Inc. - marked down, IRR turned negative",
        ],
        macroRiskMentions: ["Oilfield services demand remains sensitive to a pullback in completions activity across several basins."],
        metrics: [
          { reportYear: 2024, reportQuarter: 3, vehicle: "main", basis: "gross", nav: 653_000_000, calledCapital: 720_000_000, distributedCapital: 110_000_000, remainingValue: 653_000_000, dpi: 0.1528, rvpi: 0.9069, tvpi: 1.0597, irr: 0.095, unfundedCommitment: 130_000_000 },
          { reportYear: 2024, reportQuarter: 3, vehicle: "main", basis: "net", nav: 568_000_000, calledCapital: 662_000_000, distributedCapital: 99_000_000, remainingValue: 568_000_000, dpi: 0.1495, rvpi: 0.858, tvpi: 1.0075, irr: 0.08, unfundedCommitment: 188_000_000 },
        ],
      },
      {
        reportYear: 2024, reportQuarter: 4, documentType: "lp_letter",
        gpCommentaryText:
          "The Fund made its fourth consecutive quarterly distribution. Sundance Drilling Services was marked down " +
          "further amid continued weakness in its end market and is in discussions with its sponsor regarding a " +
          "potential capital structure amendment. Palisade Power's leverage rose again to approximately 5.0x.",
        gpStatedNotableChanges: [
          "Sundance Drilling Services Inc. - further markdown, sponsor discussions ongoing",
          "Palisade Power LLC - leverage now ~5.0x",
        ],
        macroRiskMentions: ["Interest rates and commodity price volatility remain the two primary risk factors monitored across the credit portfolio."],
        metrics: [
          { reportYear: 2024, reportQuarter: 4, vehicle: "main", basis: "gross", nav: 662_000_000, calledCapital: 750_000_000, distributedCapital: 140_000_000, remainingValue: 662_000_000, dpi: 0.1867, rvpi: 0.8827, tvpi: 1.0694, irr: 0.10, unfundedCommitment: 100_000_000 },
          { reportYear: 2024, reportQuarter: 4, vehicle: "main", basis: "net", nav: 576_000_000, calledCapital: 690_000_000, distributedCapital: 126_000_000, remainingValue: 576_000_000, dpi: 0.1826, rvpi: 0.8348, tvpi: 1.0174, irr: 0.085, unfundedCommitment: 160_000_000 },
        ],
      },
      {
        reportYear: 2025, reportQuarter: 1, documentType: "lp_letter",
        gpCommentaryText:
          "Frontier Basin Water Solutions closed as a new position during the quarter. Sundance Drilling Services " +
          "was placed on non-accrual status pending a broader restructuring discussion with the sponsor and other " +
          "lenders. The Fund continues to closely monitor Palisade Power's elevated leverage, now approximately 5.3x.",
        gpStatedNotableChanges: [
          "New position: Frontier Basin Water Solutions LLC",
          "Sundance Drilling Services Inc. - placed on non-accrual status",
          "Palisade Power LLC - leverage now ~5.3x",
        ],
        macroRiskMentions: ["Interest rates and commodity price volatility remain the two primary risk factors monitored across the credit portfolio."],
        metrics: [
          { reportYear: 2025, reportQuarter: 1, vehicle: "main", basis: "gross", nav: 667_000_000, calledCapital: 780_000_000, distributedCapital: 175_000_000, remainingValue: 667_000_000, dpi: 0.2244, rvpi: 0.8551, tvpi: 1.0795, irr: 0.105, unfundedCommitment: 70_000_000 },
          { reportYear: 2025, reportQuarter: 1, vehicle: "main", basis: "net", nav: 580_000_000, calledCapital: 717_000_000, distributedCapital: 157_000_000, remainingValue: 580_000_000, dpi: 0.2189, rvpi: 0.809, tvpi: 1.0279, irr: 0.09, unfundedCommitment: 133_000_000 },
        ],
      },
    ],
    companies: [
      {
        // Quiet, stable payer - the credit-world equivalent of Meridian's quiet performers.
        companyName: "Cimarron Gas Gathering LLC", sector: "Midstream", geography: "US", investmentDate: "2020-08-01", status: "active",
        investmentType: "credit", boardSeats: null,
        investmentThesis:
          "Senior secured term loan to a midstream gathering system operator with long-term, largely fixed-fee " +
          "contracts and a diversified shipper base - underwritten for stable, current-yield-driven returns rather " +
          "than equity-style appreciation.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 115_000_000, costBasis: 120_000_000, committedCapital: 120_000_000, ownershipPct: null, grossMoic: 1.00, grossIrr: 0.078, netDebtToEbitda: 3.0, realizedProceeds: 800_000 },
          { reportYear: 2024, reportQuarter: 1, valuation: 117_000_000, costBasis: 120_000_000, committedCapital: 120_000_000, ownershipPct: null, grossMoic: 1.02, grossIrr: 0.082, netDebtToEbitda: 3.0, realizedProceeds: 1_600_000 },
          { reportYear: 2024, reportQuarter: 2, valuation: 118_000_000, costBasis: 120_000_000, committedCapital: 120_000_000, ownershipPct: null, grossMoic: 1.05, grossIrr: 0.085, netDebtToEbitda: 3.0, realizedProceeds: 2_500_000 },
          { reportYear: 2024, reportQuarter: 3, valuation: 119_000_000, costBasis: 120_000_000, committedCapital: 120_000_000, ownershipPct: null, grossMoic: 1.07, grossIrr: 0.088, netDebtToEbitda: 3.0, realizedProceeds: 5_100_000 },
          { reportYear: 2024, reportQuarter: 4, valuation: 120_500_000, costBasis: 120_000_000, committedCapital: 120_000_000, ownershipPct: null, grossMoic: 1.09, grossIrr: 0.09, netDebtToEbitda: 3.0, realizedProceeds: 7_800_000 },
          { reportYear: 2025, reportQuarter: 1, valuation: 121_500_000, costBasis: 120_000_000, committedCapital: 120_000_000, ownershipPct: null, grossMoic: 1.11, grossIrr: 0.092, netDebtToEbitda: 3.0, realizedProceeds: 10_600_000, developments: ["Continued to perform in line with underwriting; leverage has held steady at ~3.0x Net Debt/EBITDA since origination."] },
        ],
      },
      {
        // Leverage-creep watchlist - a lender's-eye-view of the same mechanic as Meridian's Coastal Midstream.
        companyName: "Palisade Power LLC", sector: "Power/Infrastructure", geography: "US", investmentDate: "2021-02-01", status: "active",
        investmentType: "credit", boardSeats: null,
        investmentThesis:
          "Unitranche loan to a contracted power generation platform; priced to reflect closing leverage already " +
          "above the Fund's internal watchlist threshold.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 97_000_000, costBasis: 100_000_000, committedCapital: 100_000_000, ownershipPct: null, grossMoic: 1.00, grossIrr: 0.078, netDebtToEbitda: 3.9, realizedProceeds: 600_000 },
          { reportYear: 2024, reportQuarter: 1, valuation: 96_000_000, costBasis: 100_000_000, committedCapital: 100_000_000, ownershipPct: null, grossMoic: 0.99, grossIrr: 0.074, netDebtToEbitda: 4.05, realizedProceeds: 1_150_000, developments: ["Net Debt/EBITDA increased modestly to ~4.05x on softer contracted margins, consistent with the position's pricing at closing."] },
          { reportYear: 2024, reportQuarter: 2, valuation: 95_000_000, costBasis: 100_000_000, committedCapital: 100_000_000, ownershipPct: null, grossMoic: 0.98, grossIrr: 0.07, netDebtToEbitda: 4.2, realizedProceeds: 1_750_000 },
          { reportYear: 2024, reportQuarter: 3, valuation: 93_000_000, costBasis: 100_000_000, committedCapital: 100_000_000, ownershipPct: null, grossMoic: 0.95, grossIrr: 0.055, netDebtToEbitda: 4.6, realizedProceeds: 3_300_000, developments: ["Net Debt/EBITDA rose to approximately 4.6x this quarter, driven by softer contracted margins; the position remains current on interest but is now on the watchlist."] },
          { reportYear: 2024, reportQuarter: 4, valuation: 90_000_000, costBasis: 100_000_000, committedCapital: 100_000_000, ownershipPct: null, grossMoic: 0.91, grossIrr: 0.03, netDebtToEbitda: 5.0, realizedProceeds: 4_700_000 },
          { reportYear: 2025, reportQuarter: 1, valuation: 88_000_000, costBasis: 100_000_000, committedCapital: 100_000_000, ownershipPct: null, grossMoic: 0.88, grossIrr: 0.01, netDebtToEbitda: 5.3, realizedProceeds: 5_900_000, developments: ["Leverage increased further to ~5.3x; the borrower has engaged an advisor to evaluate capital structure alternatives. The position remains current but is being monitored closely."] },
        ],
      },
      {
        // Stress/markdown case, heading to non-accrual - the credit-world equivalent of Meridian's Northshore Infrastructure.
        companyName: "Sundance Drilling Services Inc.", sector: "Upstream E&P", geography: "US", investmentDate: "2020-11-01", status: "active",
        investmentType: "credit", boardSeats: null,
        investmentThesis:
          "Second-lien loan to an oilfield services provider with a diversified basin footprint, underwritten with " +
          "covenant protections against a cyclical downturn in completions activity.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 49_500_000, costBasis: 50_000_000, committedCapital: 50_000_000, ownershipPct: null, grossMoic: 0.99, grossIrr: 0.06, netDebtToEbitda: 3.5, realizedProceeds: 300_000 },
          { reportYear: 2024, reportQuarter: 1, valuation: 49_000_000, costBasis: 50_000_000, committedCapital: 50_000_000, ownershipPct: null, grossMoic: 0.98, grossIrr: 0.05, netDebtToEbitda: 3.65, realizedProceeds: 650_000 },
          { reportYear: 2024, reportQuarter: 2, valuation: 48_000_000, costBasis: 50_000_000, committedCapital: 50_000_000, ownershipPct: null, grossMoic: 0.96, grossIrr: 0.04, netDebtToEbitda: 3.8, realizedProceeds: 1_000_000 },
          { reportYear: 2024, reportQuarter: 3, valuation: 44_000_000, costBasis: 50_000_000, committedCapital: 50_000_000, ownershipPct: null, grossMoic: 0.88, grossIrr: -0.02, netDebtToEbitda: 4.4, realizedProceeds: 1_900_000, developments: ["A slowdown in customer completions activity pressured cash flows; the loan was marked down and Net Debt/EBITDA increased to ~4.4x."] },
          { reportYear: 2024, reportQuarter: 4, valuation: 32_000_000, costBasis: 50_000_000, committedCapital: 50_000_000, ownershipPct: null, grossMoic: 0.64, grossIrr: -0.13, netDebtToEbitda: 5.1, realizedProceeds: 2_700_000, developments: ["Continued weakness in the services segment led to a further markdown this quarter; the company is in discussions with its sponsor regarding a potential capital structure amendment."] },
          { reportYear: 2025, reportQuarter: 1, valuation: 29_000_000, costBasis: 50_000_000, committedCapital: 50_000_000, ownershipPct: null, grossMoic: 0.58, grossIrr: -0.17, netDebtToEbitda: 5.4, realizedProceeds: 2_700_000, developments: ["Following continued deterioration, the position was placed on non-accrual status this quarter pending a broader restructuring discussion with the sponsor and other lenders - no new interest was collected."] },
        ],
      },
      {
        // De-leveraging improver - the positive-direction counterpart to Palisade Power.
        companyName: "Timberline Renewables Corp.", sector: "Power/Infrastructure", geography: "US", investmentDate: "2021-06-01", status: "active",
        investmentType: "credit", boardSeats: null,
        investmentThesis:
          "Senior secured loan to a renewables generation platform with contracted power purchase agreements " +
          "underpinning debt service.",
        quarters: [
          { reportYear: 2023, reportQuarter: 4, valuation: 141_000_000, costBasis: 150_000_000, committedCapital: 150_000_000, ownershipPct: null, grossMoic: 0.94, grossIrr: 0.065, netDebtToEbitda: 4.7, realizedProceeds: 1_000_000 },
          { reportYear: 2024, reportQuarter: 1, valuation: 143_000_000, costBasis: 150_000_000, committedCapital: 150_000_000, ownershipPct: null, grossMoic: 0.955, grossIrr: 0.07, netDebtToEbitda: 4.6, realizedProceeds: 1_950_000, developments: ["Continued a gradual de-leveraging trend, with Net Debt/EBITDA declining from ~4.7x to ~4.6x this quarter."] },
          { reportYear: 2024, reportQuarter: 2, valuation: 145_000_000, costBasis: 150_000_000, committedCapital: 150_000_000, ownershipPct: null, grossMoic: 0.97, grossIrr: 0.075, netDebtToEbitda: 4.5, realizedProceeds: 2_900_000 },
          { reportYear: 2024, reportQuarter: 3, valuation: 148_000_000, costBasis: 150_000_000, committedCapital: 150_000_000, ownershipPct: null, grossMoic: 0.99, grossIrr: 0.082, netDebtToEbitda: 4.1, realizedProceeds: 5_900_000, developments: ["Refinanced a portion of subordinated debt at the asset level, lowering Net Debt/EBITDA from ~4.5x to ~4.1x."] },
          { reportYear: 2024, reportQuarter: 4, valuation: 151_000_000, costBasis: 150_000_000, committedCapital: 150_000_000, ownershipPct: null, grossMoic: 1.01, grossIrr: 0.088, netDebtToEbitda: 3.8, realizedProceeds: 9_000_000 },
          { reportYear: 2025, reportQuarter: 1, valuation: 154_000_000, costBasis: 150_000_000, committedCapital: 150_000_000, ownershipPct: null, grossMoic: 1.03, grossIrr: 0.093, netDebtToEbitda: 3.6, realizedProceeds: 12_200_000, developments: ["Continued de-leveraging trend; Net Debt/EBITDA now approaching the Fund's 3.5x internal watchlist threshold from above."] },
        ],
      },
      {
        // Freshly funded delayed-draw loan, appears only in the most recent quarter -
        // the credit-world equivalent of Meridian's Delaware Basin Ventures.
        companyName: "Frontier Basin Water Solutions LLC", sector: "Midstream", geography: "US", investmentDate: "2025-01-20", status: "active",
        investmentType: "credit", boardSeats: null,
        investmentThesis:
          "Delayed-draw senior secured term loan funding water infrastructure buildout to support upstream " +
          "development activity in the Permian Basin.",
        quarters: [
          { reportYear: 2025, reportQuarter: 1, valuation: 40_000_000, costBasis: 40_000_000, committedCapital: 55_000_000, ownershipPct: null, grossMoic: null, grossIrr: null, netDebtToEbitda: null, realizedProceeds: null, developments: ["New senior secured term loan closed in January 2025 to fund water infrastructure buildout in the Permian Basin; initial draw held at cost pending first-quarter interest accrual."] },
        ],
      },
    ],
    // Sub-sector targets against actual valuation-weighted allocation - deliberately
    // left with two sleeves out of range in opposite directions (Power/Infrastructure
    // over, Upstream E&P Services under), reflecting Palisade Power's persistent
    // distress and Sundance's markdown simultaneously, not a data error.
    allocationTargets: [
      { categoryLabel: "Midstream", targetMinPct: 25, targetMaxPct: 45 },
      { categoryLabel: "Power/Infrastructure", targetMinPct: 25, targetMaxPct: 45 },
      { categoryLabel: "Upstream E&P", targetMinPct: 10, targetMaxPct: 25 },
    ],
  },
];
