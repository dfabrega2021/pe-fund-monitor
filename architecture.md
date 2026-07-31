# PE Portfolio Monitoring Platform — Architecture v2

**Context:** Take-home case study for a Family Office. Goal: a system that ingests quarterly PE fund report PDFs, extracts structured data via AI, validates it, stores it historically, compares quarter-over-quarter, and produces a dashboard + AI-generated investment summary. Must scale conceptually to 40+ funds. Build window: 2–3 days. Needs to be shareable with the reviewer (not just local).

**v2 changelog:** revised after reviewing 7 real sample reports from a real energy-sector fund (name withheld - confidential, provided under NDA) in the project's knowledge folder. Three things changed the design: (1) fund returns are reported across multiple vehicles/bases (gross, net-main, net-co-invest, net-blended), not one IRR; (2) a single quarter's "report" is actually a package of 2–3 separate PDFs (valuation letter, LP letter, tear sheets) plus non-report collateral (pitch decks, annual letters) that must be classified and filtered; (3) sector/GP concentration risk across the whole book matters as much as single-fund performance. Changes are marked **[v2]** inline below.

---

## 1. Recommended Stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router, TypeScript)** | One codebase, one deploy, no separate backend to wire up. Cursor is very good at Next.js. Fastest path to a shippable link in 2–3 days. |
| Database | **Postgres (Neon or Supabase free tier)** | Relational fits time-series fund data perfectly. Trivial to scale to 40 funds × dozens of quarters (thousands of rows — a non-problem). Free hosted tier = shareable instantly. |
| ORM | **Drizzle** (or Prisma if you're more comfortable) | Type-safe schema, easy migrations, Cursor scaffolds it well. |
| File storage | **Vercel Blob** or Supabase Storage | Store the original PDFs for audit/traceability. |
| AI | **Local vision model via Ollama, PDF rendered to page images** | Document classification and extraction run entirely on your own machine — no third-party API call exists anywhere in this pipeline. A cloud backend (Gemini) was prototyped behind a pluggable interface and deliberately removed once this local path was confirmed working; see the Decisions Log. This means the confidentiality question that shaped this whole section of the build is closed by construction, not by a usage policy someone has to remember to follow. See Section 6 and "Data Handling & Confidentiality" below. |
| Hosting | **Vercel** | One-click deploy, free tier, shareable URL — solves your "need to send it to them" requirement with near-zero infra work. |
| Auth | **Decided: single shared password (or none), env-var gated** | Not the focus of this prototype. A middleware check against one `APP_PASSWORD` env var (or a Vercel-protected preview URL) is a 15-minute task; don't spend a day of the 2-3 available on Clerk/multi-user roles. Upgrade path noted in Future Improvements. |

This is a monolith by design. A 40-fund system does **not** need microservices, a message queue, or a separate Python service — that would be overengineering for the actual data volume involved (a few thousand rows, a few dozen PDF uploads a quarter). The architecture below is built so scaling to 40+ funds is a matter of "add rows," not "redesign."

---

## 2. System Architecture (high level flow)

```
[User] --upload batch of PDFs (1 fund, 1 quarter)--> [Next.js API route]
                              |
                              v
                     [Store each PDF in Blob storage]
                              |
                              v
        [v2] [Local Ollama vision model: classify document_type per PDF]
              (valuation_letter | lp_letter | tear_sheets | annual_letter | marketing/other)
                              |
                              v
        marketing/other --> [stored for reference only, excluded from pipeline]
              |
              v (report types only)
              [Local Ollama vision model: structured extraction]  --JSON schema-->  [Extraction result + confidence flags]
                              |
                              v
                [Validation layer: schema + business rules (vintage-aware) [v2]]
                              |
                              v
              [Review screen: human confirms / edits fields, grouped by source document [v2]]
                              |
                              v
     [Commit to Postgres: fund_reports + fund_vehicles + fund_metrics + portfolio_company_valuations
      + portfolio_company_developments] [v2]
                              |
                              v
              [Comparison engine: current quarter vs prior quarter(s), per vehicle/return-basis [v2]]
                              |
                              v
        [Dashboard: auto-updates]  <----  [AI summary generator: call over current+prior data]
```

Three distinct AI calls, intentionally kept separate:
1. **[v2] Classification** — a cheap, fast call (or even a simple prompt against page 1 + filename) that tags each uploaded PDF's `document_type` before anything else happens. This exists because real GP data rooms mix quarterly reports with pitch decks and annual letters — confirmed by the sample packet, where 1 of 7 files was an investor pitch deck that should never reach the historical database.
2. **Extraction** — turns unstructured PDF → structured JSON. Deterministic-as-possible, schema-forced. Only runs on document types classified as a reporting document.
3. **Summary generation** — turns structured historical data (already validated, already in DB) → narrative investment memo. This one is free to be more "creative"/analytical, and it's cheap to regenerate since it's not touching the source-of-truth data.

Classification and extraction (calls 1 and 2) both go through the local Ollama backend described in Section 6 — see that section for why this is the only backend, not a default among several.

Keeping these separate means a bad summary never corrupts your data, a bad extraction never reaches the LLM twice, and a misclassified marketing deck never pollutes fund history.

---

## 3. Folder Structure

```
/app
  /(dashboard)
    /page.tsx                    → firm/book-level overview (all funds, concentration view) [v2]
    /funds/[fundId]/page.tsx     → single fund detail + trends
  /upload
    /page.tsx                    → batch upload + review/confirm flow [v2]
  /api
    /reports/upload/route.ts     → handles multi-PDF batch upload, stores files
    /reports/[id]/classify/route.ts → calls Claude classification per file [v2]
    /reports/[id]/extract/route.ts → calls Claude extraction, returns draft JSON
    /reports/[id]/commit/route.ts  → validates + writes confirmed data to DB
    /funds/[id]/summary/route.ts   → generates AI investment summary
/lib
  /ai
    schemas.ts             → shared types + JSON schemas + prompts [v3]
    classify.ts             → classifyDocument() -> local Ollama backend [v3]
    extraction.ts           → extractReport() -> local Ollama backend [v3]
    summary.ts               → prompt for IC-style memo
    /providers               → [v3] kept as a folder (not inlined into classify/extraction.ts)
      types.ts                 → the AIProvider interface, so a second backend could be added the same way later
      ollama.ts                  → the only backend - PDF rendered to images, runs entirely on your machine
  /db
    schema.ts             → Drizzle schema definitions
    queries.ts            → reusable query functions (getFundHistory, getQoQDelta, getConcentration, etc.)
  /validation
    schema.ts             → Zod schema for extracted data shape
    rules.ts               → business-rule checks (bounds, deltas, monotonicity, vintage-aware) [v2]
  /pdf
    storage.ts            → upload/retrieve original PDFs from Supabase Storage
    render.ts              → [v3] PDF page -> PNG buffers via poppler, feeds the Ollama backend
/components
  /dashboard
    FirmOverview.tsx, ConcentrationChart.tsx, FundCard.tsx, TrendChart.tsx,
    PortfolioTable.tsx, FlagsBadge.tsx, RiskPanel.tsx [v2]
  /upload
    BatchDropzone.tsx, PackageCompleteness.tsx, ExtractionReviewForm.tsx [v2]
/types
  fund.ts, report.ts, extraction.ts
```

---

## 4. Database Schema

```
funds
  id (pk), name, gp_name, strategy, sector, geography_focus, vintage_year,   -- sector/geography added [v2]
  commitment_amount, currency, status, org_id (fk, default single org for now)

fund_vehicles                     -- [v2] new: a fund is not one return number
  id (pk), fund_id (fk), vehicle_name, vehicle_type (main | co_invest | parallel),
  commitment_amount

reporting_packages                -- [v2] new: groups the 2-3 PDFs of one fund+quarter close
  id (pk), fund_id (fk), report_year, report_quarter,
  status (incomplete | complete), expected_document_types (json array)

fund_reports                      -- one row per uploaded PDF, not per quarter [v2]
  id (pk), fund_id (fk), reporting_package_id (fk),                          -- [v2]
  document_type (valuation_letter | lp_letter | tear_sheets | annual_letter | marketing_other),  -- [v2]
  report_year, report_quarter,
  source_file_url, uploaded_at, status (pending | classified | extracted | reviewed | committed),
  raw_extraction_json, reviewed_by, committed_at

fund_metrics                      -- one row per (vehicle, report, return basis)
  id (pk), report_id (fk), fund_id (fk), vehicle_id (fk),                    -- vehicle_id added [v2]
  report_year, report_quarter, return_basis (gross | net),                  -- return_basis added [v2]
  nav, called_capital, distributed_capital, remaining_value,
  dpi, rvpi, tvpi, irr, unfunded_commitment, currency
  UNIQUE (vehicle_id, report_id, return_basis)

portfolio_companies
  id (pk), fund_id (fk), company_name, sector, geography, investment_date, status

portfolio_company_valuations       -- one row per report, per company
  id (pk), report_id (fk), company_id (fk),
  valuation, cost_basis, ownership_pct, gross_moic, gross_irr,              -- split gross/net [v2]
  status (active | exited | written_off)

portfolio_company_developments     -- [v2] new: running log, not overwritten each quarter
  id (pk), company_id (fk), report_id (fk), development_text, tagged_date

gp_commentary
  id (pk), report_id (fk), raw_text, extracted_themes_json,
  gp_stated_notable_changes (json array)                                     -- [v2] captures GP's own "Notable Changes" callouts for AI-vs-GP comparison

validation_flags
  id (pk), report_id (fk), field_name, flag_type (missing | out_of_bounds | large_delta | inconsistent),
  severity (info | warning | critical), message, resolved boolean

ai_summaries
  id (pk), report_id (fk), generated_text, model_used, created_at
```

Indexing: `(fund_id, report_year, report_quarter)` on `fund_reports` and `(vehicle_id, report_year, report_quarter)` on `fund_metrics` — these are the indexes that make every dashboard query (trend lines, QoQ deltas, portfolio overview) fast regardless of whether you have 4 funds or 400.

`org_id` on `funds` costs nothing today and saves you a painful migration if this ever becomes multi-client. Worth including even for a take-home — it signals you're thinking about the real product, not just the demo.

**[v2] Why `fund_vehicles` and `return_basis` exist:** the real sample reports show every fund reporting Gross returns plus three distinct Net bases (main fund only, co-invest vehicle only, blended), each a materially different number in the same quarter. Collapsing this into one `net_irr` column (as v1 did) would force a lossy choice at ingestion time and make an unlabeled number that could mislead an investment committee. Modeling it as rows keyed by `(vehicle_id, return_basis)` means the dashboard decides what to show, not the schema.

**[v2] Why `reporting_packages` exists:** the sample packet showed a single fund/quarter arriving as 2-3 separate PDFs (valuation letter, LP letter, tear sheets) issued on different cadences, plus a pitch deck and an annual letter that are not quarterly data at all. Treating "one PDF" as "one report" (v1's assumption) breaks the first time a real GP data room is used. `reporting_packages` groups the files that arrived together for a fund/quarter; `fund_reports.document_type` lets the pipeline route non-report PDFs to reference-only storage instead of extraction. **[v3] Note on scope:** the original plan was for this table to also drive a per-document-type completeness tracker (see Section 10) - that was simplified once real usage showed some GPs bundle everything into one combined file rather than 2-3 separate ones (see Section 9, "Reporting status tracker"); `expected_document_types` is kept on the table for potential future use but nothing currently reads it.

**[v2] Why `portfolio_company_developments` is separate from `portfolio_company_valuations`:** the tear sheets carry a "Significant Developments" narrative per company that accumulates quarter over quarter (e.g., one portfolio company's story ran across three quarters: an acquisition, then a facility going live, then a throughput record). Storing this as a field on the valuation row would overwrite prior quarters' developments; a separate log table preserves the full timeline for the fund detail drill-down.

---

## 5. Data Model (canonical extraction schema)

This is the contract between "AI extraction" and "everything else." Define it once as a Zod schema, reuse it for: the Claude tool-use schema, the validation layer, and the TypeScript types.

```ts
// [v2] Classification runs first, on every uploaded PDF, before extraction is attempted
DocumentClassification {
  document_type: "valuation_letter" | "lp_letter" | "tear_sheets" | "annual_letter" | "marketing_other"
  fund_name_detected: string
  report_period_detected: { year: number, quarter: 1|2|3|4 } | null   // null for annual_letter/marketing
  confidence: "high" | "medium" | "low"
}

// Extraction only runs if document_type is a reporting type
FundReportExtraction {
  fund_name: string
  report_period: { year: number, quarter: 1|2|3|4 }
  return_bases: Array<{                        // [v2] replaces single fund_metrics block
    vehicle_name: string                        // e.g. "Fund Name", "Fund Name Co-Invest", "Blended"
    basis: "gross" | "net"
    nav: number
    called_capital: number
    distributed_capital: number
    remaining_value: number
    dpi: number
    rvpi: number
    tvpi: number
    irr: number
    unfunded_commitment: number
    currency: string
  }>
  portfolio_companies: Array<{
    name: string
    sector: string | null
    investment_date: string | null
    valuation: number
    cost_basis: number | null
    ownership_pct: number | null
    gross_moic: number | null
    gross_irr: number | null            // note: "Cost" or "NA" in source text should map to null, not 0 — see validation
    status: "active" | "exited" | "written_off"
    significant_developments: string[]   // [v2] this quarter's narrative bullets, appended to the company's running log, never overwriting prior quarters
  }>
  gp_commentary: {
    raw_text: string
    key_themes: string[]        // e.g. ["new add-on acquisition", "markdown in Company X", "delayed exit"]
    gp_stated_notable_changes: string[]   // [v2] GP's own explicit "Notable Changes to Valuation" callouts, when present — compared against AI-detected changes downstream
    macro_risk_mentions: string[]         // [v2] geopolitical/commodity/macro risk language, tagged separately for the Risk & Macro panel
  }
  extraction_meta: {
    fields_with_low_confidence: string[]   // model self-reports uncertainty
    source_page_refs: Record<string, number>
  }
}
```

The `extraction_meta` block is what makes this feel like a real risk-aware system rather than a naive "trust the LLM" pipeline — it's also cheap to ask Claude for in the same call.

**[v2] Why `return_bases` is an array, not a single object:** the sample reports show every fund quarter reporting Gross plus multiple Net bases simultaneously (main fund, co-invest, blended). A single `fund_metrics` object (v1) forces the extraction step to silently pick one and discard the rest. An array keeps all reported bases and lets `fund_vehicles`/`return_basis` in the DB schema store them without loss.

---

## 6. AI Extraction Strategy

### 6.1 Local-only, by design [v3]

**[v3] Classification and extraction run on a single backend: a vision-capable open model served locally by Ollama** (`lib/ai/providers/ollama.ts`). PDF pages are rendered to PNGs first (`lib/pdf/render.ts`, via poppler) and sent as images, since local models take images rather than native PDF input. No document — synthetic or real — is ever sent to a third-party API. This is enforced by the codebase having no cloud AI code path at all, not by a policy someone has to remember to follow correctly.

This wasn't the first design. A cloud backend (Gemini, with native PDF input) was built first behind a pluggable `AIProvider` interface (`lib/ai/providers/types.ts`), specifically so extraction could be demoed quickly while the local path was being validated. Once Ollama + a pulled vision model were confirmed working end-to-end, the Gemini backend was removed entirely — see the Decisions Log. `providers/types.ts` is kept as the interface contract in case a second backend is ever worth adding again, but only one implementation exists today.

The underlying reasoning for going local-only rather than rule-based-only or cloud-only is not a novelty pattern invented for this case study — it mirrors how the industry actually handles this exact problem. Vendors purpose-built for GP report extraction (Canoe Intelligence, Cobalt's AI Doc Ingest, Chronograph) all use AI-based extraction rather than rule-based/positional parsing, specifically because GP reporting formats are wildly inconsistent across administrators — the same failure mode this project's own sample reports demonstrated (garbled headers, image-heavy layouts) when a text-extraction library was tried first. Separately, on-premise/local LLM deployment for exactly this class of data-sovereignty requirement is itself an established vendor category (e.g. elDoc's on-prem LLM extraction, marketed specifically at finance/legal/healthcare). Running an AI model, but running it entirely on your own hardware, is what gets both properties at once: extraction that generalizes across inconsistent GP formats, with zero exposure of confidential documents to a third party.

### 6.2 Extraction rules

- **[v2] Classify before extracting.** Every uploaded PDF gets a cheap classification call first (`document_type`, detected fund name, detected period). Only `valuation_letter` / `lp_letter` / `tear_sheets` proceed to full extraction; `annual_letter` gets a lighter-weight commentary-only extraction (no fund_metrics table to parse); `marketing_other` is stored for reference and never touches the historical tables. This is necessary, not optional — 1 of the 7 sample files was a pitch deck that would have corrupted fund history if extracted naively.
- The sample reports are largely image/infographic-heavy with unusual font kerning — a text-extraction library (pdfplumber, pypdf) returned garbled header text (e.g., "Q E P VIII... UARTERLY ALUATION ETTER") and was 10-20x slower per file than vision-based reading. This is why the pipeline reads each page as a rendered image rather than parsing a text layer.
- Force structured output via Ollama's `format` JSON-schema-constrained generation. This eliminates most "chatty prose instead of JSON" failure modes.
- Ask the model, in the same call, to flag any field it's inferring/uncertain about rather than reading directly off the page — this feeds `extraction_meta.fields_with_low_confidence`, which drives which fields get highlighted in the human review screen.
- **[v2] Extract all reported return bases, not just one.** The prompt should explicitly instruct the model to capture every gross/net/vehicle combination present in the performance schedule, matching the `return_bases` array in the schema — don't let the model "helpfully" simplify to a single net IRR.
- **[v2] Map ambiguous non-numeric values to null, not zero.** Source tables use "Cost" or "NA" for MOIC/IRR on recently-funded companies (meaning "at cost, too early to compute a meaningful return" — not "zero return"). The extraction prompt must map these to `null` explicitly; treating them as `0` would make brand-new investments look like write-offs.
- Extraction caps at 40 pages per call (`MAX_PAGES_PER_CALL` in `providers/ollama.ts`) since local models generally have smaller usable context than cloud models at this image-token density — this covers the 10-50 page range seen in the sample reports; per-section chunking for longer reports is a documented future improvement, not built now.
- Design the prompt/schema to be strategy-agnostic (buyout, growth, credit) at the core fields, with a `strategy_specific_extras: Record<string, unknown>` escape hatch rather than exploding the schema per strategy — keeps 40+ funds across different strategies on one pipeline.

---

## 7. Data Handling & Confidentiality

**Why this section exists:** the sample reports used to design this system (Section "What I did" in the CIO review doc) are real, confidential documents from a real fund (name withheld), provided under NDA for this case study. That constraint shaped several concrete decisions, not just a disclaimer:

1. **There is no cloud AI code path in this project.** `providers/ollama.ts` is the only backend, and it never makes an outbound call for the document itself — pages are rendered locally and sent only to `localhost` (or another machine on your own network) running Ollama. This was not always true: a cloud backend (Gemini) was prototyped first behind a pluggable `AIProvider` interface so the pipeline could be demoed quickly, then deliberately deleted once the local path was confirmed working end-to-end (see Decisions Log). The confidentiality guarantee is enforced by the absence of the code, not by a runtime switch someone has to remember to set correctly.
2. **The real reference reports were read by a human (for the design review in the CIO doc), never sent to any AI service.** No extraction call has ever been run against them in this repo, on any backend that has ever existed in this codebase. The synthetic PDFs in `synthetic-test-pdfs/` exist so the full pipeline can be demoed end-to-end without that constraint ever being at risk.
3. **Human review before commit is not optional.** Every extraction lands in the review screen with confidence flags before anything reaches the historical tables (Section 8, "Validation Layer"). This isn't just a UX nicety: it's the same pattern used by actual GP-report-extraction vendors (Cobalt's AI Doc Ingest advertises "side-by-side review of source documents and extracted data with full audit trails" as a core feature, not an afterthought) — a fiduciary-facing tool doesn't get to silently trust an LLM on numbers an investment committee will act on. The real scalability question isn't "AI vs. no AI," it's what fraction of fields a human has to look at: a well-tuned confidence-scored pipeline routes only the uncertain minority to review, which is what makes this hold at 40+ funds; a system requiring 100% manual entry does not, no matter how confidential-safe it is.
4. **If extending this beyond the case study**, the natural next step for real deployment is running Ollama on a proper GPU box on the firm's own network (rather than a laptop) so extraction throughput scales with fund count without touching the confidentiality model at all — noted in Future Improvements.

## 8. Validation Layer

Two tiers, both run automatically right after extraction, before anything hits the historical table:

1. **Schema validation** (Zod) — types correct, required fields present, no nulls where a number is expected.
2. **Business-rule validation** — domain sanity checks:
   - NAV, called capital, distributed capital ≥ 0
   - `dpi + rvpi ≈ tvpi` (within small tolerance)
   - Called capital is monotonically non-decreasing quarter over quarter
   - Flag (not block) any metric moving >X% quarter-over-quarter for human review — this is exactly the kind of thing a Family Office analyst wants surfaced, not hidden
   - Portfolio company valuations reconcile roughly with fund-level NAV
   - **[v2] Vintage-aware thresholds:** suppress "MOIC at cost" / "0% distributions" flags for portfolio companies funded within the last ~18-24 months. The sample reports show several companies sitting at 1.0x MOIC simply because they're newly funded, not underperforming. Flagging this as an anomaly every time would train the analyst to ignore the flag queue entirely — the fastest way to make a validation layer useless.
   - **[v2] Fund-name consistency check:** confirm the fund name detected on every page/section of a document matches the fund the report was uploaded against. One of the sample documents' disclaimer page mislabels the fund with an off-by-one version number in its own name — a real copy-paste error in GP-produced materials. This won't always be catchable automatically, but a mismatch between the classification step's `fund_name_detected` and the extraction step's `fund_name` is cheap to check and worth a flag.

Failures produce `validation_flags` rows, not hard errors — nothing is destructive. Everything routes to a **review screen** where the extracted values sit next to the flags, editable, before the analyst hits "Commit to history." This human-in-the-loop step is important for a Family Office context: it's the difference between "AI tool" and "AI tool a fiduciary would actually trust."

---

## 9. Dashboard Layout

**[v2] Firm/Book-Level Overview** (landing page, replaces v1's flat fund table as the primary view)
- **Concentration view first:** NAV exposure broken down by GP, strategy, sector, and geography (bar/treemap). The sample packet alone is 100% energy-sector, spread across four GP relationships — this is the single most important thing a CIO checks before looking at any individual fund's performance, and a flat list of 40 fund cards buries it.
- Aggregate called/distributed/remaining value across the whole book, with a called-vs-distributed ratio.
- Fund table below the concentration view: name, strategy, current NAV, QoQ NAV change %, TVPI, net IRR (labeled by basis), open flags count, last report date. Sortable/filterable by strategy, vintage, flag status.
- **[v3] Reporting status tracker:** which funds haven't reported for the current calendar quarter yet — a flat "N of M funds reported" count plus a list of outstanding funds (`getReportingCompleteness()` in `lib/db/queries.ts`), linking to each fund. A real operational control a CIO relies on, not just a nice-to-have. **Simplified from the original per-document-type design** (tracking valuation letter / LP letter / tear sheets as three separate expected slots per fund per quarter) after real usage showed the per-slot assumption doesn't hold — one of the real reference fund's files bundles the QIR and tear sheets into a single combined PDF, which would have shown as permanently "missing" one slot under the original design even though the data was fully present. The simpler fund-level check ("has this fund reported at all this quarter") answers the same operational question without assuming anything about how a given GP packages its files.
- **[v2] Open flags queue** across all funds, prioritized by severity — not buried one fund page at a time.

**Fund Detail Page**
- Header KPIs: NAV, TVPI, DPI, RVPI, IRR, unfunded commitment — shown **per vehicle/return-basis, explicitly labeled** (gross / net-main / net-co-invest / net-blended), never as a single unlabeled number. Current value + QoQ delta arrow.
- Trend charts (Recharts): NAV over time, TVPI/IRR over time, **with a vintage/J-curve indicator** (e.g., "18 months since first close") so an early-stage MOIC near 1.0x doesn't read as underperformance.
- Portfolio company table: sorted by contribution to fund NAV (mirrors how GPs themselves present "largest remaining holdings"), current valuation, QoQ change, status, flags.
- Company drill-down: **[v2] full development timeline** (all quarters' "Significant Developments," not just the latest — the sample tear sheets show these accumulating quarter over quarter per company) plus deal team/board seats and investment thesis.
- GP commentary panel: raw text + extracted key themes.
- **[v2] AI-detected changes vs. GP-stated changes, side by side.** One of the sample letters has its own "Notable Changes to Valuation" section — showing our AI's flags next to the GP's own callouts builds trust when they agree, and is the actual headline when they don't.
- **AI Investment Summary panel**: the generated IC-style memo — material changes, risks, valuation movements, notable GP commentary.
- Validation flags panel: anything still unresolved from the last upload.

**[v2] Risk & Macro Panel** (new section, not in v1)
- Surfaces macro/geopolitical/commodity-price risk language pulled from GP commentary (`macro_risk_mentions`), tagged by which funds/sectors it touches. The sample Annual Letter references a live geopolitical disruption affecting the entire energy-sector book simultaneously — this is exactly the kind of cross-cutting risk a fund-by-fund view would never surface on its own.
- Cross-fund correlation flag: "this risk factor appears in commentary for N of your funds" — turns one GP's letter into a portfolio-wide concentration warning. (Stretch goal if time is short — see Section 10.)

**Upload / Review Flow**
- **[v2] Batch upload per fund + quarter** (not one PDF at a time) → classification step tags each file's `document_type` → only reporting-type documents proceed to extraction; marketing/pitch materials are filed as reference only.
- Review screen groups extracted fields **by source document** (valuation letter vs. LP letter vs. tear sheets), since these can genuinely disagree in real GP materials — shows confidence flags and validation flags inline → analyst edits/confirms → commit.

---

## 10. Scalability Considerations (why this holds at 40+ funds)

- Data volume is trivial for Postgres: 40 funds × ~40 quarters over 10 years × ~10 portfolio companies each is roughly 16,000 valuation rows (a bit more with the `fund_vehicles`/`return_basis` fan-out, still trivial) — nothing here needs anything beyond a well-indexed relational table.
- Extraction is embarrassingly parallel across funds — no shared state, so scaling from 1 report/day to 40 reports/quarter needs no architecture change, only (eventually) a queue instead of synchronous request/response.
- `org_id` on funds and a strategy-agnostic extraction schema mean onboarding new funds or new fund strategies doesn't require schema migrations.
- The AI extraction and AI summary calls are decoupled from each other and from the DB commit — each can fail, retry, or be re-run independently without corrupting historical data.
- **[v2] `reporting_packages` and `fund_vehicles` were added now, not deferred**, specifically because retrofitting them later would require a data migration across every historical row. Everything else new in v2 (Risk & Macro panel, cross-fund correlation) is additive and can be layered on without touching existing tables — those are the parts safe to treat as stretch goals if the 2-3 day window gets tight.

**Explicitly out of scope for now (and why that's fine):** microservices, message queues (Kafka/SQS), separate extraction workers, multi-region deployment, real-time streaming updates. None of these are justified by the actual data volume or user count of a family office monitoring 40 funds — adding them would be pure resume-driven overengineering for this case study, and a reviewer evaluating judgment will notice if you over-build for a problem this size.

---

## 11. Future Improvements (mention, don't build)

- Background job queue (e.g., Inngest/Trigger.dev) once upload volume or PDF size grows enough that synchronous extraction feels slow.
- Multi-user roles/permissions + audit trail (who reviewed/committed what).
- Benchmarking vs public market equivalents (PME).
- Automated ingestion via email forwarding of GP report PDFs.
- Scanned/image-only PDF fallback via OCR.
- Export dashboard/summary to LP-ready PDF or Excel.
- Slack/email alerts when a critical validation flag fires.
- **[v2]** Cross-fund correlation view (a single risk theme, e.g. a geopolitical shock, mapped across every fund/sector it touches) — build the simple per-fund `macro_risk_mentions` tagging first; the aggregation view on top of it is the stretch goal.
- **[v2]** Formal benchmarking of GP-stated "Notable Changes" against AI-detected changes over time, to build a track record of which GPs' commentary the system trusts vs. double-checks more closely.
- **[v3]** Run the Ollama backend on a dedicated GPU machine on the firm's own network (instead of a laptop) once real-document extraction volume grows — same confidentiality model, better throughput.
- **[v3]** Per-section chunking for the Ollama backend on reports over ~40 pages, so very long LP letters don't hit the single-call page cap.

---

## Decisions Log

1. ~~Auth: shared password vs a real auth provider~~ — **resolved:** single shared password / no-auth-for-now. Not the focus of this prototype.
2. ~~Seed/demo data~~ — **resolved:** yes. The app ships with a seed script populating several funds with multiple quarters of history so the dashboard is functional immediately, before any real upload happens. Users can then upload additional quarterly reports on top of the seed data through the normal upload flow — seed data and uploaded data live in the same tables, no special-casing. See Section 12 for what the seed set should actually contain.
3. ~~Do you have real (or realistic sample) quarterly PE report PDFs to test extraction against~~ — **resolved:** the project's knowledge folder has 7 real reports from a real energy-sector fund (confidential, name withheld) spanning Dec 2024 - Dec 2025, across valuation letters, LP letters, tear sheets, and an annual letter. Use these as the actual extraction test set instead of generating synthetic samples.
4. ~~Single hardcoded AI provider (Gemini) vs. something usable on real, confidential documents~~ — **resolved [v3], in two steps.** First, made the AI backend pluggable (`AIProvider` interface, `providers/gemini.ts` + `providers/ollama.ts`) so a local, NDA-safe extraction path could be built and validated without breaking the working Gemini demo. Manual-entry-only for real documents was considered and rejected at this stage — it doesn't scale to 40+ funds, whereas confidence-scored local AI extraction with human review of flagged exceptions does. Second, once the Ollama backend was confirmed working end-to-end (model pulled, poppler installed, a real upload processed successfully), the Gemini backend was removed entirely rather than kept as a fallback — a single local-only backend is simpler to maintain and makes the "no document ever leaves your machine" guarantee a structural fact about the codebase rather than a configuration setting. See Section 7 ("Data Handling & Confidentiality") and Section 6.1.
5. ~~Reporting completeness: per-document-type tracker (as originally designed) vs. something simpler~~ — **resolved [v3]:** simplified to a fund-level "reported this quarter or not" check. Discovered while testing real uploads that a per-document-type tracker (valuation letter / LP letter / tear sheets as three separate expected slots) breaks the moment a GP sends a combined file instead of three separate ones — one of the real reference fund's files does exactly this ("QIR with Tear Sheets" in one PDF). Rather than add logic to guess which slots a combined file satisfies, dropped the per-slot model entirely; `getReportingCompleteness()` just checks whether any real reporting document exists for a fund/quarter. Answers the same CIO question with no assumption about GP packaging conventions. `reporting_packages.expected_document_types` is kept in the schema but unused for now.
6. ~~Which local model to default to for classification/extraction~~ — **resolved [v3], through direct testing on an 8GB MacBook Pro:** `qwen2.5vl:7b` (best accuracy of those tried) crashed the machine outright when extracting a multi-page report - too much for 8GB of total system RAM alongside a normal workload (browser, editor). `moondream` (~1.7GB) was stable but too weak - it misclassified real reporting documents as marketing material. `llava-phi3` (~2.9GB) is the current default: stable on 8GB hardware, meaningfully more capable than moondream. Even so, small local models still misclassify sometimes (see Decision 7) - the manual override exists because of this, not despite it. On a machine with more free RAM, `qwen2.5vl:7b` remains the better choice for accuracy; the model is fully configurable via `OLLAMA_VISION_MODEL`.
7. ~~Trust the AI classification fully, or allow correction~~ — **resolved [v3]:** added a manual override (`PATCH /api/reports/[id]`) so a human can correct a wrong `document_type` and re-trigger extraction, surfaced directly in the upload results UI. This came out of hitting real, repeated misclassifications (Decision 6) rather than being planned upfront - but it's consistent with the project's broader stance (Section 7) that a fiduciary-facing tool shouldn't blindly trust an AI judgment call, whether that's an extracted number or a document classification.
8. ~~Keep AI classification in the main upload flow at all~~ — **resolved [v3]: removed it.** After Decision 7's override kept getting used - and the local model's classification call started outright erroring (a llama.cpp "chunk not found" server error) - it became clear the classification step was net-negative for how this tool actually gets used: at single-fund scale, whoever is uploading already knows what each file is, so having a weak local model guess and then requiring a human to fix it is strictly more steps than just asking upfront. `app/api/reports/upload/route.ts` now takes an explicit `documentType` per file from the uploader instead of calling `classifyDocument()`; extraction is unaffected and still runs through Ollama. `classify.ts`, `providers/ollama.ts`'s `classifyDocument`, and the standalone `/api/reports/[id]/classify` route are left in place, unused by the main flow, as a documented option for a future scenario this exercise doesn't require: bulk-ingesting an unfamiliar GP data room where files' types genuinely aren't known upfront.

---

## 12. Seed Data Plan

Goal: the dashboard should look like a real internal tool the moment it's opened, not an empty state waiting for a demo upload. The seed script (run once via `npm run seed` or on first deploy) inserts synthetic-but-realistic data directly into the DB tables — it does not go through the PDF/extraction pipeline, since that pipeline is for real uploads.

**Composition (deliberately more diverse than the real sample set, to make the concentration view meaningful):**
- 4-5 funds across different GPs, strategies, and sectors (e.g., a buyout fund, a growth equity fund, a credit fund, and one energy-sector fund modeled loosely on the real sample fund's general shape, not its actual figures) — a single-sector seed set would make the "concentration risk" panel from Section 9 look trivial/empty, which defeats the point of building it.
- 3-4 quarters of history per fund, with at least one fund showing a deliberate QoQ swing (a markdown, a new commitment, a partial exit) so the comparison engine and "material changes" AI summary have something real to say on first load.
- At least one fund with a multi-vehicle structure (main + co-invest, different net bases) to exercise the `fund_vehicles`/`return_basis` schema immediately, not just in theory.
- 3-5 portfolio companies per fund with one or two developments logged per quarter, to populate the company drill-down and development timeline.
- One or two seeded `validation_flags` (e.g., a large QoQ delta) so the flags queue isn't empty on first load either.

This seed set is a fixture, not a migration — keep it in `/lib/db/seed.ts` as plain insert statements against the same schema real uploads use, so there's zero drift between "demo data" and "real data" behavior.
