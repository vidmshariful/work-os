-- Fix: scaffold_kickoff_project crashed with "record tpl is not assigned yet"
-- when a client had no kickoff template. The two-step lookup skipped the only
-- assignment to tpl when kickoff_template_id was null, then referenced tpl.id.
-- Collapse it into a single coalesced SELECT INTO so tpl is always assigned
-- (to a null row when nothing matches). Behavior is unchanged: the chosen
-- template, else the workspace default, else a template-less project.
-- Discovered while verifying the D4 handoff -> department trigger.

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

  insert into projects (workspace_id, client_id, code, title, type, status, owner_id, start_date)
  values (cl.workspace_id, cl.id, new_project_code, project_title,
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
