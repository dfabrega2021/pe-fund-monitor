# PE Fund Monitor — How It Works

**Prepared by:** Daniela Fábrega
**For:** Ejercicio 2 — Monitoreo de Fondos

A note before anything else: everything shown in the accompanying demo is synthetic, fictional data — no real fund, GP, portfolio company, or figure appears anywhere in it. I built and tested this using entirely invented names and numbers so it could be shared freely, ahead of any NDA. Once an NDA is in place and I receive your real quarterly reports, the same process runs unchanged against real data — nothing about the pipeline or the dashboard depends on the data being fake, it's just what let me share a working demo today instead of waiting.

## 1. The problem, as I understood it

Every quarter, a fund sends a reporting package — usually a valuation letter or LP letter, sometimes with a separate tear-sheet document per portfolio company. Someone has to read it, pull out the numbers and the narrative, and turn that into something a CIO can actually use to make decisions. Doing that by hand for one fund is tedious. Doing it for 40+ funds, every quarter, by hand, isn't a process — it's a bottleneck.

The brief asked for more than a data-entry pipeline, though. It asked what happens *after* capture: understanding how a fund and its positions are performing, and how that's changing quarter to quarter — not just a snapshot. That's the part I spent the most time on, because it's the part that actually matters to an investment team.

So I built this in two halves that share one goal: turn a PDF into a decision-ready view of a fund, and make that view honest about change over time, not just current state.

## 2. The process, end to end

**Step 1 — Capture.** A reporting document (PDF) is uploaded. The system first classifies it — is this a valuation letter, an LP letter, a tear-sheet, an annual letter, or marketing material? — because different document types carry different information and get read differently.

**Step 2 — Extraction.** A local AI vision model reads the document page images directly (not a generic text-scrape) and extracts two things separately: the financial data (NAV, called/distributed capital, DPI/RVPI/TVPI, IRR, unfunded commitment, and portfolio-company-level valuations, MOIC, IRR, committed vs. drawn capital), and the GP's narrative commentary (notable changes, macro/risk mentions, advance capital call disclosures). These are two separate model calls against the same document, not one — more on why in Section 6.

**Step 3 — Structuring.** Extracted data is written into a proper relational schema, not a flat spreadsheet: funds, vehicles (a fund can have a main vehicle and a co-invest vehicle reporting separately), reports, metrics, portfolio companies, valuations, developments, GP commentary — each tied to a specific fund and quarter. This is the piece that makes "scale to 40 funds" trivial rather than aspirational: the schema was multi-fund from the first table I wrote, not retrofitted later.

**Step 4 — Validation.** Every new quarter's data is automatically checked against the fund's own prior quarter — not against a hardcoded threshold, but against rules that understand context. A NAV that moves a lot isn't automatically "wrong": if a fund is young and the move is explained by new capital calls, that's expected; if NAV drops without a corresponding change in called capital, that's a real valuation swing worth flagging. Other checks: a portfolio company's valuation or IRR moving sharply quarter over quarter, a fund's DPI+RVPI failing to reconcile with its stated TVPI, an IRR turning negative for the first time. These flags surface automatically — nobody has to remember to go looking for them.

**Step 5 — Reporting.** The dashboard turns all of this into two views: a firm-wide book view (every fund, filterable by asset class and sector, with total NAV/commitment trending over time) and a per-fund view (KPIs as of the latest quarter, trend charts since inception, a cash-flow/J-curve view, portfolio company detail with committed/unfunded capital and valuation status, GP commentary history across every quarter it's been reported — not just the latest — and an AI-generated narrative summary of what's changed).

## 3. How this scales to 40+ funds

Two different parts of this system scale very differently, and I want to be precise about which is which rather than wave at "it scales" in general.

**The schema and the dashboard scale for free.** This part of the architecture was a design constraint from day one, not an afterthought:

- The schema keys everything off `fund_id` and `vehicle_id`. Adding fund #41 is a row insert, not a schema change.
- The book-level view already aggregates across an arbitrary number of funds — concentration by asset class, filtering by sector, a portfolio-wide NAV trend line. It reads the same whether there are 5 funds in it (as in this demo) or 40.
- The validation engine runs per-fund, per-quarter, automatically — it doesn't need a human to scale their attention across more funds, which is exactly the point. A 40-fund quarterly review that depends on someone remembering to check each one by hand doesn't survive contact with reality; one that runs a consistent rule set against every fund automatically does.

**Extraction does not scale for free, and I want to be direct about why.** Right now, extraction runs on a local vision model on my own laptop — CPU only, 8GB of RAM. That's fine for building and testing against one fund's report. It is not a realistic answer for 40 funds' worth of quarterly packages landing around the same reporting deadline, for two concrete reasons: it's genuinely slow (a CPU-only vision model already takes minutes per document chunk on a single report), and the current flow is synchronous — upload one document, wait for it to finish, then upload the next. Neither of those survives real volume, and a personal laptop isn't production infrastructure regardless of speed — it needs to stay on, unshared, and uninterrupted, which isn't a reasonable thing to depend on.

What actually solves this, if this were built out for real (not yet built — this is the honest design answer, not a working feature):

- **Move the model off my laptop onto a dedicated server the family office controls** — a private, in-house or VPC-hosted machine with real GPU hardware, running the same kind of open-weights model. The non-negotiable principle stays identical (the model runs on infrastructure you control, never a third-party API), but real inference hardware instead of a laptop CPU, which incidentally also resolves today's timeout problem.
- **Add a job queue.** Documents get uploaded and queued, then processed asynchronously by one or more worker processes in parallel, instead of one person watching a single upload finish before starting the next. Forty funds' documents arriving at once becomes a batch job that runs unattended, not a queue of individual manual uploads.
- **Route by confidence, not blind trust.** The extraction schema already tags fields it had to infer rather than read directly (`fields_with_low_confidence`). At real scale, low-confidence extractions should route to a human review queue before being committed, rather than being trusted silently — so the system stays fast on the easy majority of documents and safe on the harder ones, instead of forcing a choice between speed and safety across the board.
- **Expect, and plan for, document diversity.** Forty GPs format their reports forty different ways. Some amount of per-template prompt tuning is realistic and would be discovered empirically as more real documents get run through the pipeline, not solved upfront from a handful of test documents.

## 4. Why these KPIs

I didn't start from "what does a fund report contain" — I started from "what would a CIO need to see to actually make a call on this fund," and worked backward to the data.

- **NAV, TVPI, DPI, RVPI, IRR (gross and net, per vehicle)** — the standard performance vocabulary (aligned with ILPA reporting conventions), because a CIO needs to compare this fund against every other fund in the book using the same language.
- **Gross-to-net spread** — the gap between gross and net IRR/TVPI is the fee-and-carry drag, shown explicitly rather than left for someone to compute in their head across two separate numbers.
- **Unfunded commitment, and committed vs. drawn capital at the portfolio-company level** — this is a liquidity-planning number, not just a performance number. Knowing what's left to be called matters as much as knowing what's already returned.
- **Subscription-line balance and unlevered IRR, where disclosed** — a fund's IRR can look better than it is if a subscription line is doing some of the work. Showing the unlevered figure alongside the reported one is the difference between a real read and a flattering one.
- **Quarter-over-quarter deltas everywhere, not just current values** — this was the core push in the brief: not the photo, the movie. Every KPI on the fund page is shown with its change from the prior quarter, and the trend charts show the full history, not just the latest point.
- **Validation flags** — these aren't a KPI in the traditional sense, but they're the mechanism that makes "understanding what's happening" active rather than passive. A CIO shouldn't have to eyeball 40 funds' worth of numbers every quarter looking for the one that moved; the system should tell them.
- **Sector/sub-strategy allocation vs. target range** — for funds where a GP has stated allocation targets, actual vs. target is a compliance-adjacent read that belongs on the same page as performance, not in a separate document.

## 5. Why this layout

The dashboard is deliberately split into two altitudes, because a CIO asks two different kinds of questions:

**"How is the book doing?"** — the firm-wide view. Total NAV and commitment trending over time, concentration by asset class and sector (with drill-down filtering), a reporting-status view showing which funds are current vs. overdue, and a flags queue surfacing every open validation issue across the whole portfolio in one place. This is the page you open every Monday.

**"How is this specific fund doing?"** — the per-fund view. KPIs as of now, but immediately followed by trend charts since inception (NAV, TVPI) and a cash-flow view showing called capital, distributions, and remaining value as a single J-curve — because a fund's story is its trajectory, not its current coordinates. Below that, portfolio company detail (each company's valuation, MOIC, committed/unfunded capital, and a timeline of GP-reported developments), then the GP's own commentary history across every quarter, not just the latest one — because language the GP used two quarters ago ("we're monitoring," "on watch") often predicts a markdown that shows up later, and that pattern is invisible if you only ever see the current letter.

The AI-generated investment summary sits at the top of the fund page for a reason: it's meant to be the first thing read, synthesizing the quarter's story in a few sentences before the CIO drills into the supporting numbers — the same way a good analyst's cover note works.

## 6. Technology, used actively and disclosed honestly

Two different AI tools were used here, for two different jobs, and I want to be specific about the boundary between them because it matters for confidentiality.

**Document extraction runs on a local, open-source vision language model (Ollama, running entirely on my own machine) — not a third-party cloud API.** This was a deliberate, non-negotiable choice: a real fund's quarterly report is confidential information, and sending it to any external API — even a reputable one — means that data leaves my control the moment it's uploaded. Running the vision model locally means the actual document content never leaves my machine at any point in the pipeline. This is also why the extraction step is split into two smaller calls (financials, then commentary) rather than one combined request: the local model runs on modest hardware with a genuinely limited context budget, and asking for everything in one response caused the model to cut off mid-answer on real documents. Splitting the ask fixed that, at the cost of two model calls instead of one — a real trade-off, not a free lunch.

**Building the application itself — the schema, the query logic, the validation rules, the dashboard UI — was done with Claude (Anthropic).** That's a different, and importantly narrower, use of AI: Claude wrote and helped me reason through code, but Claude never read or processed the content of any real confidential fund document — only synthetic, invented data ever passed through that channel. That boundary was intentional and enforced throughout the build, for the same reason the extraction model runs locally: a third-party AI reading your real reports would defeat the purpose of the local-extraction design entirely, even if the intent were harmless.

In short: local AI reads the confidential documents; a cloud AI helped build the system that hosts them. Keeping those two roles separate was itself a design decision, not an incidental detail.

## 7. What I'd tell you honestly is unfinished

I'd rather flag this than have it discovered later:

- **Extraction runs on my laptop today, not on production infrastructure.** It works on the document types and formats I tested it against, but a CPU-only vision model on 8GB of RAM is genuinely slow, and on some real documents it has hit its output-time limit rather than completing. Splitting the extraction into smaller, more targeted calls (Section 2, Step 2) helped significantly, but it doesn't change the underlying fact: this is a laptop-scale proof of concept, not 40-fund production infrastructure. Section 3 above is my honest answer for what closes that gap (dedicated server, job queue, confidence-based review routing) — none of it is built yet.
- The validation engine's rules are a solid first set (NAV-delta context-awareness, valuation/IRR swing detection, TVPI reconciliation) but are not exhaustive — a real deployment would want the investment team's input on what else should trigger a flag.
- This demo runs on synthetic data by design, for the confidentiality reasons above. I have not yet run the full pipeline end-to-end against a real quarterly report, because I don't have one I'm cleared to process outside an NDA. That's the next real test, once we're able to do it properly.

## 8. Sources

- KPI definitions and reporting conventions (TVPI, DPI, RVPI, gross/net IRR) follow standard institutional LP reporting practice as codified by ILPA (Institutional Limited Partners Association) reporting templates.
- Local AI extraction runs on Ollama (open-source local model runtime) with a vision-capable open-source model.
- Application built on Next.js, PostgreSQL (via Drizzle ORM, hosted on Supabase), and Recharts for visualization.
