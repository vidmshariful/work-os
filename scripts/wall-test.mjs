// The Phase 1 wall acceptance test, run through the API exactly as the app
// reads data: anon key plus a signed-in user's JWT, RLS in force.
// Usage: node scripts/wall-test.mjs [password]
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./db.mjs";

const env = loadEnv();
const PASSWORD = process.argv[2] || process.env.SEED_PASSWORD || "Vidiosa#2026";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function signIn(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}`);
  return client;
}

// 1. Below-wall animator: codes and status yes, commercial identity null.
const rakib = await signIn("rakib@vidiosa.com");
{
  const { data, error } = await rakib.from("v_clients").select("*");
  check("below wall: v_clients readable", !error && data.length >= 3, error?.message ?? `${data?.length} rows`);
  const masked = (data ?? []).every(
    (c) =>
      c.commercial_name === null &&
      c.contact_name === null &&
      c.contact_email === null &&
      c.origin === null &&
      c.contract_value === null
  );
  const hasCodes = (data ?? []).every((c) => c.code && c.status);
  check("below wall: every commercial column is null", masked);
  check("below wall: code and status present on every row", hasCodes);
}

// 2. Above-wall Operations Manager: real values including origin.
const nadia = await signIn("nadia@vidiosa.com");
{
  const { data, error } = await nadia.from("v_clients").select("*");
  const meridian = data?.find((c) => c.code === "CLT-1001");
  check(
    "above wall: commercial values visible",
    !error && meridian?.commercial_name === "Meridian Fitness" && meridian?.origin === "ghl_video",
    error?.message ?? `${meridian?.commercial_name} / ${meridian?.origin}`
  );
  check(
    "above wall: contract and contact visible",
    meridian?.contract_value === 12000 && meridian?.contact_email === "alex@meridianfitness.com"
  );
}

// 3. Direct select on the base clients table fails for both.
{
  const { data, error } = await rakib.from("clients").select("*");
  check("below wall: direct clients select is denied", !!error || (data ?? []).length === 0, error ? "denied" : "empty");
  const r2 = await nadia.from("clients").select("*");
  check("above wall: direct clients select is denied", !!r2.error || (r2.data ?? []).length === 0, r2.error ? "denied" : "empty");
}

// 4. Guarantee 2: the below-wall user's world contains only their workspace.
{
  const { data, error } = await rakib.from("workspaces").select("slug");
  check(
    "below wall: workspaces returns only vidiosa",
    !error && data.length === 1 && data[0].slug === "vidiosa",
    error?.message ?? (data ?? []).map((w) => w.slug).join(",")
  );
}

// 5. Belt and braces: projects are readable and titles are brand-blind by
// construction (no client name column exists on projects).
{
  const { data, error } = await rakib.from("projects").select("code,title,status");
  check("below wall: projects readable by code and title", !error && (data?.length ?? 0) >= 3, error?.message);
}

await rakib.auth.signOut();
await nadia.auth.signOut();

const failed = results.filter((r) => !r.pass);
console.log(failed.length === 0 ? "\nWALL TEST: ALL PASS" : `\nWALL TEST: ${failed.length} FAILURE(S)`);
process.exit(failed.length === 0 ? 0 : 1);
