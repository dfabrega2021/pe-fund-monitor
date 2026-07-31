// Shared contract between "AI extraction" and everything downstream (validation,
// review screen, DB commit). Both AI backends (Gemini and the local Ollama
// vision model — see providers/) must produce data matching these exact types
// and JSON schemas. Keeping this in one file is what makes swapping backends
// safe: nothing downstream of extractReport()/classifyDocument() needs to know
// or care which model produced the JSON.
//
// See architecture.md Section 6 ("AI Extraction Strategy") and the "Data
// Handling & Confidentiality" section for why there are two backends at all.

export type DocumentType =
  | "valuation_letter"
  | "lp_letter"
  | "tear_sheets"
  | "annual_letter"
  | "marketing_other";

export type DocumentClassification = {
  document_type: DocumentType;
  fund_name_detected: string;
  report_period_detected: { year: number; quarter: 1 | 2 | 3 | 4 } | null;
  confidence: "high" | "medium" | "low";
};

export type ReturnBasisRow = {
  vehicle_name: string;
  basis: "gross" | "net";
  nav: number | null;
  called_capital: number | null;
  distributed_capital: number | null;
  remaining_value: number | null;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
  unfunded_commitment: number | null;
  // Only present if the document discloses subscription-line/leverage usage -
  // null is the normal case, not a missing-data problem.
  subscription_line_balance: number | null;
  unlevered_irr: number | null;
  currency: string;
};

export type ExtractedPortfolioCompany = {
  name: string;
  sector: string | null;
  investment_date: string | null;
  valuation: number | null;
  cost_basis: number | null;
  committed_capital: number | null; // total committed to this position, if disclosed
  ownership_pct: number | null;
  gross_moic: number | null; // null = "at cost" / not yet meaningful - never 0
  gross_irr: number | null; // null = "Cost" or "NA" in source - never 0
  net_debt_to_ebitda: number | null; // only for credit/leveraged positions that disclose it
  debt_facility_capacity: number | null; // e.g. RBL borrowing base - only if disclosed
  debt_facility_drawn: number | null; // amount drawn against the facility above - only if disclosed
  hedged_pct: number | null; // % of production/exposure hedged - only for commodity-exposed positions that disclose it
  hedge_floor_price: number | null; // floor/swap price backing the hedge above - only if disclosed
  hedge_price_unit: string | null; // e.g. "$/bbl WTI", "$/MMBtu Henry Hub" - only if hedge_floor_price is set
  realized_proceeds: number | null; // cumulative distributions from this specific position, null until first realization
  investment_type: "equity" | "preferred_equity" | "credit" | "structured" | null; // null -> defaults to "equity" on commit
  board_seats: number | null; // governance/control, only if disclosed
  investment_thesis: string | null; // static "why we invested" - only if the document actually states one
  status: "active" | "exited" | "written_off";
  significant_developments: string[];
};

export type FundReportExtraction = {
  fund_name: string;
  report_period: { year: number; quarter: 1 | 2 | 3 | 4 };
  return_bases: ReturnBasisRow[];
  portfolio_companies: ExtractedPortfolioCompany[];
  gp_commentary: {
    raw_text: string;
    key_themes: string[];
    gp_stated_notable_changes: string[];
    macro_risk_mentions: string[];
    advance_capital_call_notes: string[];
  };
  extraction_meta: {
    fields_with_low_confidence: string[];
    source_page_refs: Record<string, number>;
  };
};

export const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: ["valuation_letter", "lp_letter", "tear_sheets", "annual_letter", "marketing_other"],
      description:
        "valuation_letter = short numbers-only quarterly letter. lp_letter = quarterly letter to LPs with " +
        "GP commentary + full performance schedule. tear_sheets = per-portfolio-company deep-dive pages. " +
        "annual_letter = firm-wide yearly letter (not tied to one fund's quarterly schedule). " +
        "marketing_other = pitch decks, fundraising materials, or anything that is not an investor reporting document.",
    },
    fund_name_detected: {
      type: "string",
      description: "The fund name as it literally appears in the document.",
    },
    report_period_detected: {
      anyOf: [
        {
          type: "object",
          properties: {
            year: { type: "integer" },
            quarter: { type: "integer", enum: [1, 2, 3, 4] },
          },
          required: ["year", "quarter"],
        },
        { type: "null" },
      ],
      description: "Null for annual_letter or marketing_other, which aren't tied to a single quarter.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Your confidence in this classification.",
    },
  },
  required: ["document_type", "fund_name_detected", "report_period_detected", "confidence"],
} as const;

export const CLASSIFICATION_PROMPT = `You are classifying a document from a private equity fund's investor reporting package.
Read the attached document and classify it according to the schema. Base document_type strictly on what
the document actually is (a reporting document to existing investors vs. marketing/fundraising material
aimed at prospective investors) - do not guess based on the filename.`;

// Split into two smaller calls instead of one combined schema. llava-phi3 (and
// other small local vision models) have a hard, fixed total context ceiling
// (prompt + image tokens + output tokens all share one small budget - see
// architecture.md Decisions Log). Asking for fund_name + return_bases +
// portfolio_companies + gp_commentary + extraction_meta all in one response
// was too much expected output to fit, and the model would cut off mid-string
// ("Unterminated string in JSON") even on the shortest real document. Two
// smaller calls against the same page images - one for the numbers, one for
// the narrative - each fit comfortably. extractReport() in providers/ollama.ts
// merges the two results back into a single FundReportExtraction.

export const FINANCIALS_SCHEMA = {
  type: "object",
  properties: {
    fund_name: { type: "string" },
    report_period: {
      type: "object",
      properties: { year: { type: "integer" }, quarter: { type: "integer", enum: [1, 2, 3, 4] } },
      required: ["year", "quarter"],
    },
    return_bases: {
      type: "array",
      description:
        "Capture EVERY reported gross/net/vehicle combination (e.g. gross, net-main-fund, " +
        "net-co-invest, net-blended) as separate rows. Do not collapse to a single number.",
      items: {
        type: "object",
        properties: {
          vehicle_name: { type: "string" },
          basis: { type: "string", enum: ["gross", "net"] },
          nav: { type: ["number", "null"] },
          called_capital: { type: ["number", "null"] },
          distributed_capital: { type: ["number", "null"] },
          remaining_value: { type: ["number", "null"] },
          dpi: { type: ["number", "null"] },
          rvpi: { type: ["number", "null"] },
          tvpi: { type: ["number", "null"] },
          irr: { type: ["number", "null"], description: "As a fraction, e.g. 0.23 for 23%." },
          unfunded_commitment: { type: ["number", "null"] },
          subscription_line_balance: {
            type: ["number", "null"],
            description: "Only if the document discloses a subscription line / credit facility balance. Null otherwise.",
          },
          unlevered_irr: {
            type: ["number", "null"],
            description: "Only if the document discloses an unlevered/pre-subscription-line IRR alongside the reported IRR. Null otherwise.",
          },
          currency: { type: "string" },
        },
        required: ["vehicle_name", "basis", "currency"],
      },
    },
    portfolio_companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sector: { type: ["string", "null"] },
          investment_date: { type: ["string", "null"], description: "ISO date if stated." },
          valuation: { type: ["number", "null"] },
          cost_basis: { type: ["number", "null"] },
          committed_capital: {
            type: ["number", "null"],
            description: "Total committed to this position, if disclosed separately from cost basis (drawn-to-date).",
          },
          ownership_pct: { type: ["number", "null"] },
          gross_moic: {
            type: ["number", "null"],
            description: "Use null (never 0) if source shows 'Cost' or 'NA' - the investment is too new to have a meaningful multiple.",
          },
          gross_irr: {
            type: ["number", "null"],
            description: "As a fraction. Use null (never 0) if source shows 'Cost' or 'NA'.",
          },
          net_debt_to_ebitda: {
            type: ["number", "null"],
            description:
              "Only for credit/leveraged positions where the document discloses a leverage multiple. Null for equity positions or when not disclosed.",
          },
          debt_facility_capacity: {
            type: ["number", "null"],
            description: "Total capacity of a disclosed credit facility (e.g. an RBL borrowing base). Null if not disclosed.",
          },
          debt_facility_drawn: {
            type: ["number", "null"],
            description: "Amount currently drawn against debt_facility_capacity. Null if not disclosed.",
          },
          hedged_pct: {
            type: ["number", "null"],
            description:
              "Only for commodity-exposed positions (e.g. E&P) that disclose a % of production/exposure hedged. As a fraction 0-100, not 0-1. Null otherwise.",
          },
          hedge_floor_price: {
            type: ["number", "null"],
            description: "Floor or swap price backing the hedge coverage above, if disclosed. Null otherwise.",
          },
          hedge_price_unit: {
            type: ["string", "null"],
            description: "Unit for hedge_floor_price as stated in the document, e.g. '$/bbl WTI' or '$/MMBtu Henry Hub'. Null if hedge_floor_price is null.",
          },
          realized_proceeds: {
            type: ["number", "null"],
            description:
              "Cumulative cash or in-kind value distributed FROM THIS SPECIFIC POSITION to date (not the fund-level distribution total). Null until the first realization event for this company - never 0 for a position that simply hasn't distributed yet.",
          },
          investment_type: {
            type: ["string", "null"],
            enum: ["equity", "preferred_equity", "credit", "structured", null],
            description: "How the position is structured. Use null if not stated - it defaults to equity, the overwhelming majority case.",
          },
          board_seats: {
            type: ["number", "null"],
            description: "Number of board seats or observer rights held, only if the document discloses it. Null otherwise, not 0.",
          },
          investment_thesis: {
            type: ["string", "null"],
            description:
              "A short, one-time 'why we invested' rationale, only if the document actually states one (e.g. in an initial investment memo or company overview section). Null otherwise - do not infer one from performance commentary.",
          },
          status: { type: "string", enum: ["active", "exited", "written_off"] },
          significant_developments: {
            type: "array",
            items: { type: "string" },
            description: "This quarter's narrative update bullets for this company, if any.",
          },
        },
        required: ["name", "status"],
      },
    },
    extraction_meta: {
      type: "object",
      properties: {
        fields_with_low_confidence: {
          type: "array",
          items: { type: "string" },
          description: "Field names you had to infer rather than read directly off the page.",
        },
        source_page_refs: {
          type: "object",
          additionalProperties: { type: "integer" },
          description: "Best-effort map of field name -> page number it was found on.",
        },
      },
      required: ["fields_with_low_confidence", "source_page_refs"],
    },
  },
  required: ["fund_name", "report_period", "return_bases", "portfolio_companies", "extraction_meta"],
} as const;

export const FINANCIALS_PROMPT = `You are extracting the FINANCIAL DATA from a private equity fund quarterly reporting document for a
Family Office's portfolio monitoring system. Read the attached document carefully and extract according to the
schema. Do NOT summarize GP commentary or narrative text here - only fund name, report period, return metrics,
and portfolio company data. Rules that matter:
- Capture every reported return basis (gross, net-main, net-co-invest, net-blended, etc.) as separate rows -
  do not simplify to one number.
- If a portfolio company's MOIC/IRR is shown as "Cost" or "NA" because it was recently funded, use null, not 0.
- committed_capital, subscription_line_balance, and unlevered_irr should only be filled in if the document
  actually discloses them - leave null rather than estimating. Most quarters won't have these.
- debt_facility_capacity/debt_facility_drawn and hedged_pct/hedge_floor_price/hedge_price_unit are the same:
  only fill these in for positions that actually disclose a credit facility or commodity hedge. Leave null
  otherwise - most positions (and most equity positions especially) won't have these.
- Flag any field you had to infer or estimate (rather than read directly) in extraction_meta.fields_with_low_confidence.
- Keep significant_developments bullets short (a few words each) - this call is for numbers, not prose.`;

// Second, smaller call: GP commentary only. Kept separate from FINANCIALS_SCHEMA
// so the model's whole output budget goes to a short summary instead of being
// split (and truncated) across both numbers and narrative in one response.
export const COMMENTARY_SCHEMA = {
  type: "object",
  properties: {
    raw_text: {
      type: "string",
      description: "A concise summary (a few sentences) of the GP's overall commentary - not a verbatim transcript.",
    },
    key_themes: { type: "array", items: { type: "string" } },
    gp_stated_notable_changes: {
      type: "array",
      items: { type: "string" },
      description: "Changes the GP itself explicitly calls out (e.g. a 'Notable Changes' section).",
    },
    macro_risk_mentions: {
      type: "array",
      items: { type: "string" },
      description: "Any macro/geopolitical/commodity-price risk language, verbatim or closely paraphrased.",
    },
    advance_capital_call_notes: {
      type: "array",
      items: { type: "string" },
      description:
        "Any advance/early capital calls disclosed in footnotes or commentary (e.g. funding drawn ahead of the " +
        "normal call schedule) - distinct from regular scheduled capital calls. Empty array if none disclosed.",
    },
  },
  required: [
    "raw_text",
    "key_themes",
    "gp_stated_notable_changes",
    "macro_risk_mentions",
    "advance_capital_call_notes",
  ],
} as const;

export const COMMENTARY_PROMPT = `You are summarizing the GP COMMENTARY section of a private equity fund quarterly reporting document for a
Family Office's portfolio monitoring system. Read the attached document and extract according to the schema.
Keep raw_text to a short summary, not a full transcript - this is a small model with a limited output budget,
so prioritize being complete over being verbatim. Rules that matter:
- Extract the GP's own "Notable Changes" or similarly-titled callouts separately from your own reading of themes.
- Extract any macro, geopolitical, or commodity-price risk commentary into macro_risk_mentions.
- Extract any advance/early capital call disclosures (often in footnotes) into advance_capital_call_notes -
  leave it as an empty array if none are disclosed, do not guess.
- If the document has no distinct GP commentary/letter section, use short bullet themes from whatever
  narrative text is present instead of leaving fields empty.`;
