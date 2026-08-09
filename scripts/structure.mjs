// Builds the Vidiosa space structure: folders and lists.
//
// SHAPED FOR AN ANIMATION STUDIO. Production is the studio floor, so it
// comes first in the sidebar and its folders are the three parts of an
// animation pipeline: pre-production, animation, post-production. The three
// support spaces follow it.
//
// The stages themselves are NOT lists. Active Prod. Stage already carries
// brief, script, concept and design, animation, edit, review, delivered on
// every project, so a list per stage would be the same fact recorded twice
// and would mean dragging a project from list to list as it moves. Lists
// stay what they are here: streams of work. The folder says which part of
// the pipeline the stream belongs to, the field says where one project has
// got to, and the board groups by it.
//
// List names are left exactly as the studio types them. Only the folders,
// which this file introduced, are named for the pipeline.
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

// Stands for a folder this run intends to create. Only ever seen in a dry
// run, where nothing has an id yet.
const PLANNED = Symbol("planned folder");

// name, colour, then the folders and the loose lists. A list marked archived
// is created already archived: it is history that should stay reachable
// without competing for attention.
// The icon each space wears in the sidebar and on the index. A lucide name
// from SPACE_ICONS, not an emoji, so it renders as a real icon.
const ICONS = {
  marketing: "megaphone",
  sales: "handshake",
  production: "clapperboard",
  administration: "building-2",
};

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
      // Everything before a frame is animated. Scripting and RND were loose
      // at the space root, which put the earliest work in the least
      // prominent place. Concept and design is new: stage 3 of the studio's
      // own pipeline had nowhere to queue.
      { name: "Pre-production", color: "violet", lists: ["Scripting", "Concept and design", "RND"] },
      // The floor. Custom is bespoke client work, Pre-Made is template work,
      // and both keep the names the studio already uses for them.
      { name: "Animation", color: "amber", lists: ["Custom Production", "Pre-Made Production", "Studio Pipeline"] },
      { name: "Post-production", color: "teal", lists: ["Edit pipeline", "Internal edits"] },
    ],
    lists: [],
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

// Folders renamed in place. Without this the plan would create the new name
// and leave the old folder behind, empty.
const FOLDER_RENAME = {
  production: {
    "Animation Studios": "Animation",
    "Video Editing": "Post-production",
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

    // 2. Folders. Renames first, so a folder that is only changing its name
    //    keeps its lists and its id instead of being replaced by an empty
    //    one beside it.
    // new name -> the id it already has, so the plan below does not think it
    // has to create one. Without this the dry run promises a folder that the
    // apply would never create, which makes it useless for reading before
    // writing.
    const renamed = {};
    for (const [from, to] of Object.entries(FOLDER_RENAME[space.slug] ?? {})) {
      const { rows } = await c.query(
        `select id from project_folders where department_id=$1 and name=$2`,
        [space.id, from]
      );
      if (rows.length === 0) continue;
      const { rows: taken } = await c.query(
        `select id from project_folders where department_id=$1 and name=$2`,
        [space.id, to]
      );
      if (taken.length > 0) continue;
      const { rows: held } = await c.query(
        `select count(*)::int n from project_lists where folder_id=$1`,
        [rows[0].id]
      );
      log.push(`   folder  ${from} -> ${to}  (${held[0].n} lists stay put)`);
      changes++;
      renamed[to] = rows[0].id;
      if (APPLY) {
        await c.query(`update project_folders set name=$1 where id=$2`, [to, rows[0].id]);
      }
    }

    const folderIds = {};
    for (let i = 0; i < plan.folders.length; i++) {
      const f = plan.folders[i];
      // A folder that already exists still has to sit where the plan puts
      // it. Renaming one left it at the position its old name held, which
      // is how Production first came back reading post, pre, animation.
      const settle = async (id, current) => {
        folderIds[f.name] = id;
        if (current === i) return;
        log.push(`   order   ${f.name} to position ${i}`);
        changes++;
        if (APPLY) {
          await c.query(`update project_folders set sort_order=$1 where id=$2`, [i, id]);
        }
      };

      if (renamed[f.name]) {
        const { rows: r0 } = await c.query(
          `select sort_order from project_folders where id=$1`,
          [renamed[f.name]]
        );
        await settle(renamed[f.name], r0[0]?.sort_order);
        continue;
      }
      const { rows } = await c.query(
        `select id, sort_order from project_folders where department_id=$1 and name=$2`,
        [space.id, f.name]
      );
      if (rows.length > 0) {
        await settle(rows[0].id, rows[0].sort_order);
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
        // Not written yet, but the lists below still belong in it, and a dry
        // run has to say so.
        folderIds[f.name] = PLANNED;
      }
    }

    // 3. Lists, into their folder or loose, then the archived ones.
    const place = async (name, folderName, order, archived) => {
      const { rows } = await c.query(
        `select id, folder_id, archived_at, sort_order from project_lists
         where department_id=$1 and name=$2`,
        [space.id, name]
      );
      const folderId = folderName ? folderIds[folderName] : null;
      if (rows.length > 0) {
        const row = rows[0];
        const needsFolder =
          folderId === PLANNED
            ? true
            : (row.folder_id ?? null) !== (folderId ?? null);
        const needsArchive = Boolean(row.archived_at) !== archived;
        // Position is part of the plan too. Without this a list already in
        // the right folder kept whatever order it had, which is how an empty
        // Studio Pipeline ended up above the nine live Custom Production
        // projects.
        const needsOrder = row.sort_order !== order;
        if (!needsFolder && !needsArchive && !needsOrder) return;
        log.push(
          `   place   ${name}${folderName ? `  into ${folderName}` : "  at space root"}` +
            `${needsOrder && !needsFolder ? `  position ${order}` : ""}` +
            `${archived ? "  [archived]" : ""}`
        );
        changes++;
        if (APPLY) {
          await c.query(
            `update project_lists
               set folder_id=$1, sort_order=$2, archived_at=$3
             where id=$4`,
            [folderId === PLANNED ? null : folderId, order, archived ? new Date().toISOString() : null, row.id]
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
          [space.id, folderId === PLANNED ? null : folderId, name, order, archived ? new Date().toISOString() : null]
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

  // 4. Give each space its icon, if it has none. Never overwrites a choice
  //    someone made in the settings panel.
  for (const [slug, name] of Object.entries(ICONS)) {
    const s2 = spaces.find((x) => x.slug === slug);
    if (!s2) continue;
    const { rows } = await c.query("select icon from departments where id=$1", [s2.id]);
    if (rows[0].icon) continue;
    log.push(`\n   icon    ${s2.name} -> ${name}`);
    changes++;
    if (APPLY) await c.query("update departments set icon=$1 where id=$2", [name, s2.id]);
  }

  // 5. Drop the space name prefixes if any survive, and re-order the spaces.
  // A studio reads its own floor first. The three support spaces follow.
  const ORDER = ["production", "marketing", "sales", "administration"];
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
