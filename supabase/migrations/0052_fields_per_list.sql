-- The last rung: a custom field can be scoped to a single list.
--
-- 0051 gave fields a folder. A folder holds lists, and the studio files work
-- by list, so a field that belongs to Client 01 and not to Internal edits had
-- nowhere to live. Four scopes now, a ladder, narrowest wins:
--
--   list        only projects in that list
--   folder      only projects whose list sits in that folder
--   space       everything in that space
--   none        everywhere
--
-- Each rung derives the ones above it. A list knows its folder and its space,
-- a folder knows its space, so the trigger fills them in and the three can
-- never disagree however the row is written. A list sitting directly in a
-- space has no folder, which is why folder_id is cleared rather than left
-- alone in that case: a field on such a list must not inherit a folder it is
-- not in.

alter table project_fields
  add column if not exists list_id uuid references project_lists(id) on delete cascade;

comment on column project_fields.list_id is
  'Narrowest scope. When set, the field only appears on projects in this list.';

create or replace function project_fields_sync_department()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.list_id is not null then
    -- A list carries both, including a null folder when it sits directly in
    -- the space. Taking both from here is what stops a stale folder hanging
    -- on from a previous scope.
    select l.department_id, l.folder_id
      into new.department_id, new.folder_id
    from project_lists l where l.id = new.list_id;
  elsif new.folder_id is not null then
    select f.department_id into new.department_id
    from project_folders f where f.id = new.folder_id;
  end if;
  return new;
end;
$$;
