-- Project completion, computed once in the database so every surface reads
-- the same number instead of each page aggregating tasks itself.
--
-- A project with sub-projects rolls up: its percentage covers its own tasks
-- plus every descendant's. A leaf project is unchanged, because its rollup
-- columns equal its direct columns when it has no children.
--
-- Sub-projects are capped at one level deep by the trigger added in 0025, so
-- one join over children is a complete rollup. This is written as a lateral
-- over children rather than a recursive CTE for that reason: if the depth cap
-- is ever lifted, this view has to become recursive.
--
-- security_invoker = true, matching v_kpi_person: the reader's own RLS decides
-- which projects and tasks are counted. A project a caller cannot see
-- contributes nothing to their view of a parent, which keeps the number
-- consistent with the rows that caller can actually open.
--
-- Additive only. No table, column, or policy is changed.

create or replace view v_project_progress with (security_invoker = true) as
with task_counts as (
  select
    t.project_id,
    count(*)::int as total,
    count(*) filter (where t.status = 'done')::int as done
  from tasks t
  group by t.project_id
)
select
  p.id as project_id,
  coalesce(own.done, 0)::int  as direct_done,
  coalesce(own.total, 0)::int as direct_total,
  coalesce(kids.child_count, 0)::int as child_count,
  (coalesce(own.done, 0)  + coalesce(kids.done, 0))::int  as rollup_done,
  (coalesce(own.total, 0) + coalesce(kids.total, 0))::int as rollup_total
from projects p
left join task_counts own on own.project_id = p.id
left join lateral (
  select
    count(*)::int              as child_count,
    coalesce(sum(ctc.done), 0)::int  as done,
    coalesce(sum(ctc.total), 0)::int as total
  from projects cp
  left join task_counts ctc on ctc.project_id = cp.id
  where cp.parent_project_id = p.id
) kids on true;

grant select on v_project_progress to authenticated;
