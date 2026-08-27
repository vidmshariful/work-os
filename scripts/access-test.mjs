// Acceptance for who can read and write what, run the way the app runs: anon
// key plus each person's real JWT, RLS in force. Three parts, because a
// scoping rule can fail in three different directions.
//
//   1. Leaks       a row readable whose subject is not
//   2. Regressions a row NOT readable that should be
//   3. Privilege   a write allowed that should not be
//
// This exists because an audit found three leaks at once: the activity feed,
// intake forms and custom field definitions all checked workspace membership
// and stopped there, so they returned rows about projects and departments the
// reader could not open. Part 2 matters as much as part 1: the obvious way to
// fix a leak is to over-narrow, and nobody notices until someone's feed is
// empty.
//
// Usage: node scripts/access-test.mjs [password]
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
const PEOPLE = ["shariful@vidiosa.com", "nadia@vidiosa.com", "rakib@vidiosa.com", "sadia@vidiosa.com"];

// Tables that hang off a project, a client or a department. A row in one of
// these is only ever as visible as the thing it belongs to.
const BY_PROJECT = [
  "deliverables", "project_assignees", "project_comments", "project_commercials",
  "project_field_values", "project_intakes", "project_phases", "tasks",
];
const BY_CLIENT = [
  "client_activity", "client_contacts", "client_documents", "client_notes",
  "client_payments", "client_todos",
];
const BY_DEPT = ["department_members", "project_fields", "project_folders", "project_lists"];

// ---- 1. nothing readable whose subject is invisible -------------------------
for (const email of PEOPLE) {
  const { client } = await signIn(email);
  const who = email.split("@")[0];
  const idsOf = async (t) => new Set(((await client.from(t).select("id")).data ?? []).map((r) => r.id));
  const projects = await idsOf("projects");
  const clients = await idsOf("v_clients");
  const departments = await idsOf("departments");

  const scoped = async (table, col, allowed) => {
    const { data, error } = await client.from(table).select(col).limit(2000);
    // No read access at all is not a leak, it is the strictest possible answer.
    if (error) return true;
    const stray = (data ?? []).filter((r) => r[col] && !allowed.has(r[col]));
    if (stray.length) {
      check(`${who} cannot read ${table} beyond what they can see`, false, `${stray.length} of ${data.length} stray`);
      return false;
    }
    return true;
  };

  let clean = true;
  for (const t of BY_PROJECT) clean = (await scoped(t, "project_id", projects)) && clean;
  for (const t of BY_CLIENT) clean = (await scoped(t, "client_id", clients)) && clean;
  for (const t of BY_DEPT) clean = (await scoped(t, "department_id", departments)) && clean;

  // The activity feed carries a bare entity_id with its type beside it.
  const feed = (await client.from("activity_log").select("entity_type, entity_id")).data ?? [];
  const strayFeed = feed.filter((f) => f.entity_type === "project" && f.entity_id && !projects.has(f.entity_id));
  if (strayFeed.length) {
    clean = false;
    check(`${who}'s feed only mentions projects they can open`, false, `${strayFeed.length} of ${feed.length} stray`);
  }
  if (clean) check(`${who} reads nothing beyond what they can see`, true, `${projects.size} projects, ${departments.size} departments`);
}

// ---- 2. and nothing missing that should be there ----------------------------
for (const email of PEOPLE) {
  const { client } = await signIn(email);
  const who = email.split("@")[0];
  const projects = ((await client.from("projects").select("id")).data ?? []).map((r) => r.id);
  const departments = ((await client.from("departments").select("id")).data ?? []).map((r) => r.id);

  const feed = (await client.from("activity_log").select("entity_type")).data ?? [];
  const gotFeed = feed.filter((f) => f.entity_type === "project").length;
  const wantFeed = Number(
    (await db.query(
      "select count(*)::int n from activity_log where entity_type='project' and entity_id = any($1::uuid[])",
      [projects]
    )).rows[0].n
  );
  check(`${who} keeps every feed row for a project they can open`, gotFeed === wantFeed, `${gotFeed} of ${wantFeed}`);

  // Both halves, because comparing only against department_id = any(visible)
  // excludes the workspace-wide fields the same way a broken policy would,
  // and a test that agrees with the bug catches nothing. 0047 narrowed this
  // policy to app_can_see_department(department_id), which answers false for
  // null, and three fields went invisible to everybody for four commits
  // without a single check going red.
  const fieldRows = (await client.from("project_fields").select("id, department_id")).data ?? [];
  const wantScoped = Number(
    (await db.query("select count(*)::int n from project_fields where department_id = any($1::uuid[])", [departments])).rows[0].n
  );
  const wantWide = Number(
    (await db.query("select count(*)::int n from project_fields where department_id is null")).rows[0].n
  );
  const gotWide = fieldRows.filter((f) => !f.department_id).length;
  check(
    `${who} keeps every field for a department they can open`,
    fieldRows.length - gotWide === wantScoped,
    `${fieldRows.length - gotWide} of ${wantScoped}`
  );
  check(
    `${who} still sees the fields scoped to no space`,
    gotWide === wantWide,
    `${gotWide} of ${wantWide}`
  );
}

// ---- 3. a contributor cannot write what a manager can -----------------------
const ws = (await db.query("select id from workspaces limit 1")).rows[0].id;
const project = (await db.query("select id from projects limit 1")).rows[0].id;
const department = (await db.query("select id from departments limit 1")).rows[0].id;
const other = (await db.query("select id from profiles where email='nadia@vidiosa.com'")).rows[0].id;
const { client: rakib, id: rakibId } = await signIn("rakib@vidiosa.com");

const denied = async (name, thunk) => {
  const { data, error } = await thunk();
  const blocked = Boolean(error) || (Array.isArray(data) && data.length === 0) || data === null;
  check(`a contributor cannot ${name}`, blocked, blocked ? (error?.code ?? "no rows") : "ALLOWED");
};

await denied("delete a project", () => rakib.from("projects").delete().eq("id", project).select("id"));
await denied("rename a department", () => rakib.from("departments").update({ name: "x" }).eq("id", department).select("id"));
await denied("create a department", () => rakib.from("departments").insert({ workspace_id: ws, name: "x", slug: "x-probe" }).select("id"));
await denied("promote themselves", () => rakib.from("memberships").update({ archetype: "executive" }).eq("profile_id", rakibId).select("profile_id"));
await denied("move someone's reporting line", () => rakib.from("memberships").update({ reports_to: rakibId }).eq("profile_id", other).select("profile_id"));
await denied("set their own allowance", () => rakib.from("leave_balances").update({ total_days: 99 }).eq("profile_id", rakibId).select("total_days"));
await denied("read the clients table directly", () => rakib.from("clients").select("id").limit(1));
await denied("read project commercials", () => rakib.from("project_commercials").select("project_id").limit(1));
await denied("post an announcement", () => rakib.from("announcements").insert({ workspace_id: ws, title: "x", body: "x", created_by: rakibId }).select("id"));
await denied("edit someone else's profile", () => rakib.from("profiles").update({ full_name: "x" }).eq("id", other).select("id"));
await denied("read another person's to-dos", () => rakib.from("personal_todos").select("id").neq("profile_id", rakibId).limit(1));
await denied("read messages they are not part of", () => rakib.from("direct_messages").select("id").neq("sender_id", rakibId).neq("recipient_id", rakibId).limit(1));
await denied("delete a table they do not own", () => rakib.from("db_tables").delete().neq("owner_id", rakibId).select("id"));
await denied("read someone else's secret reveals", () => rakib.from("secret_reveals").select("id").neq("actor_id", rakibId).limit(1));

// ---- 4. no notification points at something that is gone --------------------
const dangling = Number(
  (await db.query(`select count(*)::int n from notifications x
    where (x.entity_type='task' and not exists (select 1 from tasks t where t.id=x.entity_id))
       or (x.entity_type='project' and not exists (select 1 from projects p where p.id=x.entity_id))`)).rows[0].n
);
check("no notification points at a deleted record", dangling === 0, `${dangling} dangling`);

await db.end();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nACCESS TEST: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
