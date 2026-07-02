// Seeds the Vidiosa workspace: auth users, memberships across the wall,
// templates, clients, projects, tasks with history, leave, events.
// Usage: node scripts/seed.mjs
// Idempotence: refuses to run if the workspace already exists.
import { createClient } from "@supabase/supabase-js";
import { connect, loadEnv } from "./db.mjs";

const env = loadEnv();
const SEED_PASSWORD = process.env.SEED_PASSWORD || "Vidiosa#2026";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PEOPLE = [
  { key: "shariful", name: "Shariful Islam", email: "shariful@vidiosa.com", role: "ceo", archetype: "executive", wall: "above", reportsTo: null },
  { key: "nadia", name: "Nadia Rahman", email: "nadia@vidiosa.com", role: "ops_manager", archetype: "executive", wall: "above", reportsTo: "shariful" },
  { key: "farhan", name: "Farhan Ahmed", email: "farhan@vidiosa.com", role: "creative_lead", archetype: "domain_manager", wall: "above", reportsTo: "shariful" },
  { key: "tania", name: "Tania Akter", email: "tania@vidiosa.com", role: "animation_lead", archetype: "team_lead", wall: "below", reportsTo: "farhan" },
  { key: "rakib", name: "Rakib Hasan", email: "rakib@vidiosa.com", role: "animator", archetype: "contributor", wall: "below", reportsTo: "tania" },
  { key: "mim", name: "Mim Chowdhury", email: "mim@vidiosa.com", role: "designer", archetype: "contributor", wall: "below", reportsTo: "farhan" },
  { key: "sadia", name: "Sadia Karim", email: "sadia@vidiosa.com", role: "closer", archetype: "revenue", wall: "above", reportsTo: "shariful" },
];

async function ensureUser(person) {
  const { data, error } = await admin.auth.admin.createUser({
    email: person.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: person.name },
  });
  if (!error) return data.user.id;
  // Already exists: find it.
  let page = 1;
  for (;;) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) throw listErr;
    const hit = list.users.find((u) => u.email === person.email);
    if (hit) return hit.id;
    if (list.users.length < 200) throw new Error(`Cannot create or find user ${person.email}: ${error.message}`);
    page++;
  }
}

const db = await connect();

const existing = await db.query("select id from workspaces where slug = 'vidiosa'");
if (existing.rows.length > 0) {
  console.log("[seed] workspace 'vidiosa' already exists. Nothing to do.");
  await db.end();
  process.exit(0);
}

console.log("[seed] creating auth users");
const ids = {};
for (const p of PEOPLE) {
  ids[p.key] = await ensureUser(p);
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const dateIn = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

try {
  await db.query("begin");

  // Profiles exist via the auth trigger. Make sure names are right.
  for (const p of PEOPLE) {
    await db.query(
      `insert into profiles (id, full_name, email) values ($1, $2, $3)
       on conflict (id) do update set full_name = excluded.full_name, email = excluded.email`,
      [ids[p.key], p.name, p.email]
    );
  }

  const ws = (
    await db.query(
      `insert into workspaces (slug, name, accent_color) values ('vidiosa', 'Vidiosa', '#3B6FF6') returning id`
    )
  ).rows[0].id;

  console.log("[seed] memberships");
  for (const p of PEOPLE) {
    await db.query(
      `insert into memberships (profile_id, workspace_id, role, archetype, reports_to, wall_side)
       values ($1, $2, $3, $4, $5, $6)`,
      [ids[p.key], ws, p.role, p.archetype, p.reportsTo ? ids[p.reportsTo] : null, p.wall]
    );
  }

  console.log("[seed] templates");
  const explainerStructure = {
    default_title: "Explainer video production",
    phases: [
      { name: "Discovery", tasks: [{ title: "Kickoff call notes" }, { title: "Collect brand assets" }] },
      { name: "Script", tasks: [{ title: "Draft script v1" }, { title: "Script review" }] },
      { name: "Storyboard", tasks: [{ title: "Storyboard frames" }, { title: "Styleframe pass" }] },
      { name: "Animation", tasks: [{ title: "Animate scenes" }, { title: "Sound design" }] },
      { name: "Delivery", tasks: [{ title: "Final render" }, { title: "Delivery package" }] },
    ],
    deliverables: ["60 second master video", "Square cutdown", "Source files"],
  };
  await db.query(
    `insert into project_templates (workspace_id, name, description, project_type, structure, is_default)
     values ($1, 'Explainer video pipeline', 'Standard five phase explainer production.', 'explainer_video', $2, true)`,
    [ws, JSON.stringify(explainerStructure)]
  );
  await db.query(
    `insert into project_templates (workspace_id, name, description, project_type, structure, is_default)
     values ($1, 'Brand design sprint', 'Two week identity and asset sprint.', 'brand_design', $2, false)`,
    [
      ws,
      JSON.stringify({
        default_title: "Brand design sprint",
        phases: [
          { name: "Research", tasks: [{ title: "Moodboards" }, { title: "Competitor scan" }] },
          { name: "Design", tasks: [{ title: "Logo directions" }, { title: "Asset kit" }] },
          { name: "Handover", tasks: [{ title: "Brand guide" }] },
        ],
        deliverables: ["Brand guide PDF", "Asset kit"],
      }),
    ]
  );

  // Clients seed with the handoff trigger off, so the dataset is exactly
  // what we intend. The trigger is proven live in the Phase 4 test.
  console.log("[seed] clients (handoff disabled during seed)");
  await db.query("alter table clients disable trigger t1_clients_handoff");
  const clientRows = [
    ["CLT-1001", "Meridian Fitness", "Alex Moreno", "alex@meridianfitness.com", "ghl_video", 12000, "active"],
    ["CLT-1002", "Northbeam Robotics", "Priya Shah", "priya@northbeam.io", "direct", 8500, "active"],
    ["CLT-1003", "Bluepine Dental", "Dan Whitfield", "dan@bluepinedental.com", "ghl_animation", 6000, "paused"],
  ];
  const clientIds = [];
  for (const [code, name, contact, email, origin, value, status] of clientRows) {
    const r = await db.query(
      `insert into clients (workspace_id, code, commercial_name, contact_name, contact_email, origin, contract_value, status, owner_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [ws, code, name, contact, email, origin, value, status, ids.sadia]
    );
    clientIds.push(r.rows[0].id);
  }
  await db.query("alter table clients enable trigger t1_clients_handoff");
  await db.query(
    `insert into workspace_counters (workspace_id, kind, value) values ($1, 'client', 1003), ($1, 'project', 1003)`,
    [ws]
  );

  console.log("[seed] projects, phases, tasks");
  const proj = async (code, clientIdx, title, type, status, due, start) =>
    (
      await db.query(
        `insert into projects (workspace_id, client_id, code, title, type, status, owner_id, start_date, due_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [ws, clientIds[clientIdx], code, title, type, status, ids.farhan, start, due]
      )
    ).rows[0].id;

  const p1 = await proj("PRJ-1001", 0, "Product explainer, 60 seconds", "explainer_video", "in_progress", dateIn(18), dateIn(-38));
  const p2 = await proj("PRJ-1002", 1, "Brand refresh kit", "brand_design", "review", dateIn(8), dateIn(-30));
  const p3 = await proj("PRJ-1003", 2, "Onboarding video series", "explainer_video", "backlog", null, null);

  const phase = async (pid, name, order) =>
    (
      await db.query(
        `insert into project_phases (project_id, name, sort_order) values ($1,$2,$3) returning id`,
        [pid, name, order]
      )
    ).rows[0].id;

  const p1Script = await phase(p1, "Script", 1);
  const p1Story = await phase(p1, "Storyboard", 2);
  const p1Anim = await phase(p1, "Animation", 3);
  const p1Deliv = await phase(p1, "Delivery", 4);
  const p2Research = await phase(p2, "Research", 1);
  const p2Design = await phase(p2, "Design", 2);

  for (const [pid, title, done] of [
    [p1, "60 second master video", false],
    [p1, "Square cutdown", false],
    [p1, "Source files", false],
    [p2, "Brand guide PDF", true],
    [p2, "Asset kit", false],
  ]) {
    await db.query(`insert into deliverables (project_id, title, is_done) values ($1,$2,$3)`, [pid, title, done]);
  }

  // Historical completed tasks carry explicit completed_at, so the derived
  // timestamp trigger is off while they load.
  await db.query("alter table tasks disable trigger t2_tasks_completed_at");
  const task = async (pid, phaseId, title, assignee, status, due, createdAgo, completedAgo, priority = 0) =>
    (
      await db.query(
        `insert into tasks (project_id, phase_id, title, assignee_id, status, due_date, created_at, completed_at, priority)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          pid,
          phaseId,
          title,
          assignee ? ids[assignee] : null,
          status,
          due,
          createdAgo != null ? daysAgo(createdAgo) : new Date().toISOString(),
          completedAgo != null ? daysAgo(completedAgo) : null,
          priority,
        ]
      )
    ).rows[0].id;

  // PRJ-1001: a healthy mix. On-time and late completions for real KPI.
  await task(p1, p1Script, "Draft script v1", "tania", "done", dateIn(-30), 36, 31);        // on time
  await task(p1, p1Script, "Script review", "farhan", "done", dateIn(-27), 32, 26);         // late
  await task(p1, p1Story, "Storyboard frames", "mim", "done", dateIn(-18), 26, 19);         // on time
  await task(p1, p1Story, "Styleframe pass", "mim", "done", dateIn(-12), 20, 10);           // late
  const animate = await task(p1, p1Anim, "Animate scenes 1 to 3", "rakib", "in_progress", dateIn(4), 12, null, 2);
  const sound = await task(p1, p1Anim, "Sound design", "tania", "todo", dateIn(9), 8, null);
  const render = await task(p1, p1Deliv, "Final render", "rakib", "blocked", dateIn(14), 8, null);
  const pkg = await task(p1, p1Deliv, "Delivery package", "tania", "backlog", dateIn(17), 8, null);
  const revTask = await task(p1, p1Anim, "Character walk cycle", "rakib", "review", dateIn(2), 15, null, 1);

  // PRJ-1002
  await task(p2, p2Research, "Moodboards", "mim", "done", dateIn(-22), 30, 24);             // on time
  await task(p2, p2Research, "Competitor scan", "mim", "done", dateIn(-20), 28, 21);        // late
  await task(p2, p2Design, "Logo directions", "mim", "done", dateIn(-10), 18, 11);          // on time
  await task(p2, p2Design, "Asset kit", "mim", "in_progress", dateIn(3), 10, null, 1);
  await task(p2, p2Design, "Brand guide layout", "rakib", "done", dateIn(-6), 12, 5);       // on time
  const socialCut = await task(p2, p2Design, "Social templates", "rakib", "todo", dateIn(6), 5, null);

  // PRJ-1003: scaffold only
  await task(p3, null, "Kickoff call notes", null, "backlog", null, 2, null);
  await task(p3, null, "Collect brand assets", null, "backlog", null, 2, null);
  await db.query("alter table tasks enable trigger t2_tasks_completed_at");

  console.log("[seed] dependencies, comments, revisions");
  await db.query(`insert into task_dependencies (task_id, depends_on_task_id) values ($1,$2), ($3,$4), ($5,$6)`, [
    render, animate, pkg, render, sound, animate,
  ]);

  const comment = (taskId, author, body) =>
    db.query(`insert into task_comments (task_id, author_id, body) values ($1,$2,$3)`, [taskId, ids[author], body]);
  await comment(animate, "tania", "Scene 2 timing looks great. Push the logo reveal 10 frames later.");
  await comment(animate, "rakib", "Done, uploading a new preview this afternoon.");
  await comment(revTask, "tania", "The silhouette reads stiff in the mid stride. One more pass please.");
  await comment(socialCut, "mim", "Grid specs are in the brief card, three sizes.");

  // A logged revision on the review task. The trigger bumps the counter.
  await db.query(`insert into task_revisions (task_id, requested_by, note) values ($1,$2,$3)`, [
    revTask, ids.tania, "Smooth the walk cycle, contact frames are popping.",
  ]);

  console.log("[seed] leave, events, announcements");
  const year = new Date().getFullYear();
  for (const p of PEOPLE) {
    await db.query(
      `insert into leave_balances (workspace_id, profile_id, year, total_days) values ($1,$2,$3,20)`,
      [ws, ids[p.key], year]
    );
  }
  // Pending request from Rakib, routed to Tania.
  await db.query(
    `insert into leave_requests (workspace_id, profile_id, type, start_date, end_date, days, reason)
     values ($1,$2,'annual',$3,$4,3,'Family trip')`,
    [ws, ids.rakib, dateIn(19), dateIn(21)]
  );
  // Approved history for Mim: insert pending, then approve, so the balance
  // trigger does the accounting.
  const mimLeave = (
    await db.query(
      `insert into leave_requests (workspace_id, profile_id, type, start_date, end_date, days, reason)
       values ($1,$2,'sick',$3,$4,2,'Flu') returning id`,
      [ws, ids.mim, dateIn(-20), dateIn(-19)]
    )
  ).rows[0].id;
  await db.query(
    `update leave_requests set status = 'approved', lead_approved_by = $2, lead_approved_at = now(),
       decided_by = $3, decided_at = now() where id = $1`,
    [mimLeave, ids.farhan, ids.nadia]
  );

  await db.query(
    `insert into events (workspace_id, title, type, start_date, end_date, created_by, description) values
     ($1, 'Studio shoot day', 'shoot', $2, $2, $3, 'Full day product shoot, studio B.'),
     ($1, 'Monthly all hands', 'meeting', $4, $4, $3, 'Numbers, wins, and the July plan.')`,
    [ws, dateIn(8), ids.nadia, dateIn(13)]
  );
  await db.query(
    `insert into announcements (workspace_id, title, body, created_by) values
     ($1, 'Welcome to Work OS', 'This replaces ClickUp and Retable from today. Your tasks, projects, leave, and performance all live here.', $2),
     ($1, 'July delivery push', 'Three deliveries land this month. Check your My Tasks list every morning.', $3)`,
    [ws, ids.shariful, ids.nadia]
  );

  await db.query("commit");
  console.log("[seed] done. Workspace 'vidiosa' is live with 7 people.");
} catch (e) {
  await db.query("rollback");
  // Make sure triggers are back on even after a failure.
  await db.query("alter table clients enable trigger t1_clients_handoff").catch(() => {});
  await db.query("alter table tasks enable trigger t2_tasks_completed_at").catch(() => {});
  console.error("[seed] FAILED:", e.message);
  process.exit(1);
} finally {
  await db.end();
}
