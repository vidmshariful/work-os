-- Clients complete: the relationship pipeline, payments, documents, intake,
-- and the client workroom (activity, to-dos, notes, contacts).
-- Everything new here is ABOVE-WALL ONLY at the RLS level: below the wall
-- these tables return zero rows and the client remains a code with a stage.

-- ---- 1. The pipeline: stage replaces status ----

create type client_stage as enum ('onboard','active','blocked','blacklist','done');
create type kickoff_timing as enum ('immediate','on_intake','manual');
create type intake_status as enum ('not_sent','sent','received');
create type contract_status as enum ('none','draft','sent','signed');

alter table clients add column stage client_stage not null default 'onboard';
alter table clients add column stage_changed_at timestamptz not null default now();
alter table clients add column website text;
alter table clients add column highlevel_url text;
alter table clients add column kickoff_template_id uuid references project_templates(id) on delete set null;
alter table clients add column kickoff_timing kickoff_timing not null default 'on_intake';
alter table clients add column kickoff_done boolean not null default false;
alter table clients add column intake_status intake_status not null default 'not_sent';
alter table clients add column intake_form_url text;
alter table clients add column intake_sent_at timestamptz;
alter table clients add column intake_received_at timestamptz;
alter table clients add column intake_response_url text;

update clients set stage = case status
  when 'active' then 'active'::client_stage
  when 'paused' then 'blocked'::client_stage
  when 'completed' then 'done'::client_stage
  when 'archived' then 'done'::client_stage
end;
-- Seeded clients already produced work, so they are past onboarding.
update clients set kickoff_done = true, kickoff_timing = 'immediate';

-- The wall view is rebuilt at the end of this migration; it has to go first
-- because it depends on the legacy contact columns.
drop view v_clients;

-- ---- 2. Contacts: multiple per client, primary flagged ----

create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role_label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

insert into client_contacts (client_id, name, email, is_primary)
select id, contact_name, contact_email, true
from clients where contact_name is not null;

alter table clients drop column contact_name;
alter table clients drop column contact_email;

-- ---- 3. Payments, documents, workroom tables ----

create table client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text not null,
  amount numeric not null check (amount >= 0),
  due_date date,
  invoice_url text,
  paid_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  doc_type text not null default 'other',   -- contract, proposal, other
  contract_status contract_status not null default 'none',
  storage_path text,
  external_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table client_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null default 'message',     -- message | system
  author_id uuid references profiles(id),
  body text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table client_todos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  assignee_id uuid references profiles(id),
  due_date date,
  is_done boolean not null default false,
  done_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_client_contacts_client on client_contacts (client_id);
create index idx_client_payments_client on client_payments (client_id);
create index idx_client_documents_client on client_documents (client_id);
create index idx_client_activity_client on client_activity (client_id, created_at desc);
create index idx_client_todos_client on client_todos (client_id);
create index idx_client_todos_assignee on client_todos (assignee_id) where not is_done;
create index idx_client_notes_client on client_notes (client_id, created_at desc);
create index idx_clients_stage on clients (workspace_id, stage);

-- ---- 4. RLS: above the wall or nothing ----

create or replace function app_client_above_wall(cid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(
    select 1 from clients c
    join memberships m on m.workspace_id = c.workspace_id
    where c.id = cid and m.profile_id = auth.uid()
      and m.wall_side = 'above' and m.is_active
  );
$$;

alter table client_contacts  enable row level security;
alter table client_payments  enable row level security;
alter table client_documents enable row level security;
alter table client_activity  enable row level security;
alter table client_todos     enable row level security;
alter table client_notes     enable row level security;

create policy contacts_rw on client_contacts for all to authenticated
  using (app_client_above_wall(client_id)) with check (app_client_above_wall(client_id));
create policy payments_rw on client_payments for all to authenticated
  using (app_client_above_wall(client_id)) with check (app_client_above_wall(client_id));
create policy documents_rw on client_documents for all to authenticated
  using (app_client_above_wall(client_id)) with check (app_client_above_wall(client_id));
create policy activity_select on client_activity for select to authenticated
  using (app_client_above_wall(client_id));
create policy activity_insert on client_activity for insert to authenticated
  with check (app_client_above_wall(client_id) and kind = 'message' and author_id = auth.uid());
create policy todos_rw on client_todos for all to authenticated
  using (app_client_above_wall(client_id)) with check (app_client_above_wall(client_id));
create policy notes_select on client_notes for select to authenticated
  using (app_client_above_wall(client_id));
create policy notes_insert on client_notes for insert to authenticated
  with check (app_client_above_wall(client_id) and author_id = auth.uid());
create policy notes_delete on client_notes for delete to authenticated
  using (author_id = auth.uid() and app_client_above_wall(client_id));

-- ---- 5. Rebuild the wall view ----
-- stage is work-relevant and visible below the wall, like status was.
-- Everything commercial stays masked. Contact fields now come from the
-- primary contact row.

create view v_clients with (security_invoker = false) as
select
  c.id, c.workspace_id, c.code, c.stage, c.stage_changed_at, c.owner_id, c.created_at,
  case when app_is_above_wall(c.workspace_id) then c.commercial_name end as commercial_name,
  case when app_is_above_wall(c.workspace_id) then pc.name  end as contact_name,
  case when app_is_above_wall(c.workspace_id) then pc.email end as contact_email,
  case when app_is_above_wall(c.workspace_id) then c.origin::text end as origin,
  case when app_is_above_wall(c.workspace_id) then c.contract_value end as contract_value,
  case when app_is_above_wall(c.workspace_id) then c.website end as website,
  case when app_is_above_wall(c.workspace_id) then c.highlevel_url end as highlevel_url,
  case when app_is_above_wall(c.workspace_id) then c.kickoff_template_id end as kickoff_template_id,
  case when app_is_above_wall(c.workspace_id) then c.kickoff_timing::text end as kickoff_timing,
  case when app_is_above_wall(c.workspace_id) then c.kickoff_done end as kickoff_done,
  case when app_is_above_wall(c.workspace_id) then c.intake_status::text end as intake_status,
  case when app_is_above_wall(c.workspace_id) then c.intake_form_url end as intake_form_url,
  case when app_is_above_wall(c.workspace_id) then c.intake_sent_at end as intake_sent_at,
  case when app_is_above_wall(c.workspace_id) then c.intake_received_at end as intake_received_at,
  case when app_is_above_wall(c.workspace_id) then c.intake_response_url end as intake_response_url
from clients c
left join lateral (
  select name, email from client_contacts cc
  where cc.client_id = c.id
  order by cc.is_primary desc, cc.created_at
  limit 1
) pc on true
where app_is_member(c.workspace_id);

revoke all on v_clients from anon;
grant select on v_clients to authenticated;

alter table clients drop column status;
drop type client_status;

-- ---- 6. System activity logging ----

create or replace function log_client_activity(cid uuid, msg text, m jsonb default null)
returns void language plpgsql security definer
set search_path = public as $$
begin
  insert into client_activity (client_id, kind, body, meta)
  values (cid, 'system', msg, m);
end;
$$;

revoke execute on function log_client_activity(uuid, text, jsonb) from anon, authenticated;

create or replace function clients_stage_bookkeeping()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  actor text;
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    select full_name into actor from profiles where id = auth.uid();
    perform log_client_activity(
      new.id,
      coalesce(actor, 'The system') || ' moved this client to ' ||
        case new.stage
          when 'onboard' then 'Onboard'
          when 'active' then 'Active'
          when 'blocked' then 'Blocked'
          when 'blacklist' then 'Black list'
          when 'done' then 'Done'
        end,
      jsonb_build_object('from', old.stage, 'to', new.stage)
    );
  end if;

  if new.intake_status is distinct from old.intake_status then
    if new.intake_status = 'sent' then
      new.intake_sent_at := coalesce(new.intake_sent_at, now());
      perform log_client_activity(new.id, 'Intake form sent.');
    elsif new.intake_status = 'received' then
      new.intake_received_at := coalesce(new.intake_received_at, now());
      perform log_client_activity(new.id, 'Intake form received. Work can start.');
    end if;
  end if;

  return new;
end;
$$;

create trigger t0_clients_stage_bookkeeping
  before update on clients
  for each row execute function clients_stage_bookkeeping();

create or replace function client_payments_activity()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_client_activity(
      new.client_id,
      'Payment scheduled: ' || new.label || ', ' || to_char(new.amount, 'FM999,999,990') || '.'
    );
  elsif tg_op = 'UPDATE' and new.paid_at is not null and old.paid_at is null then
    perform log_client_activity(
      new.client_id,
      'Payment received: ' || new.label || ', ' || to_char(new.amount, 'FM999,999,990') || '.'
    );
  end if;
  return new;
end;
$$;

create trigger t1_client_payments_activity
  after insert or update on client_payments
  for each row execute function client_payments_activity();

create or replace function client_todos_notify()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  ws uuid;
  ccode text;
begin
  select workspace_id, code into ws, ccode from clients where id = new.client_id;
  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is not null and new.assignee_id <> auth.uid() then
      perform notify_user(new.assignee_id, ws, 'client_todo',
        'To-do on ' || ccode, new.title, 'client', new.client_id);
    end if;
  end if;
  if tg_op = 'UPDATE' and new.is_done and not old.is_done then
    new.done_at := now();
  end if;
  return new;
end;
$$;

create trigger t1_client_todos_notify
  before insert or update on client_todos
  for each row execute function client_todos_notify();

-- ---- 7. The handoff, rebuilt around kickoff timing ----
-- Scaffold logic moves into a reusable function. It fires: on insert when
-- timing is immediate, on intake received when timing is on_intake, or from
-- a server action when manual. Blacklisted clients never scaffold.

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

  -- chosen template, else the workspace default
  if cl.kickoff_template_id is not null then
    select * into tpl from project_templates where id = cl.kickoff_template_id;
  end if;
  if tpl.id is null then
    select * into tpl from project_templates
      where workspace_id = cl.workspace_id and is_default
      order by created_at limit 1;
  end if;

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

revoke execute on function scaffold_kickoff_project(uuid) from anon, authenticated;

-- Replace the old insert-time handoff with timing-aware versions.
drop trigger t1_clients_handoff on clients;
drop function clients_handoff();

create or replace function clients_handoff_on_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform log_client_activity(new.id, 'Client ' || new.code || ' created.');
  if new.kickoff_timing = 'immediate' and not new.kickoff_done then
    perform scaffold_kickoff_project(new.id);
  end if;
  return new;
end;
$$;

create trigger t1_clients_handoff
  after insert on clients
  for each row execute function clients_handoff_on_insert();

create or replace function clients_handoff_on_intake()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.intake_status = 'received' and old.intake_status is distinct from 'received'
     and new.kickoff_timing = 'on_intake' and not new.kickoff_done
     and new.stage <> 'blacklist' then
    perform scaffold_kickoff_project(new.id);
  end if;
  return new;
end;
$$;

create trigger t2_clients_handoff_on_intake
  after update on clients
  for each row execute function clients_handoff_on_intake();

-- ---- 8. Pipeline automation and the blacklist guard ----

-- A project moving into production activates an onboarding or reordering
-- client. Done to Active is the reorder path.
create or replace function projects_activate_client()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress'
     and new.client_id is not null then
    update clients set stage = 'active'
      where id = new.client_id and stage in ('onboard','done');
  end if;
  return new;
end;
$$;

create trigger t2_projects_activate_client
  after update on projects
  for each row execute function projects_activate_client();

-- No work for blacklisted clients, from any write path.
create or replace function projects_blacklist_guard()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  s client_stage;
begin
  if new.client_id is null then return new; end if;
  select stage into s from clients where id = new.client_id;
  if s = 'blacklist' then
    raise exception 'This client is blacklisted. No new work can be created.';
  end if;
  return new;
end;
$$;

create trigger t0_projects_blacklist_guard
  before insert on projects
  for each row execute function projects_blacklist_guard();
