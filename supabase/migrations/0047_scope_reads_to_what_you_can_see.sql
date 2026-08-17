-- Three read policies that checked only workspace membership, and a feed
-- that accumulated links to deleted records.
--
-- WHAT THE AUDIT FOUND. Sadia can open 2 projects and 1 department. She was
-- reading intake forms for all 6 projects and custom field definitions for 4
-- departments she cannot see, and 84 of the 96 rows in her activity feed were
-- about projects she cannot open. Rakib, Tania and Mim each read 36 such
-- rows. None of it leaves the workspace, but a feed that narrates work you
-- are not on is exactly the kind of quiet leak the wall exists to prevent.
--
-- WHAT CHANGES, asked for and approved. Three SELECT policies gain a check
-- that the row's subject is visible to the reader. Every change narrows what
-- comes back and none widens it, so nobody loses access to something they
-- already had a right to. app_can_see_department and projects_select are
-- called here, never modified.

-- ---- the activity feed -----------------------------------------------------

-- entity_type is 'project' or 'task' in this table today. A project row is
-- visible when the project is; a task row when its project is. The subqueries
-- read projects and tasks WITHOUT a security definer wrapper on purpose, so
-- projects_select and tasks' own policy decide, and this policy inherits
-- whatever those rules become later.
--
-- Anything with an entity_type this does not know about stays visible to
-- members, which is the safe direction for a feed: a new kind of entry is
-- readable until somebody scopes it, rather than silently vanishing.
drop policy if exists activity_select on activity_log;
create policy activity_select on activity_log for select
  using (
    app_is_member(workspace_id)
    and (
      case entity_type
        when 'project' then exists (select 1 from projects p where p.id = activity_log.entity_id)
        when 'task' then exists (select 1 from tasks t where t.id = activity_log.entity_id)
        else true
      end
    )
  );

-- ---- intake forms ----------------------------------------------------------

-- The above-wall check stays exactly as it was. It answers "may this person
-- see commercial detail at all", which is not the same question as "may this
-- person see THIS project", and only the first was ever being asked.
drop policy if exists project_intakes_rw on project_intakes;
create policy project_intakes_rw on project_intakes for all
  using (
    app_project_above_wall(project_id)
    and exists (select 1 from projects p where p.id = project_intakes.project_id)
  )
  with check (
    app_project_above_wall(project_id)
    and exists (select 1 from projects p where p.id = project_intakes.project_id)
  );

-- ---- custom field definitions ----------------------------------------------

-- A field definition belongs to a department, so it is readable exactly when
-- that department is. The insert, update and delete policies keep their
-- manager check untouched.
drop policy if exists project_fields_select on project_fields;
create policy project_fields_select on project_fields for select
  using (app_can_see_department(department_id));

-- ---- notifications outlive their subject -----------------------------------

-- A notification carries a bare entity_id with no foreign key, so deleting a
-- project or a task left the notification behind pointing at nothing. One
-- such row existed; clicking it goes nowhere.
create or replace function notifications_forget_entity()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  delete from notifications
  where entity_id = old.id
    and entity_type = tg_argv[0];
  return old;
end;
$$;

drop trigger if exists t9_notifications_forget on projects;
create trigger t9_notifications_forget after delete on projects
  for each row execute function notifications_forget_entity('project');

drop trigger if exists t9_notifications_forget on tasks;
create trigger t9_notifications_forget after delete on tasks
  for each row execute function notifications_forget_entity('task');

-- The one row already stranded, and any other of the same shape.
delete from notifications n
where n.entity_type = 'project'
  and not exists (select 1 from projects p where p.id = n.entity_id);
delete from notifications n
where n.entity_type = 'task'
  and not exists (select 1 from tasks t where t.id = n.entity_id);
