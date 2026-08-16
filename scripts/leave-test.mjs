// Acceptance for HR and leave, run the way the app runs: anon key plus each
// person's real JWT, RLS and triggers in force. Cleans up everything it made.
// Usage: node scripts/leave-test.mjs [password]
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
const ws = (await db.query("select id from workspaces limit 1")).rows[0].id;

// The reporting line the seed defines: Rakib reports to Tania, Tania to
// Farhan, and Shariful is the executive gate.
const rakib = await signIn("rakib@vidiosa.com");
const tania = await signIn("tania@vidiosa.com");
const shariful = await signIn("shariful@vidiosa.com");
const mim = await signIn("mim@vidiosa.com");

// Far enough out to never collide with seeded requests. Mon-Wed, 3 weekdays.
const START = "2026-11-16";
const END = "2026-11-18";
const cleanup = async () => {
  await db.query("delete from leave_requests where start_date = $1", [START]);
};
await cleanup();
const balanceBefore = (
  await db.query(
    "select used_days::int u, total_days::int t from leave_balances where profile_id=$1 and year=2026",
    [rakib.id]
  )
).rows[0];

// ---- filing --------------------------------------------------------------
const { data: req, error: fileError } = await rakib.client
  .from("leave_requests")
  .insert({
    workspace_id: ws,
    profile_id: rakib.id,
    type: "annual",
    start_date: START,
    end_date: END,
    days: 3,
    reason: "leave-test",
  })
  .select("id")
  .single();
check("a contributor can file leave", !fileError && Boolean(req), fileError?.message ?? "");

const { error: forgeError } = await rakib.client.from("leave_requests").insert({
  workspace_id: ws,
  profile_id: tania.id,
  type: "annual",
  start_date: START,
  end_date: END,
  days: 3,
});
check("nobody can file for someone else", Boolean(forgeError), forgeError?.code ?? "allowed");

// ---- the forbidden paths -------------------------------------------------
const selfApprove = await rakib.client
  .from("leave_requests")
  .update({ status: "approved" })
  .eq("id", req.id)
  .select("id");
check(
  "the requester cannot approve their own",
  Boolean(selfApprove.error) || (selfApprove.data ?? []).length === 0,
  selfApprove.error?.message?.slice(0, 40) ?? `${(selfApprove.data ?? []).length} rows`
);

const mimSees = await mim.client.from("leave_requests").select("id").eq("id", req.id);
check("an unrelated teammate cannot see it", (mimSees.data ?? []).length === 0, `${(mimSees.data ?? []).length} rows`);

const leadApprove = await tania.client
  .from("leave_requests")
  .update({ status: "approved" })
  .eq("id", req.id)
  .select("id");
check(
  "the lead cannot give final approval",
  Boolean(leadApprove.error) || (leadApprove.data ?? []).length === 0,
  leadApprove.error?.message?.slice(0, 44) ?? "allowed"
);

// ---- the honest path -----------------------------------------------------
const endorse = await tania.client
  .from("leave_requests")
  .update({ lead_approved_by: tania.id })
  .eq("id", req.id)
  .select("lead_approved_at");
check(
  "the lead endorses, and the timestamp is stamped",
  (endorse.data ?? []).length === 1 && Boolean(endorse.data[0].lead_approved_at),
  endorse.error?.message ?? ""
);

const decide = await shariful.client
  .from("leave_requests")
  .update({ status: "approved" })
  .eq("id", req.id)
  .select("decided_by, decided_at");
check(
  "the executive approves, decided_by stamped",
  (decide.data ?? []).length === 1 && decide.data[0].decided_by === shariful.id,
  decide.error?.message ?? ""
);

const balanceAfter = (
  await db.query(
    "select used_days::int u from leave_balances where profile_id=$1 and year=2026",
    [rakib.id]
  )
).rows[0];
check(
  "approval decrements the balance by the days",
  balanceAfter.u === balanceBefore.u + 3,
  `${balanceBefore.u} then ${balanceAfter.u}`
);

const { rows: notif } = await db.query(
  "select count(*)::int n from notifications where entity_id=$1 and profile_id=$2",
  [req.id, rakib.id]
);
check("the requester is notified of the decision", notif[0].n >= 1, `${notif[0].n} notifications`);

const calendar = await shariful.client
  .from("leave_requests")
  .select("id")
  .eq("status", "approved")
  .lte("start_date", END)
  .gte("end_date", START);
check(
  "the approved dates are readable for the calendar",
  (calendar.data ?? []).some((r) => r.id === req.id),
  `${(calendar.data ?? []).length} rows`
);

const cancelApproved = await rakib.client
  .from("leave_requests")
  .update({ status: "cancelled" })
  .eq("id", req.id)
  .select("id");
check(
  "an approved request cannot be cancelled",
  Boolean(cancelApproved.error) || (cancelApproved.data ?? []).length === 0,
  cancelApproved.error?.message?.slice(0, 44) ?? "allowed"
);

// ---- sick leave does not spend the allowance ------------------------------
const { data: sickReq } = await rakib.client
  .from("leave_requests")
  .insert({
    workspace_id: ws, profile_id: rakib.id, type: "sick",
    start_date: "2026-11-19", end_date: "2026-11-19", days: 1, reason: "leave-test",
  })
  .select("id")
  .single();
await tania.client.from("leave_requests").update({ lead_approved_by: tania.id }).eq("id", sickReq.id);
await shariful.client.from("leave_requests").update({ status: "approved" }).eq("id", sickReq.id);
const afterSick = (
  await db.query("select used_days::int u from leave_balances where profile_id=$1 and year=2026", [rakib.id])
).rows[0];
check(
  "approved sick leave leaves the balance alone",
  afterSick.u === balanceAfter.u,
  `${balanceAfter.u} then ${afterSick.u}`
);
await db.query("delete from notifications where entity_id=$1", [sickReq.id]);
await db.query("delete from leave_requests where id=$1", [sickReq.id]);

// ---- an admin manages someone else's leave --------------------------------

// Filing for a teammate is the executive's alone. A lead cannot, and neither
// can the person's peer.
const leadFiles = await tania.client.from("leave_requests").insert({
  workspace_id: ws, profile_id: rakib.id, type: "annual",
  start_date: "2026-11-23", end_date: "2026-11-24", days: 2, reason: "leave-test",
});
check("a lead still cannot file for someone", Boolean(leadFiles.error), leadFiles.error?.code ?? "allowed");

const usedBeforeAdmin = (
  await db.query("select used_days::int u from leave_balances where profile_id=$1 and year=2026", [rakib.id])
).rows[0].u;

// The admin records leave that was already agreed: approved on the spot.
const { data: recorded, error: recordError } = await shariful.client
  .from("leave_requests")
  .insert({
    workspace_id: ws, profile_id: rakib.id, type: "annual",
    start_date: "2026-11-23", end_date: "2026-11-24", days: 2, reason: "leave-test",
    status: "approved", decided_by: shariful.id, decided_at: new Date().toISOString(),
    filed_by: shariful.id,
  })
  .select("id, status")
  .single();
check(
  "an admin can record leave for a teammate",
  !recordError && recorded?.status === "approved",
  recordError?.message ?? ""
);

const usedAfterAdmin = (
  await db.query("select used_days::int u from leave_balances where profile_id=$1 and year=2026", [rakib.id])
).rows[0].u;
check(
  "recording it spends the allowance",
  usedAfterAdmin === usedBeforeAdmin + 2,
  `${usedBeforeAdmin} then ${usedAfterAdmin}`
);

const { rows: told } = await db.query(
  "select count(*)::int n from notifications where entity_id=$1 and profile_id=$2",
  [recorded.id, rakib.id]
);
check("the person is told it was recorded", told[0].n >= 1, `${told[0].n} notifications`);

const { rows: filedBy } = await db.query("select filed_by from leave_requests where id=$1", [recorded.id]);
check("the record says who filed it", filedBy[0].filed_by === shariful.id);

// The person it belongs to still cannot approve or cancel their own approved
// leave: filing on their behalf did not hand them the executive's powers.
const selfCancel = await rakib.client
  .from("leave_requests")
  .update({ status: "cancelled" })
  .eq("id", recorded.id)
  .select("id");
check(
  "they still cannot cancel it themselves",
  Boolean(selfCancel.error) || (selfCancel.data ?? []).length === 0,
  selfCancel.error?.message?.slice(0, 40) ?? `${(selfCancel.data ?? []).length} rows`
);

// Removing it: the admin cancels, and the days come back.
const removed = await shariful.client
  .from("leave_requests")
  .update({ status: "cancelled" })
  .eq("id", recorded.id)
  .select("status, decided_by");
check(
  "an admin can remove approved leave",
  (removed.data ?? []).length === 1 && removed.data[0].status === "cancelled",
  removed.error?.message ?? ""
);

const usedAfterRemove = (
  await db.query("select used_days::int u from leave_balances where profile_id=$1 and year=2026", [rakib.id])
).rows[0].u;
check(
  "removing it gives the days back",
  usedAfterRemove === usedBeforeAdmin,
  `${usedAfterAdmin} then ${usedAfterRemove}`
);

// Sick leave never touched the balance, so removing it must not credit days
// that were never spent.
const { data: sickRec } = await shariful.client
  .from("leave_requests")
  .insert({
    workspace_id: ws, profile_id: rakib.id, type: "sick",
    start_date: "2026-11-25", end_date: "2026-11-25", days: 1, reason: "leave-test",
    status: "approved", decided_by: shariful.id, filed_by: shariful.id,
  })
  .select("id")
  .single();
await shariful.client.from("leave_requests").update({ status: "cancelled" }).eq("id", sickRec.id);
const afterSickRemove = (
  await db.query("select used_days::int u from leave_balances where profile_id=$1 and year=2026", [rakib.id])
).rows[0].u;
check(
  "removing sick leave credits nothing",
  afterSickRemove === usedBeforeAdmin,
  `${usedAfterRemove} then ${afterSickRemove}`
);
await db.query("delete from notifications where entity_id in ($1,$2)", [recorded.id, sickRec.id]);
await db.query("delete from leave_requests where id in ($1,$2)", [recorded.id, sickRec.id]);

// Nobody may erase a leave record through the application.
const { data: victim } = await shariful.client
  .from("leave_requests")
  .insert({
    workspace_id: ws, profile_id: rakib.id, type: "unpaid",
    start_date: "2026-11-26", end_date: "2026-11-26", days: 1, reason: "leave-test",
    status: "approved", decided_by: shariful.id, filed_by: shariful.id,
  })
  .select("id")
  .single();
const hardDelete = await shariful.client
  .from("leave_requests")
  .delete()
  .eq("id", victim.id)
  .select("id");
check(
  "not even an admin can delete a record outright",
  (hardDelete.data ?? []).length === 0,
  `${(hardDelete.data ?? []).length} rows`
);
await db.query("delete from notifications where entity_id=$1", [victim.id]);
await db.query("delete from leave_requests where id=$1", [victim.id]);

// ---- allowances ----------------------------------------------------------
const allowance = await shariful.client
  .from("leave_balances")
  .update({ total_days: 22 })
  .eq("profile_id", rakib.id)
  .eq("year", 2026)
  .select("total_days");
check(
  "an executive can change an allowance",
  (allowance.data ?? []).length === 1 && Number(allowance.data[0].total_days) === 22,
  allowance.error?.message ?? ""
);
const sneak = await tania.client
  .from("leave_balances")
  .update({ total_days: 99 })
  .eq("profile_id", tania.id)
  .eq("year", 2026)
  .select("total_days");
check(
  "nobody below executive can",
  (sneak.data ?? []).length === 0,
  `${(sneak.data ?? []).length} rows`
);

// ---- cleanup -------------------------------------------------------------
// Rows first, balance second, and the order matters. Deleting an approved
// annual request refunds its days now, so restoring the balance before the
// delete would leave it short by exactly the amount this test approved, every
// single run.
await db.query("delete from notifications where entity_id=$1", [req.id]);
await cleanup();
await db.query("update leave_balances set total_days=20, used_days=$2 where profile_id=$1 and year=2026", [rakib.id, balanceBefore.u]);
const { rows: left } = await db.query("select count(*)::int n from leave_requests where start_date=$1", [START]);
await db.end();
check("nothing left behind", left[0].n === 0, `${left[0].n} rows`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nLEAVE TEST: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
