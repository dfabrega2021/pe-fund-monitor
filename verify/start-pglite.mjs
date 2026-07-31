import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import fs from "node:fs";

const port = 55432;
const db = new PGlite();
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();

// Apply the generated migration
const sqlDir = new URL("../drizzle/", import.meta.url);
const files = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const sql = fs.readFileSync(new URL(f, sqlDir), "utf8");
  await db.exec(sql);
  console.error(`applied migration: ${f}`);
}

console.error(`PGlite socket server listening on 127.0.0.1:${port}`);
fs.writeFileSync("/tmp/pglite-ready", "ready");
