-- Custom fields can be scoped to a folder inside a space, and the ones scoped
-- to nothing are visible again.
--
-- A REGRESSION FIRST. 0047 narrowed project_fields_select from
-- app_is_member(workspace_id) to app_can_see_department(department_id), which
-- was right for a field belonging to a space and wrong for one belonging to
-- none: a workspace-wide field has department_id null, and that helper answers
-- false for null. Three fields the studio actually uses, Project Category,
-- Property and Stage Status, went invisible to everybody including
-- executives. The access test did not catch it because it compared what a
-- person could read against department_id = any(visible), which excludes
-- nulls the same way, so the test agreed with the bug. Fixed here, and the
-- test now asserts the workspace-wide ones explicitly.
--
-- THE FEATURE. A field may now name a folder as well as a space. The three
-- scopes are a ladder, narrowest wins: a folder field appears only on
-- projects filed in that folder, a space field on everything in that space,
-- and a field with neither on everything.

alter table project_fields
  add column if not exists folder_id uuid references project_folders(id) on delete cascade;

comment on column project_fields.folder_id is
  'Narrower than department_id. When set, the field only appears on projects whose list sits in this folder.';

-- A folder belongs to exactly one space, so the space is derivable and must
-- never disagree. Set here rather than trusted from the caller, so the two can
-- not drift however the row is written.
create or replace function project_fields_sync_department()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.folder_id is not null then
    select f.department_id into new.department_id
    from project_folders f where f.id = new.folder_id;
  end if;
  return new;
end;
$$;

drop trigger if exists t1_project_fields_sync on project_fields;
create trigger t1_project_fields_sync before insert or update on project_fields
  for each row execute function project_fields_sync_department();

-- Visible to any member when it belongs to no space, and otherwise to anyone
-- who can see the space it belongs to. A folder field is covered by the same
-- department check, because the trigger above guarantees it carries one.
drop policy if exists project_fields_select on project_fields;
create policy project_fields_select on project_fields for select
  using (
    app_is_member(workspace_id)
    and (department_id is null or app_can_see_department(department_id))
  );
