# PE Portfolio Monitoring Platform (prototype)

Internal portfolio monitoring platform for a Family Office - ingest quarterly PE fund
report PDFs, extract structured data via AI, validate it, store it historically,
compare quarter-over-quarter, and surface a dashboard + AI-generated investment summary.

Full design rationale lives in `architecture.md`. Cursor-specific working rules live in
`.cursorrules` (read automatically). **Read both before making structural changes.**

## Status

- [x] Phase 1: Next.js 14 (App Router, TS, Tailwind) scaffolded, Drizzle configured
- [x] Phase 2: Database schema (11 tables, see `lib/db/schema.ts`) written and migration generated
- [x] Phase 3: Seed script (`lib/db/seed.ts` + `lib/db/seed-data.ts`) - 5 funds, multiple
      quarters, one multi-vehicle fund, portfolio companies with development timelines,
      2 validation flags - verified end-to-end against a real Postgres wire-protocol connection
- [ ] Phase 4: Dashboard read path (Firm/Book-Level Overview + Fund Detail page)
- [ ] Phase 5: Upload flow (batch PDF upload -> classify -> extract -> validate -> review -> commit)
- [ ] Phase 6: QoQ comparison engine + AI investment summary generation
- [ ] Phase 7: Polish (flags queue, risk/macro panel, package completeness tracker)

See `.cursorrules` "Build order" for the exact next-step sequence - work through it one
phase at a time with Cursor's Composer/Agent mode, reviewing each phase before moving on.

## Getting started

1. **Get a free Postgres database.** Go to [neon.tech](https://neon.tech) or
   [supabase.com](https://supabase.com), create a free project, and copy the connection string.
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (from step 1) and
   `ANTHROPIC_API_KEY` (needed starting Phase 5). Set `APP_PASSWORD` to anything, or leave
   it unset to disable the login gate entirely for local dev.
3. Install dependencies:
   ```
   npm install
   ```
4. Push the schema to your database:
   ```
   npm run db:push
   ```
5. Seed it with sample data:
   ```
   npm run seed
   ```
6. Run the app:
   ```
   npm run dev
   ```
   Open http://localhost:3000.

## Useful scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run db:generate` | Generate a new Drizzle migration after changing `lib/db/schema.ts` |
| `npm run db:push` | Push the current schema straight to your Postgres DB (fine for a prototype; use `generate` + a migration runner if this becomes a real product) |
| `npm run seed` | Populate your real database with the sample fund data from `lib/db/seed-data.ts` |
| `npm run db:verify-local` | Zero-setup smoke test: runs the migration + seed against a temporary in-memory Postgres-compatible instance (PGlite), no real DB credentials needed. Useful for quickly sanity-checking a schema change before touching your real database. |
| `npm run typecheck` | `tsc --noEmit` across the whole project |

## Sample data note

7 real GP quarterly reports from a real energy-sector fund (confidential, name withheld,
spanning Dec 2024 - Dec 2025) were reviewed while designing this schema, and are referenced
generically (no fund/company names) in `architecture.md` and `cio_review_and_dashboard_requirements.md`
from the original design conversation - they were used to validate the schema and dashboard
requirements. These documents are under NDA: they must never be pasted into or read by a
cloud AI tool (this includes Claude Code, not just chat interfaces) - only a local,
NDA-safe extraction path (see `architecture.md` Section 6.1/7) is permitted to touch them.
