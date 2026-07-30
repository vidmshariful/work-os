-- Comments on a project. Mirrors task_comments exactly rather than inventing
-- a second pattern: any member who can already see the project may read and
-- post, a comment belongs to its author, and an insert notifies the owner.
--
-- Additive only. Nothing dropped, nothing altered, no existing row touched.
--
-- Wall note: a project is visible below the wall, so a project comment is too,
-- exactly like a task comment. The body is free text, so the same discipline
-- applies as everywhere else in the work engine: never type a client identity
-- into one. Nothing here widens what the wall exposes.

create table project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- The detail page reads one project's thread oldest-first.
create index project_comments_project_idx
  on project_comments (project_id, created_at);

alter table project_comments enable row level security;

-- These policies reference `projects`, never project_comments itself, so
-- `INSERT ... RETURNING` is not rejected. That is the 0021 / 0027 / 0028
-- lesson applied up front. Reading `projects` inside the policy also means
-- department scoping and the project's own RLS still decide who may comment:
-- you can only comment on a project you can already see.
create policy project_comments_select on project_comments
  for select to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = project_comments.project_id and app_is_member(p.workspace_id)
    )
  );

create policy project_comments_insert on project_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from projects p
      where p.id = project_comments.project_id and app_is_member(p.workspace_id)
    )
  );

-- Authors delete their own. No update policy, matching task_comments: an
-- edit window is a Phase A item and is not smuggled in here.
create policy project_comments_delete on project_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- ---- notify the project owner ----

create or replace function project_comments_after_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  p record;
begin
  select projects.* into p from projects where projects.id = new.project_id;
  if p.owner_id is not null and p.owner_id <> new.author_id then
    perform notify_user(
      p.owner_id, p.workspace_id, 'comment_added',
      'New comment on ' || p.code,
      left(new.body, 140), 'project', new.project_id
    );
  end if;
  return new;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions, and anon/authenticated
-- inherit PUBLIC. Revoke it: this runs as a trigger, never as a caller.
revoke execute on function project_comments_after_insert() from public;

create trigger t1_project_comments_after_insert
  after insert on project_comments
  for each row execute function project_comments_after_insert();
