-- KPI as SQL views, never tables. Metrics are computed from work already
-- flowing through the system. security_invoker means the reader's own RLS
-- applies underneath, so these views never widen access.

create view v_kpi_person with (security_invoker = true) as
select
  p.workspace_id,
  t.assignee_id as profile_id,
  count(*) filter (where t.status = 'done') as tasks_completed,
  count(*) filter (where t.status not in ('done')) as tasks_open,
  count(*) filter (where t.status = 'done' and t.completed_at > now() - interval '30 days') as completed_30d,
  round(avg(t.completed_at::date - t.created_at::date) filter (where t.status = 'done'), 1) as avg_cycle_days,
  round(
    (count(*) filter (where t.status = 'done' and t.due_date is not null and t.completed_at::date <= t.due_date))::numeric
    / nullif(count(*) filter (where t.status = 'done' and t.due_date is not null), 0), 3
  ) as on_time_rate,
  coalesce(sum(t.revision_count), 0) as revisions_total,
  round(
    (sum(t.revision_count) filter (where t.status = 'done'))::numeric
    / nullif(count(*) filter (where t.status = 'done'), 0), 2
  ) as revision_rate
from tasks t
join projects p on p.id = t.project_id
where t.assignee_id is not null
group by p.workspace_id, t.assignee_id;

-- Rollup that follows reports_to. Each manager row aggregates their whole
-- subtree, self included. union (not union all) breaks reporting cycles.
create view v_kpi_rollup with (security_invoker = true) as
with recursive chain as (
  select m.workspace_id, m.profile_id as manager_id, m.profile_id as report_id
  from memberships m where m.is_active
  union
  select c.workspace_id, c.manager_id, m.profile_id
  from chain c
  join memberships m
    on m.workspace_id = c.workspace_id and m.reports_to = c.report_id and m.is_active
)
select
  c.workspace_id,
  c.manager_id,
  count(distinct c.report_id) - 1 as reports_count,
  coalesce(sum(k.tasks_completed), 0) as tasks_completed,
  coalesce(sum(k.tasks_open), 0) as tasks_open,
  coalesce(sum(k.completed_30d), 0) as completed_30d,
  round(avg(k.avg_cycle_days), 1) as avg_cycle_days,
  round(avg(k.on_time_rate), 3) as on_time_rate,
  coalesce(sum(k.revisions_total), 0) as revisions_total,
  round(avg(k.revision_rate), 2) as revision_rate
from chain c
left join v_kpi_person k
  on k.workspace_id = c.workspace_id and k.profile_id = c.report_id
group by c.workspace_id, c.manager_id;

revoke all on v_kpi_person from anon;
revoke all on v_kpi_rollup from anon;
grant select on v_kpi_person, v_kpi_rollup to authenticated;
