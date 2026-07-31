import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add a Postgres connection string (e.g. from Neon or Supabase)."
  );
}

// A single shared connection is fine for a prototype at this scale (see architecture.md Section 9).
const client = postgres(process.env.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { schema });
