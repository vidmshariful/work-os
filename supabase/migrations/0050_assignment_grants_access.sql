-- Being put on a project lets you open it.
--
-- WHY. project_assignees has existed since 0042 and the space list already
-- reads it to draw avatar stacks, but nothing ever wrote to it: 0 rows against
-- 20 assigned tasks. Finishing the write half is only useful if assignment
-- means something, and until now a project was visible purely through its
-- department, so adding a designer from Marketing to a Production project put
-- a row on their list that errored when they clicked it.
--
-- WHAT CHANGES IN EXISTING RLS, asked for and approved. projects_select gains
-- one branch. Every existing branch is unchanged, so this only ever widens,
-- and only to people someone deliberately put on the project.
--
-- THE RECURSION THIS AVOIDS. All three project_assignees policies are written
-- as EXISTS over projects, which is how they inherit projects_select. Naming
-- project_assignees directly inside projects_select would make each table's
-- policy depend on the other's and Postgres would refuse the query. The
-- helper is security definer, so it reads the table without evaluating its
-- policies and the loop never forms.
--
-- The wall is not involved. Client identity still comes from v_clients, and
-- somebody who reaches a project this way sees exactly what their own wall
-- side allows, which for a below-wall assignee is the code and nothing else.

create or replace function app_is_assigned(pid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from project_assignees pa
    where pa.project_id = pid and pa.profile_id = auth.uid()
  );
$$;

drop policy if exists projects_select on projects;
create policy projects_select on projects for select
  using (
    app_is_member(workspace_id)
    and (
      department_id is null
      or app_can_see_department(department_id)
      or app_is_assigned(id)
    )
  );
