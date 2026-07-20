-- Fix: departments_select used app_can_see_department(id), which re-queries the
-- departments table for the row's own id. During INSERT ... RETURNING that
-- subquery cannot see the row being inserted (it is not yet in a visible
-- snapshot), so RETURNING was rejected for executives creating a department.
-- Reference the row's own workspace_id directly for the executive check. This
-- is behavior-identical to app_can_see_department but does not self-query, so
-- INSERT ... RETURNING works. Member-based visibility is unchanged.

drop policy departments_select on departments;
create policy departments_select on departments for select to authenticated
  using (
    app_archetype(workspace_id) = 'executive'
    or exists (
      select 1 from department_members dm
      where dm.department_id = departments.id and dm.profile_id = auth.uid()
    )
  );
