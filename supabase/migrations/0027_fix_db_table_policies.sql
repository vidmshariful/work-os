-- Fix, applying the lesson from 0021: a policy on db_tables must not call a
-- helper that re-queries db_tables for the row's own id. During
-- INSERT ... RETURNING (and UPDATE ... RETURNING) that subquery cannot see the
-- row being written, so the write is rejected. Reference the row's own columns
-- instead. The child tables (fields, rows, shares) still use the helpers,
-- which is safe because they query a different table.

drop policy db_tables_select on db_tables;
create policy db_tables_select on db_tables for select to authenticated
  using (
    owner_id = auth.uid()
    or (scope = 'company' and app_is_member(workspace_id))
    or exists (
      select 1 from db_shares s
      where s.table_id = db_tables.id and s.profile_id = auth.uid()
    )
  );

drop policy db_tables_update on db_tables;
create policy db_tables_update on db_tables for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from db_shares s
      where s.table_id = db_tables.id and s.profile_id = auth.uid() and s.can_edit
    )
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from db_shares s
      where s.table_id = db_tables.id and s.profile_id = auth.uid() and s.can_edit
    )
    or (scope = 'company' and app_archetype(workspace_id) in ('executive','domain_manager'))
  );
