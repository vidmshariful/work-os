-- Templates can now carry field defaults, and the client handoff has to
-- honour them too.
--
-- WHY. structure.fields is a new key in the template jsonb: a list of
-- { field_id, value } the project starts with. createProject applies it in
-- TypeScript, but a kickoff project is not created there. It is created by
-- this function, from the client's kickoff template, and without this change
-- a template would fill its fields in on the New project form and silently
-- skip them on the handoff. One template, two behaviours, is worse than not
-- shipping the feature.
--
-- WHAT CHANGES. A loop at the end of the template block, and the space the
-- project is filed into now gets decided one step earlier. Nothing else in
-- the function moves.
--
-- WHY THE FILING HAD TO MOVE. Three AFTER INSERT triggers fire on clients,
-- in name order: bookkeeping, then the handoff that calls this function,
-- then clients_file_default_department, which is what sets the new project's
-- department. So while this function runs, the project it just inserted has
-- no space yet. That is invisible today and fatal for field defaults: every
-- field Vidiosa actually uses (Active Prod. Stage, Script, Concept, Design
-- Elements) is scoped to Production, and a scope check against a null space
-- would skip all four, silently. Verified on the live database before this
-- migration was written: the probe applied the global field and dropped the
-- Production one on a project that was, one trigger later, in Production.
--
-- The rule that picks the space is now client_target_department, called by
-- both this function and the filing trigger, so there is one copy of it
-- rather than two that can drift. The trigger still runs and still only
-- touches projects whose department is null, so it is now a no-op for a
-- kickoff project and unchanged for every other path.
--
-- No policy and no view. app_can_see_department, projects_select and
-- project_lists_select are untouched. Both functions were already SECURITY
-- DEFINER and stay exactly as privileged as they were.
--
-- TWO GUARDS ON THE LOOP, both because the jsonb is not schema.
--   1. The field id is matched as text, never cast to uuid. A malformed id
--      in an old template then matches nothing instead of raising and
--      rolling back the whole handoff.
--   2. The definition must belong to this client's workspace, and must
--      either apply everywhere or to the space the project landed in. A
--      Production-only field never gets filed onto a Sales project.
-- Same two rules createProject applies, so the two paths agree.

-- The one place that decides which space a client's work belongs in. Lifted
-- verbatim out of clients_file_default_department, which now calls it.
create or replace function client_target_department(ws uuid, origin brand_origin)
returns uuid language sql stable
set search_path = public as $$
  select coalesce(
    (select id from departments
      where workspace_id = ws
        and slug = case origin
          when 'ghl_video' then 'production'
          when 'ghl_animation' then 'production'
          else null
        end
      limit 1),
    (select id from departments where workspace_id = ws and is_default limit 1)
  );
$$;

create or replace function clients_file_default_department()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  dept_id uuid;
begin
  dept_id := client_target_department(new.workspace_id, new.origin);
  if dept_id is not null then
    update projects set department_id = dept_id
      where client_id = new.id and department_id is null;
  end if;
  return new;
end;
$$;

create or replace function scaffold_kickoff_project(cid uuid)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  cl record;
  tpl record;
  new_project_id uuid;
  new_project_code text;
  project_title text;
  project_owner uuid;
  phase record;
  phase_id uuid;
  task_item jsonb;
  deliverable_item record;
  field_item record;
  dept_id uuid;
  d_idx int := 0;
begin
  select * into cl from clients where id = cid;
  if cl.id is null then
    raise exception 'Client not found';
  end if;
  if cl.stage = 'blacklist' then
    raise exception 'This client is blacklisted. No new work can be created.';
  end if;
  if cl.kickoff_done then
    raise exception 'The kickoff project already exists for this client.';
  end if;

  -- Chosen template, else the workspace default. A single select keeps tpl
  -- assigned even when neither exists, so later tpl.id checks are safe.
  select * into tpl from project_templates
    where id = coalesce(
      cl.kickoff_template_id,
      (select id from project_templates
         where workspace_id = cl.workspace_id and is_default
         order by created_at limit 1)
    );

  select m.profile_id into project_owner from memberships m
    where m.workspace_id = cl.workspace_id and m.role = 'creative_lead' and m.is_active
    limit 1;
  if project_owner is null then
    select m.profile_id into project_owner from memberships m
      where m.workspace_id = cl.workspace_id and m.archetype = 'domain_manager' and m.is_active
      limit 1;
  end if;
  if project_owner is null then
    project_owner := cl.owner_id;
  end if;

  new_project_code := next_code(cl.workspace_id, 'project');
  project_title := coalesce(tpl.structure->>'default_title', tpl.name, 'New engagement');
  dept_id := client_target_department(cl.workspace_id, cl.origin);

  insert into projects (workspace_id, client_id, department_id, code, title, type, status, owner_id, start_date)
  values (cl.workspace_id, cl.id, dept_id, new_project_code, project_title,
          coalesce(tpl.project_type, 'production'), 'backlog', project_owner, current_date)
  returning id into new_project_id;

  if tpl.id is not null then
    for phase in
      select value as v, ordinality as ord
      from jsonb_array_elements(coalesce(tpl.structure->'phases', '[]'::jsonb)) with ordinality
    loop
      insert into project_phases (project_id, name, sort_order)
      values (new_project_id, phase.v->>'name', phase.ord::int)
      returning id into phase_id;
      for task_item in
        select * from jsonb_array_elements(coalesce(phase.v->'tasks', '[]'::jsonb))
      loop
        insert into tasks (project_id, phase_id, title, description, status)
        values (new_project_id, phase_id, task_item->>'title', task_item->>'description', 'backlog');
      end loop;
    end loop;

    for deliverable_item in
      select value from jsonb_array_elements_text(coalesce(tpl.structure->'deliverables', '[]'::jsonb))
    loop
      d_idx := d_idx + 1;
      insert into deliverables (project_id, title, sort_order)
      values (new_project_id, deliverable_item.value, d_idx);
    end loop;

    -- Field defaults. A field deleted since the template was written simply
    -- stops applying: the join finds nothing and the row is skipped.
    for field_item in
      select value as v
      from jsonb_array_elements(coalesce(tpl.structure->'fields', '[]'::jsonb))
    loop
      insert into project_field_values (project_id, field_id, value)
      select new_project_id, f.id, field_item.v->'value'
      from project_fields f
      where f.id::text = field_item.v->>'field_id'
        and f.workspace_id = cl.workspace_id
        and (f.department_id is null or f.department_id = dept_id)
        and field_item.v->'value' is not null
        and field_item.v->>'value' <> ''
      on conflict (project_id, field_id) do nothing;
    end loop;
  end if;

  update clients set kickoff_done = true where id = cl.id;
  perform log_client_activity(cl.id, 'Kickoff project ' || new_project_code || ' scaffolded.');

  perform notify_user(project_owner, cl.workspace_id, 'handoff',
    'New client handoff: ' || cl.code,
    'Project ' || new_project_code || ' was scaffolded and assigned to you.',
    'project', new_project_id);
  perform notify_user(m.profile_id, cl.workspace_id, 'handoff',
    'New client ' || cl.code || ' onboarded',
    'Project ' || new_project_code || ' is scaffolded and ready.',
    'project', new_project_id)
  from memberships m
  where m.workspace_id = cl.workspace_id and m.archetype = 'executive' and m.is_active
    and m.profile_id is distinct from project_owner;

  return new_project_id;
end;
$$;
