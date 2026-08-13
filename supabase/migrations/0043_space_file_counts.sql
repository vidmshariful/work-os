-- Attachment counts for every project in one space, in one call.
--
-- WHY. project_file_counts(ids) from 0042 takes project ids, so a page had
-- to finish its projects query before it could ask, which put a whole extra
-- database round trip in front of every space and list render. From this
-- machine a round trip is about 140ms, and that is the difference the user
-- feels. Taking the space instead lets the page ask for counts in the same
-- breath as everything else.
--
-- Same shape and the same visibility predicate as 0042, repeated verbatim
-- because SECURITY DEFINER makes the check this function's own job:
-- workspace member, and the space is one the caller can see. A department the
-- caller cannot open returns no rows at all. app_can_see_department,
-- projects_select and project_lists_select are untouched.

create or replace function project_space_file_counts(dept uuid)
returns table (project_id uuid, files bigint)
language sql security definer stable
set search_path = public, storage as $$
  select p.id, count(o.id)
  from projects p
  left join storage.objects o
    on o.bucket_id = 'project-files'
   and o.name like p.workspace_id::text || '/' || p.id::text || '/%'
  where p.department_id = dept
    and app_is_member(p.workspace_id)
    and app_can_see_department(p.department_id)
  group by p.id;
$$;

revoke all on function project_space_file_counts(uuid) from public;
grant execute on function project_space_file_counts(uuid) to authenticated;
