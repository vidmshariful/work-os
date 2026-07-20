// Shared Postgres connection for migration and seed scripts. Server-side only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadEnv() {
  const env = {};
  const raw = readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Accept quoted values too. Anything containing "#" must be quoted for
    // Next.js (real dotenv treats it as a comment), so both forms show up.
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) value = quoted[2];
    env[m[1]] = value;
  }
  return env;
}

const env = loadEnv();
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const password = env.SUPABASE_DB_PASSWORD;

const candidates = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...[
    "aws-0-us-east-1", "aws-0-us-east-2", "aws-0-us-west-1", "aws-0-us-west-2",
    "aws-0-eu-central-1", "aws-0-eu-west-1", "aws-0-eu-west-2", "aws-0-eu-north-1",
    "aws-0-ap-southeast-1", "aws-0-ap-southeast-2", "aws-0-ap-south-1",
    "aws-0-ap-northeast-1", "aws-0-sa-east-1", "aws-0-ca-central-1",
    "aws-1-us-east-1", "aws-1-us-east-2", "aws-1-eu-central-1",
    "aws-1-ap-southeast-1", "aws-1-ap-south-1",
  ].map((r) => ({ host: `${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` })),
];

export async function connect() {
  const errors = [];
  for (const c of candidates) {
    const client = new pg.Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
    });
    try {
      await client.connect();
      console.log(`[db] connected via ${c.host}`);
      return client;
    } catch (e) {
      errors.push(`${c.host}: ${e.code ?? e.message}`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error("No connection path worked:\n" + errors.join("\n"));
}
