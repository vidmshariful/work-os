// Acceptance for notifications. Three rules that are easy to regress and
// expensive when they do.
//
//   1. A reminder is sent once, not every day. The daily job used to re-notify
//      every overdue to-do, which produced 78 of the 121 notifications in the
//      system from two to-dos and drowned everything else.
//   2. Every entity type in use resolves to a link. A notification you cannot
//      click is a dead end.
//   3. Nothing points at a record that has been deleted.
//
// Usage: node scripts/notification-test.mjs
import { connect } from "./db.mjs";
import { notificationHref } from "../lib/notifications.ts";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const db = await connect();
const n = async (sql) => Number((await db.query(sql)).rows[0].n);

// ---- 1. the daily job is quiet once it has spoken ---------------------------
const before = await n("select count(*) n from notifications where type='todo_due'");
await db.query("select notify_due_personal_todos()");
const once = await n("select count(*) n from notifications where type='todo_due'");
await db.query("select notify_due_personal_todos()");
const twice = await n("select count(*) n from notifications where type='todo_due'");
check("running the reminder job twice adds nothing", once === before && twice === before, `${before}, ${once}, ${twice}`);

// A to-do whose due date moves is a new promise, and earns one new reminder.
await db.query("begin");
const { rows: todo } = await db.query(
  "select id, due_date, reminded_on from personal_todos where due_date is not null and is_done=false limit 1"
);
if (todo.length) {
  // Reminded about an older date, then moved to a date now overdue. The two
  // differing is what a reschedule looks like to the job.
  await db.query("update personal_todos set due_date = current_date - 1, reminded_on = current_date - 9 where id=$1", [todo[0].id]);
  const a = await n("select count(*) n from notifications where type='todo_due'");
  await db.query("select notify_due_personal_todos()");
  const b = await n("select count(*) n from notifications where type='todo_due'");
  await db.query("select notify_due_personal_todos()");
  const c = await n("select count(*) n from notifications where type='todo_due'");
  check("rescheduling earns exactly one more reminder", b === a + 1 && c === b, `${a}, ${b}, ${c}`);
} else {
  check("rescheduling earns exactly one more reminder", true, "no dated to-do to test with");
}
await db.query("rollback");

// ---- 2. every entity type in use can be opened ------------------------------
const { rows: kinds } = await db.query(
  "select distinct entity_type from notifications where entity_type is not null"
);
const dead = kinds
  .map((k) => k.entity_type)
  .filter((t) => notificationHref("vidiosa", t, "00000000-0000-0000-0000-000000000000") === null);
check("every entity type in use resolves to a link", dead.length === 0, dead.join(", ") || `${kinds.length} types`);

// ---- 3. nothing points at something deleted ---------------------------------
const dangling = await n(`select count(*) n from notifications x
  where (x.entity_type='task' and not exists (select 1 from tasks t where t.id=x.entity_id))
     or (x.entity_type='project' and not exists (select 1 from projects p where p.id=x.entity_id))`);
check("no notification points at a deleted record", dangling === 0, `${dangling} dangling`);

await db.end();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nNOTIFICATION TEST: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
