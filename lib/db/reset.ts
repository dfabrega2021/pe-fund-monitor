import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./index";

// Wipes every app table (clean slate for demoing/testing) without touching
// the schema itself. Safe to run repeatedly. Run via `npm run db:reset`.
// Follow with `npm run seed` if you want the demo baseline back, or leave it
// empty if you're about to upload your own mock case from scratch.

const TABLES = [
  "validation_flags",
  "ai_summaries",
  "gp_commentary",
  "portfolio_company_developments",
  "portfolio_company_valuations",
  "portfolio_companies",
  "fund_metrics",
  "fund_allocation_targets",
  "fund_reports",
  "reporting_packages",
  "fund_vehicles",
  "funds",
];

async function main() {
  console.log("Resetting database (truncating all app tables)...");
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`));
  console.log("Done. Run `npm run seed` for demo data, or start uploading fresh.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  });
