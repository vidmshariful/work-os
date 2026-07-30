-- Sorting a space by "last updated" needs a column to sort on. projects
-- carried only created_at, so nothing recorded when a row last changed.
--
-- Additive only: one nullable-free column with a default, one BEFORE UPDATE
-- trigger, and a backfill. No existing column is altered or dropped, no
-- policy is touched, and no row is deleted.

alter table projects
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows have no edit history to recover, so they start at their
-- creation time rather than pretending they were all just touched.
update projects set updated_at = created_at where updated_at > created_at;

create or replace function projects_touch_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions and anon/authenticated
-- inherit it. This only ever runs as a trigger, so revoke it.
revoke execute on function projects_touch_updated_at() from public;

-- Named t0_ so it stamps the row before the existing notify, activity, and
-- intake triggers observe it. Those are AFTER triggers, so ordering is not
-- load bearing, but the stamp belongs with the other BEFORE work.
drop trigger if exists t0_projects_touch_updated_at on projects;
create trigger t0_projects_touch_updated_at
  before update on projects
  for each row execute function projects_touch_updated_at();

-- The space page sorts and filters by these together.
create index if not exists projects_department_updated_idx
  on projects (department_id, updated_at desc);
