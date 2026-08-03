// Builds the Vidiosa space structure: folders and lists, matching the
// ClickUp workspace with its workarounds removed.
//
// What is deliberately NOT copied, and why:
//   the "1." "2." "3." "4." name prefixes  ->  sort_order does that job
//   Archive (Marketing) / Archived (Sales) / Archive (Studio) / Active
//                                          ->  lists carry archived_at
//   Tanvir / Dillon / Mostafa / Shariful Space
//                                          ->  group by assignee
//   Master View, All Tasks, Task Master    ->  saved views, not lists
//   the ten empty ClickUp "List" defaults  ->  nothing, they hold no work
//
// Idempotent: run it twice and nothing duplicates. It never deletes a list
// that holds projects, and it never deletes a project.
//
// Usage: node scripts/structure.mjs [--apply]
//   Without --apply it prints the plan and changes nothing.
import { connect } from "./db.mjs";

const APPLY = process.argv.includes("--apply");

// name, colour, then the folders and the loose lists. A list marked archived
// is created already archived: it is history that should stay reachable
// without competing for attention.
const PLAN = {
  marketing: {
    folders: [
      { name: "Content Engine", color: "violet", lists: ["Content Pillar", "Content Engine", "Marketing and Sales Engine", "LinkedIn"] },
      { name: "Campaigns", color: "rose", lists: ["Campaigns Manager", "Marketing plan"] },
      { name: "GHL Video 2.0", color: "blue", lists: ["Launch", "Website fix"] },
    ],
    lists: ["Marketing inbox", "Meeting notes"],
    archived: ["Black Friday 2025", "Cold Lead Survey", "HighLevel Mgr.", "All Channels"],
  },
  sales: {
    folders: [
      { name: "Pipeline", color: "green", lists: ["Closed clients", "Dream 100"] },
    ],
    lists: [],
    archived: ["Deals, coupons, offers", "Leads, close scheduled", "Prospects, need scheduling", "People master"],
  },
  production: {
    folders: [
      { name: "Video Editing", color: "teal", lists: ["Edit pipeline", "Internal edits"] },
      { name: "Animation Studios", color: "amber", lists: ["Studio Pipeline", "Custom Production", "Pre-Made Production"] },
    ],
    lists: ["RND", "Scripting"],
    archived: ["Template Order List", "GHLV New Template Order List", "Vidiosa Studio", "Planner"],
  },
  administration: {
    folders: [
      { name: "People", color: "blue", lists: ["Hiring", "Recognition awards", "Training sessions", "Learning ideas"] },
      { name: "growX", color: "green", lists: ["growX Content Calendar", "growX Tasks", "growX Launch"] },
      { name: "socialX", color: "violet", lists: ["socialX Tasks", "socialX Content Engine"] },
    ],
    lists: ["Company backlog", "Writing Tasks", "Ideas inbox"],
    archived: [],
  },
};

// Seed lists that the plan replaces. Renamed rather than deleted when they
// hold projects, so no work is orphaned.
const RENAME = {
  production: { Custom: "Custom Production", Premade: "Pre-Made Production", "Video Editing": "Edit pipeline" },
  marketing: { Campaigns: "Campaigns Manager", Content: "Content Pillar" },
  sales: { Pipeline: "Closed clients", Proposals: "Dream 100" },
  administration: { Operations: "Company backlog", Finance: "Writing Tasks" },
};

const c = await connect();
const log = [];
let changes = 0;

const { rows: spaces } = await c.query(
  `select id, slug, name from departments order by sort_order`
);

try {
  if (APPLY) await c.query("begin");

  for (const space of spaces) {
    const plan = PLAN[space.slug];
    if (!plan) continue;
    log.push(`\n${space.name}`);

    // 1. Rename the seed lists first, so their projects follow the new names
    //    instead of ending up beside a duplicate.
    for (const [from, to] of Object.entries(RENAME[space.slug] ?? {})) {
      const { rows } = await c.query(
        `select id from project_lists where department_id=$1 and name=$2 and archived_at is null`,
        [space.id, from]
      );
      if (rows.length === 0) continue;
      const { rows: cnt } = await c.query(
        `select count(*)::int n from projects where list_id=$1`,
        [rows[0].id]
      );
      log.push(`   rename  ${from} -> ${to}  (${cnt[0].n} projects follow)`);
      changes++;
      if (APPLY) {
        await c.query(`update project_lists set name=$1 where id=$2`, [to, rows[0].id]);
      }
    }

    // 2. Folders, in order.
    const folderIds = {};
    for (let i = 0; i < plan.folders.length; i++) {
      const f = plan.folders[i];
      const { rows } = await c.query(
        `select id from project_folders where department_id=$1 and name=$2`,
        [space.id, f.name]
      );
      if (rows.length > 0) {
        folderIds[f.name] = rows[0].id;
        continue;
      }
      log.push(`   folder  ${f.name}`);
      changes++;
      if (APPLY) {
        const { rows: made } = await c.query(
          `insert into project_folders (department_id, name, color, sort_order)
           values ($1,$2,$3,$4) returning id`,
          [space.id, f.name, f.color, i]
        );
        folderIds[f.name] = made[0].id;
      } else {
        folderIds[f.name] = null;
      }
    }

    // 3. Lists, into their folder or loose, then the archived ones.
    const place = async (name, folderName, order, archived) => {
      const { rows } = await c.query(
        `select id, folder_id, archived_at from project_lists
         where department_id=$1 and name=$2`,
        [space.id, name]
      );
      const folderId = folderName ? folderIds[folderName] : null;
      if (rows.length > 0) {
        const row = rows[0];
        const needsFolder = (row.folder_id ?? null) !== (folderId ?? null);
        const needsArchive = Boolean(row.archived_at) !== archived;
        if (!needsFolder && !needsArchive) return;
        log.push(
          `   place   ${name}${folderName ? `  into ${folderName}` : "  at space root"}${archived ? "  [archived]" : ""}`
        );
        changes++;
        if (APPLY) {
          await c.query(
            `update project_lists
               set folder_id=$1, sort_order=$2, archived_at=$3
             where id=$4`,
            [folderId, order, archived ? new Date().toISOString() : null, row.id]
          );
        }
        return;
      }
      log.push(
        `   list    ${name}${folderName ? `  into ${folderName}` : ""}${archived ? "  [archived]" : ""}`
      );
      changes++;
      if (APPLY) {
        await c.query(
          `insert into project_lists (department_id, folder_id, name, sort_order, archived_at)
           values ($1,$2,$3,$4,$5)`,
          [space.id, folderId, name, order, archived ? new Date().toISOString() : null]
        );
      }
    };

    let order = 0;
    for (const f of plan.folders) {
      for (const name of f.lists) await place(name, f.name, order++, false);
    }
    for (const name of plan.lists) await place(name, null, order++, false);
    for (const name of plan.archived) await place(name, null, order++, true);
  }

  // 4. Drop the space name prefixes if any survive, and re-order the spaces.
  const ORDER = ["marketing", "sales", "production", "administration"];
  for (let i = 0; i < ORDER.length; i++) {
    const s = spaces.find((x) => x.slug === ORDER[i]);
    if (!s) continue;
    const clean = s.name.replace(/^\d+\.\s*/, "");
    const { rows } = await c.query(`select sort_order from departments where id=$1`, [s.id]);
    if (rows[0].sort_order === i && clean === s.name) continue;
    log.push(`\n   space   ${s.name} -> ${clean}, position ${i}`);
    changes++;
    if (APPLY) {
      await c.query(`update departments set name=$1, sort_order=$2 where id=$3`, [clean, i, s.id]);
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
  `\n${changes} change${changes === 1 ? "" : "s"} ${APPLY ? "applied" : "planned. Re-run with --apply to write them."}`
);
await c.end();
