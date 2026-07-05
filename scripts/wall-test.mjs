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

// 1. Below-wall animator: codes and stage yes, commercial identity null.
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
      c.contract_value === null &&
      c.website === null &&
      c.highlevel_url === null
  );
  const hasCodes = (data ?? []).every((c) => c.code && c.stage);
  check("below wall: every commercial column is null", masked);
  check("below wall: code and stage present on every row", hasCodes);
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

// 6. The client workroom does not exist below the wall. Every table returns
// zero rows, silently, exactly like an empty world.
const WORKROOM_TABLES = [
  "client_contacts",
  "client_payments",
  "client_documents",
  "client_activity",
  "client_todos",
  "client_notes",
  "project_intakes",
];
for (const table of WORKROOM_TABLES) {
  const { data, error } = await rakib.from(table).select("*");
  check(
    `below wall: ${table} is empty`,
    !error && (data ?? []).length === 0,
    error?.message ?? `${data?.length} rows`
  );
}

// 7. Above the wall the workroom is real: the migrated primary contacts
// exist and every table reads without error.
{
  const { data, error } = await nadia.from("client_contacts").select("*");
  check("above wall: client contacts readable", !error && (data?.length ?? 0) >= 3, error?.message ?? `${data?.length} rows`);
  for (const table of WORKROOM_TABLES.filter((t) => t !== "client_contacts")) {
    const { error: e } = await nadia.from(table).select("*").limit(1);
    check(`above wall: ${table} readable`, !e, e?.message);
  }
}

// 8. Project commercials: pricing and invoice terms are readable ONLY by
// executives and the project's assigned manager. The below-wall production
// team and even above-wall non-owners get zero rows.
{
  const { data, error } = await rakib.from("project_commercials").select("*");
  check("below wall: project_commercials is empty", !error && (data ?? []).length === 0, error?.message);

  const { data: execRows, error: execErr } = await nadia.from("project_commercials").select("*");
  check(
    "executive: project commercials readable",
    !execErr && (execRows ?? []).length >= 1,
    execErr?.message ?? `${execRows?.length} rows`
  );

  const farhan = await signIn("farhan@vidiosa.com");
  const { data: ownerRows } = await farhan.from("project_commercials").select("*");
  check(
    "assigned manager: sees own projects' commercials",
    (ownerRows ?? []).length >= 1,
    `${ownerRows?.length} rows`
  );
  await farhan.auth.signOut();

  const sadia = await signIn("sadia@vidiosa.com");
  const { data: revRows, error: revErr } = await sadia.from("project_commercials").select("*");
  check(
    "above-wall non-owner: project_commercials is empty",
    !revErr && (revRows ?? []).length === 0,
    revErr?.message ?? `${revRows?.length} rows`
  );
  await sadia.auth.signOut();
}

await rakib.auth.signOut();
await nadia.auth.signOut();

const failed = results.filter((r) => !r.pass);
console.log(failed.length === 0 ? "\nWALL TEST: ALL PASS" : `\nWALL TEST: ${failed.length} FAILURE(S)`);
process.exit(failed.length === 0 ? 0 : 1);
