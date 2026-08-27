// Acceptance for what a project row now carries: priority, extra assignees,
// and attachment counts. Run the way the app reads, anon key plus a real JWT.
// Everything it writes is undone at the end.
// Usage: node scripts/row-meta-test.mjs [password]
import { createClient } from "@supabase/supabase-js";
import { loadEnv, connect } from "./db.mjs";

const env = loadEnv();
const PASSWORD = process.argv[2] || process.env.SEED_PASSWORD || env.SEED_PASSWORD;
if (!PASSWORD) {
  console.error("Set SEED_PASSWORD in .env.local, or pass it as an argument.");
  process.exit(1);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function signIn(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}`);
  return { client, id: data.user.id };
}

const db = await connect();
// A project in Production, which Rakib can see, and one in Marketing, which
// he cannot. That pair is what makes the visibility checks meaningful.
const mine = (
  await db.query(
    `select p.id, p.code from projects p join departments d on d.id=p.department_id
      where d.slug='production' order by p.code limit 1`
  )
).rows[0];
const hidden = (
  await db.query(
    `select p.id, p.code from projects p join departments d on d.id=p.department_id
      where d.slug='marketing' order by p.code limit 1`
  )
).rows[0];
await db.query("delete from project_assignees where project_id = any($1)", [[mine.id, hidden.id]]);

const nadia = await signIn("nadia@vidiosa.com");
const rakib = await signIn("rakib@vidiosa.com");

// ---- priority ------------------------------------------------------------
const { error: prioError } = await nadia.client
  .from("projects")
  .update({ priority: 2 })
  .eq("id", mine.id);
check("a manager can set priority", !prioError, prioError?.message ?? "");

const { error: badPrio } = await nadia.client
  .from("projects")
  .update({ priority: 7 })
  .eq("id", mine.id);
check("priority outside the scale is refused", Boolean(badPrio), badPrio?.code ?? "it was allowed");

// ---- extra assignees -----------------------------------------------------
const { error: addError } = await nadia.client
  .from("project_assignees")
  .insert({ project_id: mine.id, profile_id: rakib.id });
check("a manager can add an assignee", !addError, addError?.message ?? "");

const { error: strangerError } = await nadia.client.from("project_assignees").insert({
  project_id: mine.id,
  profile_id: "00000000-0000-0000-0000-000000000000",
});
check(
  "cannot assign someone outside the workspace",
  Boolean(strangerError),
  strangerError?.code ?? "it was allowed"
);

const seen = await rakib.client
  .from("project_assignees")
  .select("profile_id")
  .eq("project_id", mine.id);
check("a reader of the project sees its assignees", (seen.data ?? []).length === 1, `${(seen.data ?? []).length} rows`);

// Rakib is a contributor and not the owner, so assigning is not his to do.
const { data: rakibAdd } = await rakib.client
  .from("project_assignees")
  .insert({ project_id: mine.id, profile_id: nadia.id })
  .select("project_id");
check(
  "a contributor cannot assign on someone else's project",
  !rakibAdd || rakibAdd.length === 0,
  `${(rakibAdd ?? []).length} rows`
);

// Since 0050 an assignment is a grant: being put on a project is what lets
// you open it, whichever space you work in. This used to assert the opposite,
// which was the rule at the time.
await db.query("insert into project_assignees (project_id, profile_id) values ($1,$2)", [
  hidden.id,
  rakib.id,
]);
const hiddenSeen = await rakib.client
  .from("projects")
  .select("code")
  .eq("id", hidden.id);
check(
  "being assigned opens a project he could not otherwise see",
  (hiddenSeen.data ?? []).length === 1,
  `${(hiddenSeen.data ?? []).length} rows for ${hidden.code}`
);

// The grant reaches exactly one person. Somebody else being on a project is
// not a reason for him to see it, which is the half that must not slip.
await db.query("delete from project_assignees where project_id=$1 and profile_id=$2", [
  hidden.id,
  rakib.id,
]);
await db.query("insert into project_assignees (project_id, profile_id) values ($1,$2)", [
  hidden.id,
  nadia.id,
]);
const stillHidden = await rakib.client.from("projects").select("code").eq("id", hidden.id);
const rowsHidden = await rakib.client
  .from("project_assignees")
  .select("project_id")
  .eq("project_id", hidden.id);
check(
  "somebody else's assignment does not open it for him",
  (stillHidden.data ?? []).length === 0 && (rowsHidden.data ?? []).length === 0,
  `${(stillHidden.data ?? []).length} projects, ${(rowsHidden.data ?? []).length} assignee rows`
);
await db.query("insert into project_assignees (project_id, profile_id) values ($1,$2) on conflict do nothing", [
  hidden.id,
  rakib.id,
]);

// ---- attachment counts ---------------------------------------------------
const { data: counts, error: countError } = await nadia.client.rpc("project_file_counts", {
  ids: [mine.id, hidden.id],
});
check(
  "an executive gets a count for both projects",
  !countError && (counts ?? []).length === 2,
  countError?.message ?? `${(counts ?? []).length} rows`
);

const { data: rakibCounts } = await rakib.client.rpc("project_file_counts", {
  ids: [mine.id, hidden.id],
});
const ids = (rakibCounts ?? []).map((r) => r.project_id);
check(
  "the count function answers only for projects the caller can open",
  ids.length === 1 && ids[0] === mine.id,
  `${ids.length} rows`
);

// ---- cleanup -------------------------------------------------------------
await db.query("delete from project_assignees where project_id = any($1)", [[mine.id, hidden.id]]);
await db.query("update projects set priority = 0 where id = $1", [mine.id]);
const { rows: left } = await db.query(
  "select (select count(*)::int from project_assignees) a, (select count(*)::int from projects where priority <> 0) p"
);
await db.end();
check("nothing left behind", left[0].a === 0 && left[0].p === 0, `${left[0].a} assignees, ${left[0].p} prioritised`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nROW META TEST: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
