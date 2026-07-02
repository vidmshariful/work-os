-- Automation. Code generation, task event recording, the contributor guard,
-- leave routing, notification fan-out, and the client handoff chain.
-- KPI is exhaust: these triggers record clean events, views compute later.

-- ---- code generation ----

create or replace function next_code(ws uuid, kind text)
returns text language plpgsql security definer
set search_path = public as $$
declare
  n int;
  prefix text;
begin
  prefix := case kind
    when 'client' then 'CLT'
    when 'project' then 'PRJ'
    else upper(left(kind, 3))
  end;
  insert into workspace_counters (workspace_id, kind, value)
  values (ws, kind, 1001)
  on conflict (workspace_id, kind)
  do update set value = workspace_counters.value + 1
  returning value into n;
  return prefix || '-' || n::text;
end;
$$;

revoke execute on function next_code(uuid, text) from anon;

-- ---- notification helper ----

create or replace function notify_user(
  recipient uuid, ws uuid, ntype text, ntitle text, nbody text,
  etype text default null, eid uuid default null
) returns void language plpgsql security definer
set search_path = public as $$
begin
  if recipient is null then return; end if;
  insert into notifications (profile_id, workspace_id, type, title, body, entity_type, entity_id)
  values (recipient, ws, ntype, ntitle, nbody, etype, eid);
end;
$$;

revoke execute on function notify_user(uuid, uuid, text, text, text, text, uuid) from anon, authenticated;

-- ---- tasks: completed_at is derived, never typed ----

create or replace function tasks_set_completed_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger t2_tasks_completed_at
  before insert or update on tasks
  for each row execute function tasks_set_completed_at();

-- ---- tasks: contributors change status only ----

create or replace function tasks_guard_contributor()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  ws uuid;
begin
  if auth.uid() is null then return new; end if;  -- service role paths
  select p.workspace_id into ws from projects p where p.id = new.project_id;
  if app_can_assign(ws) then return new; end if;
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.assignee_id is distinct from old.assignee_id
     or new.due_date is distinct from old.due_date
     or new.priority is distinct from old.priority
     or new.phase_id is distinct from old.phase_id
     or new.project_id is distinct from old.project_id then
    raise exception 'Only the status of your own task can be changed';
  end if;
  return new;
end;
$$;

create trigger t1_tasks_guard
  before update on tasks
  for each row execute function tasks_guard_contributor();

-- ---- tasks: assignment notifications ----

create or replace function tasks_notify_assignment()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  ws uuid;
  pcode text;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;
  if new.assignee_id = auth.uid() then return new; end if;
  select p.workspace_id, p.code into ws, pcode from projects p where p.id = new.project_id;
  perform notify_user(
    new.assignee_id, ws, 'task_assigned',
    'New task on ' || pcode,
    new.title, 'task', new.id
  );
  return new;
end;
$$;

create trigger t3_tasks_notify_assignment
  after insert or update on tasks
  for each row execute function tasks_notify_assignment();

-- ---- revisions: bump the counter, tell the assignee ----

create or replace function revisions_after_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  t record;
  ws uuid;
  pcode text;
begin
  update tasks set revision_count = revision_count + 1 where id = new.task_id;
  select tasks.*, p.workspace_id as ws, p.code as pcode into t
    from tasks join projects p on p.id = tasks.project_id
    where tasks.id = new.task_id;
  if t.assignee_id is not null and t.assignee_id <> new.requested_by then
    perform notify_user(
      t.assignee_id, t.ws, 'revision_requested',
      'Revision on ' || t.pcode,
      t.title, 'task', new.task_id
    );
  end if;
  return new;
end;
$$;

create trigger t1_revisions_after_insert
  after insert on task_revisions
  for each row execute function revisions_after_insert();

-- ---- comments: tell the assignee ----

create or replace function comments_after_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  t record;
begin
  select tasks.*, p.workspace_id as ws, p.code as pcode into t
    from tasks join projects p on p.id = tasks.project_id
    where tasks.id = new.task_id;
  if t.assignee_id is not null and t.assignee_id <> new.author_id then
    perform notify_user(
      t.assignee_id, t.ws, 'comment_added',
      'New comment on ' || t.pcode,
      left(new.body, 140), 'task', new.task_id
    );
  end if;
  return new;
end;
$$;

create trigger t1_comments_after_insert
  after insert on task_comments
  for each row execute function comments_after_insert();

-- ---- projects: status change notifications ----

create or replace function projects_notify_status()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.status is distinct from old.status and new.owner_id is not null
     and new.owner_id <> auth.uid() then
    perform notify_user(
      new.owner_id, new.workspace_id, 'project_status',
      new.code || ' moved to ' || replace(new.status::text, '_', ' '),
      new.title, 'project', new.id
    );
  end if;
  return new;
end;
$$;

create trigger t1_projects_notify_status
  after update on projects
  for each row execute function projects_notify_status();

-- ---- leave: transition guard ----

create or replace function leave_guard_transitions()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  is_lead_of boolean;
begin
  if auth.uid() is null then return new; end if;  -- service role paths

  if app_archetype(new.workspace_id) = 'executive' then
    if old.status = 'pending' and new.status in ('approved','rejected') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
    return new;
  end if;

  if new.profile_id = auth.uid() then
    if old.status = 'pending' and new.status = 'cancelled'
       and new.lead_approved_by is not distinct from old.lead_approved_by
       and new.decided_by is not distinct from old.decided_by then
      return new;
    end if;
    raise exception 'A request can only be cancelled while pending';
  end if;

  select exists(
    select 1 from memberships m
    where m.workspace_id = new.workspace_id
      and m.profile_id = new.profile_id
      and m.reports_to = auth.uid() and m.is_active
  ) into is_lead_of;

  if is_lead_of then
    if old.status = 'pending' and new.status = 'pending'
       and old.lead_approved_at is null and new.lead_approved_by = auth.uid() then
      new.lead_approved_at := now();
      return new;
    end if;
    if old.status = 'pending' and new.status = 'rejected' then
      new.decided_by := auth.uid();
      new.decided_at := now();
      return new;
    end if;
    raise exception 'Leads endorse or reject pending requests';
  end if;

  raise exception 'Not allowed';
end;
$$;

create trigger t1_leave_guard
  before update on leave_requests
  for each row execute function leave_guard_transitions();

-- ---- leave: routing and balance updates ----

create or replace function leave_after_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  approver uuid;
  requester_name text;
begin
  select m.reports_to into approver from memberships m
    where m.workspace_id = new.workspace_id and m.profile_id = new.profile_id and m.is_active;
  select full_name into requester_name from profiles where id = new.profile_id;
  if approver is not null then
    perform notify_user(
      approver, new.workspace_id, 'leave_requested',
      'Leave request from ' || coalesce(requester_name, 'a teammate'),
      new.start_date::text || ' to ' || new.end_date::text || ', ' || new.days || ' days',
      'leave_request', new.id
    );
  else
    -- top of the line: route straight to executives
    perform notify_user(m.profile_id, new.workspace_id, 'leave_requested',
      'Leave request from ' || coalesce(requester_name, 'a teammate'),
      new.start_date::text || ' to ' || new.end_date::text || ', ' || new.days || ' days',
      'leave_request', new.id)
    from memberships m
    where m.workspace_id = new.workspace_id and m.archetype = 'executive' and m.is_active;
  end if;
  return new;
end;
$$;

create trigger t2_leave_after_insert
  after insert on leave_requests
  for each row execute function leave_after_insert();

create or replace function leave_after_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  requester_name text;
begin
  -- lead endorsement moves it to the final gate: the Operations Manager
  if new.lead_approved_at is not null and old.lead_approved_at is null
     and new.status = 'pending' then
    select full_name into requester_name from profiles where id = new.profile_id;
    perform notify_user(m.profile_id, new.workspace_id, 'leave_endorsed',
      'Leave request awaiting final approval',
      coalesce(requester_name, 'A teammate') || ', ' || new.start_date::text || ' to ' || new.end_date::text,
      'leave_request', new.id)
    from memberships m
    where m.workspace_id = new.workspace_id
      and m.archetype = 'executive' and m.is_active;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into leave_balances (workspace_id, profile_id, year, used_days)
      values (new.workspace_id, new.profile_id, extract(year from new.start_date)::int, new.days)
      on conflict (workspace_id, profile_id, year)
      do update set used_days = leave_balances.used_days + excluded.used_days;
      perform notify_user(new.profile_id, new.workspace_id, 'leave_decided',
        'Leave approved',
        new.start_date::text || ' to ' || new.end_date::text, 'leave_request', new.id);
    elsif new.status = 'rejected' then
      perform notify_user(new.profile_id, new.workspace_id, 'leave_decided',
        'Leave rejected',
        coalesce(new.decision_note, new.start_date::text || ' to ' || new.end_date::text),
        'leave_request', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger t3_leave_after_update
  after update on leave_requests
  for each row execute function leave_after_update();

-- ---- the handoff: deal closed, system takes over ----

create or replace function clients_handoff()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
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
  -- default template, if the workspace has one
  select * into tpl from project_templates
    where workspace_id = new.workspace_id and is_default
    order by created_at limit 1;

  -- owner: the Creative Lead, else any domain manager, else the client owner
  select m.profile_id into project_owner from memberships m
    where m.workspace_id = new.workspace_id and m.role = 'creative_lead' and m.is_active
    limit 1;
  if project_owner is null then
    select m.profile_id into project_owner from memberships m
      where m.workspace_id = new.workspace_id and m.archetype = 'domain_manager' and m.is_active
      limit 1;
  end if;
  if project_owner is null then
    project_owner := new.owner_id;
  end if;

  new_project_code := next_code(new.workspace_id, 'project');
  -- brand-blind title, never a client name
  project_title := coalesce(tpl.structure->>'default_title', tpl.name, 'New engagement');

  insert into projects (workspace_id, client_id, code, title, type, status, owner_id, start_date)
  values (new.workspace_id, new.id, new_project_code, project_title,
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

  -- tell the owner and the executives. Brand-blind: the code is the identity.
  perform notify_user(project_owner, new.workspace_id, 'handoff',
    'New client handoff: ' || new.code,
    'Project ' || new_project_code || ' was scaffolded and assigned to you.',
    'project', new_project_id);
  perform notify_user(m.profile_id, new.workspace_id, 'handoff',
    'New client ' || new.code || ' onboarded',
    'Project ' || new_project_code || ' is scaffolded and ready.',
    'project', new_project_id)
  from memberships m
  where m.workspace_id = new.workspace_id and m.archetype = 'executive' and m.is_active
    and m.profile_id is distinct from project_owner;

  return new;
end;
$$;

create trigger t1_clients_handoff
  after insert on clients
  for each row execute function clients_handoff();

-- ---- realtime for live notification counts ----

do $$
begin
  alter publication supabase_realtime add table notifications;
exception when others then
  null;  -- publication may not exist in local shadow databases
end;
$$;
