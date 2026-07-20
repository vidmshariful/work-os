// One-time: reorganize the work area into the four spaces (Production,
// Marketing, Sales, Administration) and add ClickUp-style demo data — lists,
// projects, an onboarding series with sub-projects, and tasks. Idempotent:
// safe to run more than once. Usage: node scripts/demo-work.mjs
import { connect } from "./db.mjs";

const db = await connect();
const ws = (await db.query("select id from workspaces where slug='vidiosa'")).rows[0].id;
const byRole = {};
for (const r of (await db.query("select profile_id, role from memberships where workspace_id=$1 and is_active", [ws])).rows) {
  byRole[r.role] = r.profile_id;
}
const farhan = byRole.creative_lead, tania = byRole.animation_lead, rakib = byRole.animator,
  mim = byRole.designer, sadia = byRole.closer, nadia = byRole.ops_manager, shariful = byRole.ceo;

await db.query("begin");

// ---- 1. reorganize to the four spaces ----
await db.query("update departments set name='Production', slug='production', accent_color='#7C5CFC', sort_order=0 where workspace_id=$1 and slug='animation-studio'", [ws]);
await db.query("update departments set name='Administration', slug='administration', accent_color='#8A94A3', sort_order=3 where workspace_id=$1 and slug='operations'", [ws]);
await db.query("update departments set accent_color='#16A34A', sort_order=1 where workspace_id=$1 and slug='marketing'", [ws]);

const deptId = async (slug) => (await db.query("select id from departments where workspace_id=$1 and slug=$2", [ws, slug])).rows[0]?.id;
const prod = await deptId("production");
const marketing = await deptId("marketing");
const admin = await deptId("administration");
let sales = await deptId("sales");
if (!sales) {
  sales = (await db.query("insert into departments (workspace_id,name,slug,accent_color,sort_order,is_default) values ($1,'Sales','sales','#3B6FF6',2,false) returning id", [ws])).rows[0].id;
}

async function ensureList(dept, name, order) {
  const ex = (await db.query("select id from project_lists where department_id=$1 and name=$2", [dept, name])).rows[0];
  if (ex) return ex.id;
  return (await db.query("insert into project_lists (department_id,name,sort_order) values ($1,$2,$3) returning id", [dept, name, order])).rows[0].id;
}
const custom = await ensureList(prod, "Custom", 0);
const premade = await ensureList(prod, "Premade", 1);
const veList = await ensureList(prod, "Video Editing", 2);

// video-editing space folds into Production's Video Editing list.
const ve = await deptId("video-editing");
if (ve) {
  await db.query("update projects set department_id=$1, list_id=$2 where department_id=$3", [prod, veList, ve]);
  await db.query("insert into department_members (department_id,profile_id) select $1,profile_id from department_members where department_id=$2 on conflict do nothing", [prod, ve]);
  await db.query("delete from departments where id=$1", [ve]);
}

// ---- 2. membership per space, by role ----
await db.query(`insert into department_members (department_id, profile_id) select $1, profile_id from memberships where workspace_id=$2 and is_active and role in ('animator','animation_lead','designer','design_lead','creative_lead','editor','editing_lead') on conflict do nothing`, [prod, ws]);
await db.query(`insert into department_members (department_id, profile_id) select $1, profile_id from memberships where workspace_id=$2 and is_active and role in ('marketer','marketing_manager') on conflict do nothing`, [marketing, ws]);
await db.query(`insert into department_members (department_id, profile_id) select $1, profile_id from memberships where workspace_id=$2 and is_active and role in ('closer','appointment_setter') on conflict do nothing`, [sales, ws]);
await db.query(`insert into department_members (department_id, profile_id) select $1, profile_id from memberships where workspace_id=$2 and is_active and role in ('ops_manager','ceo','cfo') on conflict do nothing`, [admin, ws]);

// ---- 3. lists for the other spaces ----
const mkCampaigns = await ensureList(marketing, "Campaigns", 0);
const mkContent = await ensureList(marketing, "Content", 1);
const salesPipeline = await ensureList(sales, "Pipeline", 0);
const salesProposals = await ensureList(sales, "Proposals", 1);
const adminOps = await ensureList(admin, "Operations", 0);
const adminFinance = await ensureList(admin, "Finance", 1);

// ---- 4. file existing Production projects into Custom / Premade ----
const loose = (await db.query("select id from projects where department_id=$1 and list_id is null and parent_project_id is null", [prod])).rows;
for (let i = 0; i < loose.length; i++) {
  await db.query("update projects set list_id=$1 where id=$2", [i % 2 === 0 ? custom : premade, loose[i].id]);
}

// ---- 5. demo projects + onboarding series (guarded) ----
const demoExists = (await db.query("select 1 from projects where workspace_id=$1 and title like 'Onboarding series%' limit 1", [ws])).rows[0];
if (!demoExists) {
  async function proj(o) {
    const code = (await db.query("select next_code($1,'project') as c", [ws])).rows[0].c;
    return (await db.query(
      `insert into projects (workspace_id, department_id, list_id, code, title, type, status, owner_id, due_date, parent_project_id, brief)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [ws, o.dept ?? prod, o.list, code, o.title, o.type, o.status ?? "backlog", o.owner, o.due ?? null, o.parent ?? null, o.brief ?? null]
    )).rows[0].id;
  }
  async function task(pid, title, assignee, status, due) {
    await db.query("insert into tasks (project_id, title, assignee_id, status, due_date) values ($1,$2,$3,$4,$5)", [pid, title, assignee, status, due]);
  }

  const series = await proj({ list: custom, title: "Onboarding series, Q3 cohort", type: "series", status: "in_progress", owner: farhan, due: "2026-08-15", brief: "A batch of onboarding videos for the Q3 client cohort. Each video is a sub-project with its own owner and deadline." });
  const welcome = await proj({ list: custom, parent: series, title: "Welcome video", type: "video", status: "review", owner: rakib, due: "2026-07-25" });
  const walkthrough = await proj({ list: custom, parent: series, title: "Product walkthrough", type: "video", status: "in_progress", owner: tania, due: "2026-07-30" });
  await proj({ list: custom, parent: series, title: "Setup guide", type: "video", status: "backlog", owner: mim, due: "2026-08-05" });
  await proj({ list: custom, parent: series, title: "FAQ explainer", type: "video", status: "backlog", owner: rakib, due: "2026-08-10" });

  await proj({ list: premade, title: "Template pack refresh", type: "production", status: "in_progress", owner: tania, due: "2026-07-28" });
  await proj({ list: veList, title: "Highlight reel edit", type: "editing", status: "review", owner: rakib, due: "2026-07-22" });

  await proj({ dept: marketing, list: mkCampaigns, title: "Summer launch campaign", type: "campaign", status: "in_progress", owner: nadia, due: "2026-08-01" });
  await proj({ dept: marketing, list: mkContent, title: "Blog content batch", type: "content", status: "backlog", owner: nadia });
  await proj({ dept: sales, list: salesPipeline, title: "Enterprise outreach, Q3", type: "pipeline", status: "in_progress", owner: sadia });
  await proj({ dept: sales, list: salesProposals, title: "Proposal, retainer tier", type: "proposal", status: "backlog", owner: sadia });
  await proj({ dept: admin, list: adminOps, title: "Studio equipment audit", type: "ops", status: "backlog", owner: nadia });
  await proj({ dept: admin, list: adminFinance, title: "Q3 budget review", type: "finance", status: "in_progress", owner: shariful });

  await task(welcome, "Script and storyboard", rakib, "done", "2026-07-18");
  await task(welcome, "Animate scenes", rakib, "in_progress", "2026-07-22");
  await task(welcome, "Sound and final render", tania, "todo", "2026-07-25");
  await task(walkthrough, "Screen capture", tania, "in_progress", "2026-07-26");
  await task(walkthrough, "Voiceover", mim, "todo", "2026-07-28");
}

await db.query("commit");

const summary = (await db.query("select d.name, count(distinct pl.id) lists, count(distinct p.id) projects from departments d left join project_lists pl on pl.department_id=d.id left join projects p on p.department_id=d.id where d.workspace_id=$1 group by d.id order by d.sort_order", [ws])).rows;
console.log("[demo] spaces:");
for (const s of summary) console.log(`  ${s.name}: ${s.lists} lists, ${s.projects} projects`);
await db.end();
