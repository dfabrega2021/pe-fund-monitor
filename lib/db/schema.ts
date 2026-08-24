import {
  pgTable,
  pgEnum,
  serial,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const vehicleTypeEnum = pgEnum("vehicle_type", ["main", "co_invest", "parallel"]);

// Broad allocation bucket used for the book-level asset class filter - deliberately
// a small, fixed taxonomy (not free text like `strategy`) so filtering/grouping at
// the book level stays reliable as the portfolio scales past a handful of funds.
export const assetClassEnum = pgEnum("asset_class", ["private_equity", "private_credit", "real_assets"]);

export const packageStatusEnum = pgEnum("package_status", ["incomplete", "complete"]);

export const documentTypeEnum = pgEnum("document_type", [
  "valuation_letter",
  "lp_letter",
  "tear_sheets",
  "annual_letter",
  "marketing_other",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "classified",
  "extracted",
  "reviewed",
  "committed",
]);

export const returnBasisEnum = pgEnum("return_basis", ["gross", "net"]);

export const companyStatusEnum = pgEnum("company_status", ["active", "exited", "written_off"]);

export const flagTypeEnum = pgEnum("flag_type", [
  "missing",
  "out_of_bounds",
  "large_delta",
  "inconsistent",
]);

export const flagSeverityEnum = pgEnum("flag_severity", ["info", "warning", "critical"]);

// Distinguishes how a position is structured - separate from companyStatusEnum
// (which tracks active/exited/written_off lifecycle). "credit" positions are
// the ones where netDebtToEbitda below is actually meaningful.
export const investmentTypeEnum = pgEnum("investment_type", ["equity", "preferred_equity", "credit", "structured"]);

// ---------------------------------------------------------------------------
// Core fund tables
// ---------------------------------------------------------------------------

export const funds = pgTable("funds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().defaultRandom(), // single org for now, kept for future multi-tenant
  name: text("name").notNull(),
  gpName: text("gp_name").notNull(),
  strategy: text("strategy").notNull(), // e.g. buyout, growth, credit, energy
  assetClass: assetClassEnum("asset_class").notNull().default("private_equity"),
  sector: text("sector"), // [v2]
  geographyFocus: text("geography_focus"), // [v2]
  vintageYear: integer("vintage_year").notNull(),
  commitmentAmount: numeric("commitment_amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("active"), // active | closed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// [v2] A fund is not one return number - main fund vs co-invest vs parallel vehicles
export const fundVehicles = pgTable("fund_vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundId: uuid("fund_id")
    .notNull()
    .references(() => funds.id, { onDelete: "cascade" }),
  vehicleName: text("vehicle_name").notNull(), // e.g. "Main Fund", "Co-Invest", "Blended"
  vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
  commitmentAmount: numeric("commitment_amount", { precision: 18, scale: 2 }),
  // The family office's OWN commitment to this specific vehicle - distinct from
  // commitmentAmount above, which is the vehicle's total across every LP. This
  // is the one field that doesn't come from the GP's quarterly report (QIR) -
  // it's the piece a capital account statement would carry instead. Powers the
  // family-office-specific rollup on the Executive Summary: ownership % =
  // familyOfficeCommitmentAmount / commitmentAmount, applied to every dollar
  // figure (NAV, called, distributed) before they're summed across funds, so
  // the book-level blend is weighted by what we actually have at stake in each
  // fund rather than by each vehicle's total size.
  familyOfficeCommitmentAmount: numeric("family_office_commitment_amount", { precision: 18, scale: 2 }),
});

// [v2] Groups the 2-3 PDFs that make up one fund + quarter reporting close
export const reportingPackages = pgTable(
  "reporting_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
    reportYear: integer("report_year").notNull(),
    reportQuarter: integer("report_quarter").notNull(), // 1-4
    status: packageStatusEnum("status").notNull().default("incomplete"),
    expectedDocumentTypes: jsonb("expected_document_types").$type<string[]>().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqPeriod: unique().on(t.fundId, t.reportYear, t.reportQuarter),
  })
);

// One row per uploaded PDF, not per quarter [v2]
export const fundReports = pgTable("fund_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundId: uuid("fund_id")
    .notNull()
    .references(() => funds.id, { onDelete: "cascade" }),
  reportingPackageId: uuid("reporting_package_id").references(() => reportingPackages.id, {
    onDelete: "set null",
  }),
  documentType: documentTypeEnum("document_type"),
  reportYear: integer("report_year").notNull(),
  reportQuarter: integer("report_quarter").notNull(),
  sourceFileUrl: text("source_file_url"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  status: reportStatusEnum("status").notNull().default("pending"),
  rawExtractionJson: jsonb("raw_extraction_json"),
  reviewedBy: text("reviewed_by"),
  committedAt: timestamp("committed_at"),
});

// One row per (vehicle, report, return basis) [v2]
export const fundMetrics = pgTable(
  "fund_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => fundReports.id, { onDelete: "cascade" }),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fundVehicles.id, { onDelete: "cascade" }),
    reportYear: integer("report_year").notNull(),
    reportQuarter: integer("report_quarter").notNull(),
    returnBasis: returnBasisEnum("return_basis").notNull(),
    nav: numeric("nav", { precision: 18, scale: 2 }),
    calledCapital: numeric("called_capital", { precision: 18, scale: 2 }),
    distributedCapital: numeric("distributed_capital", { precision: 18, scale: 2 }),
    remainingValue: numeric("remaining_value", { precision: 18, scale: 2 }),
    dpi: numeric("dpi", { precision: 8, scale: 4 }),
    rvpi: numeric("rvpi", { precision: 8, scale: 4 }),
    tvpi: numeric("tvpi", { precision: 8, scale: 4 }),
    irr: numeric("irr", { precision: 8, scale: 4 }), // stored as a fraction, e.g. 0.23 = 23%
    unfundedCommitment: numeric("unfunded_commitment", { precision: 18, scale: 2 }),
    // Only populated when a fund actually uses a subscription line - most
    // quarters/funds will leave these null, which is expected, not missing data.
    subscriptionLineBalance: numeric("subscription_line_balance", { precision: 18, scale: 2 }),
    unleveredIrr: numeric("unlevered_irr", { precision: 8, scale: 4 }), // fraction, e.g. 0.10 = 10%
    currency: text("currency").notNull().default("USD"),
  },
  (t) => ({
    uniqPoint: unique().on(t.vehicleId, t.reportId, t.returnBasis),
  })
);

// ---------------------------------------------------------------------------
// Portfolio company tables
// ---------------------------------------------------------------------------

export const portfolioCompanies = pgTable("portfolio_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundId: uuid("fund_id")
    .notNull()
    .references(() => funds.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  sector: text("sector"),
  geography: text("geography"),
  investmentDate: timestamp("investment_date"),
  status: companyStatusEnum("status").notNull().default("active"),
  // Static, set once (not re-extracted every quarter) - defaults to "equity"
  // since that's the overwhelming majority case; only credit/structured
  // positions need to be told apart explicitly.
  investmentType: investmentTypeEnum("investment_type").notNull().default("equity"),
  // Governance/control, independent of how the position is performing -
  // null means "not disclosed/tracked," not zero.
  boardSeats: integer("board_seats"),
  // One-time "why we invested" write-up, captured at the time of investment -
  // distinct from portfolioCompanyDevelopments below, which is a running log
  // of what's changed since.
  investmentThesis: text("investment_thesis"),
});

export const portfolioCompanyValuations = pgTable("portfolio_company_valuations", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => fundReports.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => portfolioCompanies.id, { onDelete: "cascade" }),
  valuation: numeric("valuation", { precision: 18, scale: 2 }),
  costBasis: numeric("cost_basis", { precision: 18, scale: 2 }), // cumulative invested/drawn to date
  committedCapital: numeric("committed_capital", { precision: 18, scale: 2 }), // total committed to this position; committedCapital - costBasis = unfunded
  ownershipPct: numeric("ownership_pct", { precision: 6, scale: 3 }),
  grossMoic: numeric("gross_moic", { precision: 8, scale: 3 }), // null = "at cost" / not yet meaningful, not 0 [v2]
  grossIrr: numeric("gross_irr", { precision: 8, scale: 4 }), // null = "Cost" or "NA" in source, not 0 [v2]
  // Only meaningful for credit/leveraged positions where the GP discloses it -
  // null is the normal case for most equity positions, not missing data.
  netDebtToEbitda: numeric("net_debt_to_ebitda", { precision: 6, scale: 2 }),
  // Credit-facility (e.g. RBL) capacity and how much of it is drawn - same
  // "only meaningful where disclosed" rule as netDebtToEbitda above. Undrawn
  // headroom is derived (capacity - drawn) at read time rather than stored a
  // second time.
  debtFacilityCapacity: numeric("debt_facility_capacity", { precision: 18, scale: 2 }),
  debtFacilityDrawn: numeric("debt_facility_drawn", { precision: 18, scale: 2 }),
  // Commodity hedging summary - deliberately thin (a CIO-level "how protected
  // is this cash flow" read, not a GP risk desk's full swap book or price-deck
  // sensitivity table). Only meaningful for commodity-exposed positions;
  // hedgePriceUnit is stored per-row (not assumed) since different asset
  // classes hedge in different units ($/bbl WTI vs. $/MMBtu Henry Hub, etc.).
  hedgedPct: numeric("hedged_pct", { precision: 5, scale: 2 }),
  hedgeFloorPrice: numeric("hedge_floor_price", { precision: 10, scale: 2 }),
  hedgePriceUnit: text("hedge_price_unit"),
  // Cumulative cash (or in-kind value) distributed FROM THIS POSITION to date -
  // distinct from valuation (the unrealized mark). Lets the company detail
  // page split Gross MOIC into Realized MOIC (this / costBasis) and
  // Unrealized MOIC (valuation / costBasis), the same realized/unrealized
  // distinction DPI gives at the fund level. Null (not 0) until the first
  // realization event for that position.
  realizedProceeds: numeric("realized_proceeds", { precision: 18, scale: 2 }),
  status: companyStatusEnum("status").notNull().default("active"),
});

// [v2] Running log of "Significant Developments" per company - never overwritten quarter to quarter
export const portfolioCompanyDevelopments = pgTable("portfolio_company_developments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => portfolioCompanies.id, { onDelete: "cascade" }),
  reportId: uuid("report_id")
    .notNull()
    .references(() => fundReports.id, { onDelete: "cascade" }),
  developmentText: text("development_text").notNull(),
  taggedDate: timestamp("tagged_date"),
});

// ---------------------------------------------------------------------------
// Commentary, validation, AI summaries
// ---------------------------------------------------------------------------

export const gpCommentary = pgTable("gp_commentary", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => fundReports.id, { onDelete: "cascade" }),
  rawText: text("raw_text"),
  extractedThemesJson: jsonb("extracted_themes_json").$type<string[]>().default([]),
  gpStatedNotableChanges: jsonb("gp_stated_notable_changes").$type<string[]>().default([]), // [v2]
  macroRiskMentions: jsonb("macro_risk_mentions").$type<string[]>().default([]), // [v2]
  // Advance/early capital calls disclosed in GP notes - distinct from regular
  // scheduled calls, worth surfacing separately since they affect near-term
  // liquidity planning differently than routine capital calls do.
  advanceCapitalCallNotes: jsonb("advance_capital_call_notes").$type<string[]>().default([]),
});

export const validationFlags = pgTable("validation_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => fundReports.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  flagType: flagTypeEnum("flag_type").notNull(),
  severity: flagSeverityEnum("severity").notNull().default("warning"),
  message: text("message").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// GP-mandated target allocation ranges for a fund's sub-strategy/sector mix
// (e.g. "Upstream: 70-80%, Infrastructure: 10-15%"). Optional per fund - most
// funds won't have this set, in which case the allocation-vs-target view just
// doesn't render rather than showing empty targets. Actual/current allocation
// is computed from portfolio company valuations + sectors, not stored here.
export const fundAllocationTargets = pgTable("fund_allocation_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundId: uuid("fund_id")
    .notNull()
    .references(() => funds.id, { onDelete: "cascade" }),
  categoryLabel: text("category_label").notNull(),
  targetMinPct: numeric("target_min_pct", { precision: 5, scale: 2 }).notNull(), // e.g. 70.00 = 70%
  targetMaxPct: numeric("target_max_pct", { precision: 5, scale: 2 }).notNull(),
});

export const aiSummaries = pgTable("ai_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => fundReports.id, { onDelete: "cascade" }),
  generatedText: text("generated_text").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const fundsRelations = relations(funds, ({ many }) => ({
  vehicles: many(fundVehicles),
  reportingPackages: many(reportingPackages),
  reports: many(fundReports),
  portfolioCompanies: many(portfolioCompanies),
  allocationTargets: many(fundAllocationTargets),
}));

export const fundVehiclesRelations = relations(fundVehicles, ({ one, many }) => ({
  fund: one(funds, { fields: [fundVehicles.fundId], references: [funds.id] }),
  metrics: many(fundMetrics),
}));

export const reportingPackagesRelations = relations(reportingPackages, ({ one, many }) => ({
  fund: one(funds, { fields: [reportingPackages.fundId], references: [funds.id] }),
  reports: many(fundReports),
}));

export const fundReportsRelations = relations(fundReports, ({ one, many }) => ({
  fund: one(funds, { fields: [fundReports.fundId], references: [funds.id] }),
  reportingPackage: one(reportingPackages, {
    fields: [fundReports.reportingPackageId],
    references: [reportingPackages.id],
  }),
  metrics: many(fundMetrics),
  valuations: many(portfolioCompanyValuations),
  developments: many(portfolioCompanyDevelopments),
  commentary: many(gpCommentary),
  flags: many(validationFlags),
  summaries: many(aiSummaries),
}));

export const portfolioCompaniesRelations = relations(portfolioCompanies, ({ one, many }) => ({
  fund: one(funds, { fields: [portfolioCompanies.fundId], references: [funds.id] }),
  valuations: many(portfolioCompanyValuations),
  developments: many(portfolioCompanyDevelopments),
}));
