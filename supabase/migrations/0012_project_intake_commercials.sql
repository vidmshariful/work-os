-- Intake belongs to the project, not the client: one client runs many
-- projects and each engagement collects its own intake. Pricing and invoice
-- terms live per project too, readable ONLY by executives and the project's
-- assigned manager. The production team's reads return zero rows.

-- ---- 1. Per-project intake ----

create table project_intakes (
  project_id uuid primary key references projects(id) on delete cascade,
  status intake_status not null default 'not_sent',
  form_url text,
  sent_at timestamptz,
  received_at timestamptz,
  response_url text,
  response_note text,
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---- 2. Per-project commercials: manager and admins only ----

create table project_commercials (
  project_id uuid primary key references projects(id) on delete cascade,
  price numeric check (price >= 0),
  invoice_terms text,
  notes text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- Payments can now be attached to the project they invoice.
alter table client_payments add column project_id uuid references projects(id) on delete set null;
create index idx_client_payments_project on client_payments (project_id);

-- ---- 3. RLS ----

create or replace function app_project_above_wall(pid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(
    select 1 from projects p
    join memberships m on m.workspace_id = p.workspace_id
    where p.id = pid and m.profile_id = auth.uid()
      and m.wall_side = 'above' and m.is_active
  );
$$;

-- Executives, or the assigned manager (owner) who is above the wall.
create or replace function app_project_commercial_access(pid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(
    select 1 from projects p
    join memberships m on m.workspace_id = p.workspace_id
    where p.id = pid and m.profile_id = auth.uid() and m.is_active
      and (
        m.archetype = 'executive'
        or (p.owner_id = auth.uid() and m.wall_side = 'above')
      )
  );
$$;

alter table project_intakes enable row level security;
alter table project_commercials enable row level security;

create policy project_intakes_rw on project_intakes for all to authenticated
  using (app_project_above_wall(project_id))
  with check (app_project_above_wall(project_id));

create policy project_commercials_rw on project_commercials for all to authenticated
  using (app_project_commercial_access(project_id))
  with check (app_project_commercial_access(project_id));

-- ---- 4. Move existing client intake state onto each kickoff project ----

insert into project_intakes (project_id, status, form_url, sent_at, received_at, response_url)
select distinct on (c.id)
  p.id, c.intake_status, c.intake_form_url, c.intake_sent_at, c.intake_received_at, c.intake_response_url
from clients c
join projects p on p.client_id = c.id
order by c.id, p.created_at
on conflict (project_id) do nothing;

-- Every client project gets an intake record from birth.
create or replace function projects_create_intake()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.client_id is not null then
    insert into project_intakes (project_id) values (new.id)
    on conflict (project_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger t3_projects_create_intake
  after insert on projects
  for each row execute function projects_create_intake();

insert into project_intakes (project_id)
select id from projects where client_id is not null
on conflict (project_id) do nothing;

-- ---- 5. Intake bookkeeping: stamps, activity, and the work-can-start ping ----

create or replace function project_intakes_bookkeeping()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  proj record;
begin
  if new.status is distinct from old.status then
    select p.*, c.id as cid into proj
      from projects p left join clients c on c.id = p.client_id
      where p.id = new.project_id;
    if new.status = 'sent' then
      new.sent_at := coalesce(new.sent_at, now());
      if proj.cid is not null then
        perform log_client_activity(proj.cid, 'Intake form sent for ' || proj.code || '.');
      end if;
    elsif new.status = 'received' then
      new.received_at := coalesce(new.received_at, now());
      if proj.cid is not null then
        perform log_client_activity(proj.cid, 'Intake received for ' || proj.code || '. Work can start.');
      end if;
      if proj.owner_id is not null and proj.owner_id is distinct from auth.uid() then
        perform notify_user(proj.owner_id, proj.workspace_id, 'intake_received',
          'Intake received for ' || proj.code,
          'The client submitted their intake. Work can start.',
          'project', new.project_id);
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger t1_project_intakes_bookkeeping
  before update on project_intakes
  for each row execute function project_intakes_bookkeeping();

-- ---- 6. Clients shed their intake columns; the wall view is rebuilt ----

drop trigger t2_clients_handoff_on_intake on clients;
drop function clients_handoff_on_intake();

drop view v_clients;

alter table clients drop column intake_status;
alter table clients drop column intake_form_url;
alter table clients drop column intake_sent_at;
alter table clients drop column intake_received_at;
alter table clients drop column intake_response_url;

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
  case when app_is_above_wall(c.workspace_id) then c.kickoff_done end as kickoff_done
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

-- Kickoff timing simplifies to now-or-later; legacy on_intake rows behave
-- as immediate from here on.
create or replace function clients_handoff_on_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform log_client_activity(new.id, 'Client ' || new.code || ' created.');
  if new.kickoff_timing in ('immediate','on_intake') and not new.kickoff_done then
    perform scaffold_kickoff_project(new.id);
  end if;
  return new;
end;
$$;
