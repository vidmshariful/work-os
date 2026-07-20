-- Ensure every owner who already had stages (created before 0023, so the seed
-- skipped them) has exactly one default and one done stage. Without this, the
-- checkbox <-> done coupling has no target for those users.

do $$
declare g record;
begin
  for g in select distinct profile_id, workspace_id from todo_stages loop
    if not exists (
      select 1 from todo_stages
      where profile_id = g.profile_id and workspace_id = g.workspace_id and is_default
    ) then
      update todo_stages set is_default = true where id = (
        select id from todo_stages
        where profile_id = g.profile_id and workspace_id = g.workspace_id
        order by sort_order limit 1
      );
    end if;
    if not exists (
      select 1 from todo_stages
      where profile_id = g.profile_id and workspace_id = g.workspace_id and is_done
    ) then
      update todo_stages set is_done = true where id = (
        select id from todo_stages
        where profile_id = g.profile_id and workspace_id = g.workspace_id
        order by sort_order desc limit 1
      );
    end if;
  end loop;
end $$;
