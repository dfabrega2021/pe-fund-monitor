#!/usr/bin/env bash
# Zero-setup local smoke test: boots an in-memory Postgres-compatible instance
# (PGlite, via a real Postgres wire-protocol socket), applies the Drizzle
# migration, runs the seed script against it, and prints row counts.
#
# This is NOT the dev/prod database - that's a real Postgres instance from
# Neon or Supabase per architecture.md. This script exists purely so you (or
# Cursor) can sanity-check schema/seed changes in a few seconds without
# needing real DB credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=55432
rm -f /tmp/pglite-ready /tmp/pglite.log

node verify/start-pglite.mjs > /tmp/pglite.log 2>&1 &
PGLITE_PID=$!
trap 'kill $PGLITE_PID 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  if [ -f /tmp/pglite-ready ]; then break; fi
  sleep 1
done

if [ ! -f /tmp/pglite-ready ]; then
  echo "PGlite did not become ready in time. Log:"
  cat /tmp/pglite.log
  exit 1
fi

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres"
echo "Running seed script against in-memory test DB..."
npx tsx lib/db/seed.ts

echo ""
echo "Verifying row counts..."
node verify/verify-queries.mjs
