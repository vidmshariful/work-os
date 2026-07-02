-- RLS for the core tables. Read policies here, write policies per phase in
-- 0006. A table without a considered policy is a bug.

alter table profiles       enable row level security;
alter table workspaces     enable row level security;
alter table memberships    enable row level security;
alter table clients        enable row level security;
alter table projects       enable row level security;
alter table project_phases enable row level security;
alter table tasks          enable row level security;

-- profiles: self, or anyone sharing a workspace with me
create policy profiles_select on profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from memberships me join memberships them
      on me.workspace_id = them.workspace_id
    where me.profile_id = auth.uid() and them.profile_id = profiles.id
  )
);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces: only ones I belong to. this is Guarantee 2 in force.
create policy workspaces_select on workspaces for select to authenticated
  using (app_is_member(id));

-- memberships: rows in my workspaces
create policy memberships_select on memberships for select to authenticated
  using (app_is_member(workspace_id));

-- clients base table has no authenticated access at all (revoked in 0003).
-- projects: any member of the workspace (title is brand-blind)
create policy projects_select on projects for select to authenticated
  using (app_is_member(workspace_id));

-- project phases: members of the project's workspace
create policy phases_select on project_phases for select to authenticated using (
  exists (select 1 from projects p where p.id = project_phases.project_id and app_is_member(p.workspace_id))
);

-- tasks: members of the project's workspace
create policy tasks_select on tasks for select to authenticated using (
  exists (select 1 from projects p where p.id = tasks.project_id and app_is_member(p.workspace_id))
);
