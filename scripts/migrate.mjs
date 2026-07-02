// Applies supabase/migrations/*.sql in order, tracking what ran in
// public._migrations. Each file runs in one transaction.
// Usage: node scripts/migrate.mjs
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connect } from "./db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "supabase", "migrations");

const client = await connect();
await client.query(`
  create table if not exists public._migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
  revoke all on public._migrations from anon, authenticated;
`);

const { rows } = await client.query("select name from public._migrations");
const applied = new Set(rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(path.join(dir, file), "utf8");
  console.log(`[migrate] applying ${file}`);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations (name) values ($1)", [file]);
    await client.query("commit");
    ran++;
  } catch (e) {
    await client.query("rollback");
    console.error(`[migrate] FAILED in ${file}: ${e.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(ran === 0 ? "[migrate] nothing to apply" : `[migrate] applied ${ran} migration(s)`);
await client.end();
