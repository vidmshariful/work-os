// The Vidiosa project fields, taken from the ClickUp task view.
//
// Idempotent and transactional: run it twice and nothing duplicates. It
// never deletes a field that holds values.
//
// Usage: node scripts/fields.mjs [--apply]
//   Without --apply it prints the plan and changes nothing.
import { connect } from "./db.mjs";

const APPLY = process.argv.includes("--apply");

// department slug or null for every space.
const PLAN = [
  {
    name: "Active Prod. Stage",
    kind: "select",
    space: "production",
    options: [
      ["1. Brief", "gray"],
      ["2. Script", "blue"],
      ["3. Concept Design", "amber"],
      ["4. Animation", "violet"],
      ["5. Edit", "teal"],
      ["6. Review", "rose"],
      ["7. Delivered", "green"],
    ],
  },
  { name: "Script", kind: "long_text", space: "production", options: [] },
  { name: "Concept", kind: "url", space: "production", options: [] },
  { name: "Design Elements", kind: "url", space: "production", options: [] },
  {
    name: "Project Category",
    kind: "select",
    space: null,
    options: [
      ["GHL Template", "violet"],
      ["Custom", "blue"],
      ["Internal", "gray"],
      ["Marketing", "rose"],
    ],
  },
  {
    name: "Property",
    kind: "select",
    space: null,
    options: [
      ["GHL Video", "green"],
      ["growX", "teal"],
      ["socialX", "violet"],
      ["Vidiosa", "blue"],
    ],
  },
  {
    name: "Stage Status",
    kind: "select",
    space: null,
    options: [
      ["Not started", "gray"],
      ["Running", "green"],
      ["Blocked", "rose"],
      ["Waiting on client", "amber"],
    ],
  },
];

// A value becomes a stable key so relabelling a choice later does not orphan
// every project already using it.
const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const c = await connect();
const log = [];
let changes = 0;

try {
  if (APPLY) await c.query("begin");

  const { rows: wsRows } = await c.query("select id from workspaces limit 1");
  const ws = wsRows[0].id;
  const { rows: depts } = await c.query("select id, slug from departments");
  const bySlug = Object.fromEntries(depts.map((d) => [d.slug, d.id]));

  for (let i = 0; i < PLAN.length; i++) {
    const f = PLAN[i];
    const deptId = f.space ? bySlug[f.space] ?? null : null;
    if (f.space && !deptId) {
      log.push(`   SKIP    ${f.name}  (space "${f.space}" not found)`);
      continue;
    }
    const options = f.options.map(([label, color]) => ({
      value: slugify(label),
      label,
      color,
    }));

    const { rows: existing } = await c.query(
      "select id, kind from project_fields where workspace_id=$1 and name=$2",
      [ws, f.name]
    );
    if (existing.length > 0) {
      // Never rewrite the kind: every stored value is in the old shape and
      // reinterpreting them silently would be worse than leaving it alone.
      if (existing[0].kind !== f.kind) {
        log.push(`   SKIP    ${f.name}  (exists as ${existing[0].kind}, plan says ${f.kind})`);
        continue;
      }
      log.push(`   update  ${f.name}  (${f.kind}${f.space ? `, ${f.space} only` : ""})`);
      changes++;
      if (APPLY) {
        await c.query(
          "update project_fields set options=$1, department_id=$2, sort_order=$3 where id=$4",
          [JSON.stringify(options), deptId, i, existing[0].id]
        );
      }
      continue;
    }

    log.push(
      `   field   ${f.name}  (${f.kind}${f.space ? `, ${f.space} only` : ", every space"}${
        options.length ? `, ${options.length} choices` : ""
      })`
    );
    changes++;
    if (APPLY) {
      await c.query(
        `insert into project_fields (workspace_id, department_id, name, kind, options, sort_order)
         values ($1,$2,$3,$4,$5,$6)`,
        [ws, deptId, f.name, f.kind, JSON.stringify(options), i]
      );
    }
  }

  if (APPLY) await c.query("commit");
} catch (e) {
  if (APPLY) await c.query("rollback");
  console.error("FAILED, rolled back:", e.message);
  await c.end();
  process.exit(1);
}

console.log(log.join("\n"));
console.log(
  `\n${changes} change${changes === 1 ? "" : "s"} ${
    APPLY ? "applied" : "planned. Re-run with --apply to write them."
  }`
);
await c.end();
