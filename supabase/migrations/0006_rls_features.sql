-- RLS for feature tables plus write policies for the core tables.
-- Default posture: contributors write only their own task status and
-- revisions, leads write within their team, executives and domain managers
-- write broadly. Never wider than the phase needs.

alter table project_templates enable row level security;
alter table deliverables      enable row level security;
alter table task_dependencies enable row level security;
alter table task_comments     enable row level security;
alter table task_revisions    enable row level security;
alter table leave_requests    enable row level security;
alter table leave_balances    enable row level security;
alter table notifications     enable row level security;
alter table events            enable row level security;
alter table announcements     enable row level security;
alter table workspace_counters enable row level security;
-- workspace_counters: no policies. Only security definer code touches it.

-- ---- core table writes ----

-- workspaces: executives can rename and retheme their own workspace
create policy workspaces_update on workspaces for update to authenticated
  using (app_archetype(id) = 'executive')
  with check (app_archetype(id) = 'executive');

-- memberships: executives manage the org, including wall_side
create policy memberships_insert on memberships for insert to authenticated
  with check (app_archetype(workspace_id) = 'executive');
create policy memberships_update on memberships for update to authenticated
  using (app_archetype(workspace_id) = 'executive')
  with check (app_archetype(workspace_id) = 'executive');
create policy memberships_delete on memberships for delete to authenticated
  using (app_archetype(workspace_id) = 'executive');

-- projects: executives and domain managers create; owners can update theirs
create policy projects_insert on projects for insert to authenticated
  with check (app_is_manager(workspace_id));
create policy projects_update on projects for update to authenticated
  using (app_is_manager(workspace_id) or owner_id = auth.uid())
  with check (app_is_manager(workspace_id) or owner_id = auth.uid());
create policy projects_delete on projects for delete to authenticated
  using (app_archetype(workspace_id) = 'executive');

-- project phases: managers and leads shape structure
create policy phases_write on project_phases for insert to authenticated
  with check (exists (select 1 from projects p where p.id = project_phases.project_id and app_can_assign(p.workspace_id)));
create policy phases_update on project_phases for update to authenticated
  using (exists (select 1 from projects p where p.id = project_phases.project_id and app_can_assign(p.workspace_id)))
  with check (exists (select 1 from projects p where p.id = project_phases.project_id and app_can_assign(p.workspace_id)));
create policy phases_delete on project_phases for delete to authenticated
  using (exists (select 1 from projects p where p.id = project_phases.project_id and app_can_assign(p.workspace_id)));

-- tasks: leads and up create and assign. Assignees may update their own
-- tasks, and a guard trigger limits contributors to status changes.
create policy tasks_insert on tasks for insert to authenticated
  with check (exists (select 1 from projects p where p.id = tasks.project_id and app_can_assign(p.workspace_id)));
create policy tasks_update on tasks for update to authenticated
  using (
    assignee_id = auth.uid()
    or exists (select 1 from projects p where p.id = tasks.project_id and app_can_assign(p.workspace_id))
  )
  with check (
    assignee_id = auth.uid()
    or exists (select 1 from projects p where p.id = tasks.project_id and app_can_assign(p.workspace_id))
  );
create policy tasks_delete on tasks for delete to authenticated
  using (exists (select 1 from projects p where p.id = tasks.project_id and app_can_assign(p.workspace_id)));

-- ---- feature tables ----

-- templates: members read, managers write
create policy templates_select on project_templates for select to authenticated
  using (app_is_member(workspace_id));
create policy templates_insert on project_templates for insert to authenticated
  with check (app_is_manager(workspace_id));
create policy templates_update on project_templates for update to authenticated
  using (app_is_manager(workspace_id)) with check (app_is_manager(workspace_id));
create policy templates_delete on project_templates for delete to authenticated
  using (app_is_manager(workspace_id));

-- deliverables: members read, leads and up write
create policy deliverables_select on deliverables for select to authenticated
  using (exists (select 1 from projects p where p.id = deliverables.project_id and app_is_member(p.workspace_id)));
create policy deliverables_insert on deliverables for insert to authenticated
  with check (exists (select 1 from projects p where p.id = deliverables.project_id and app_can_assign(p.workspace_id)));
create policy deliverables_update on deliverables for update to authenticated
  using (exists (select 1 from projects p where p.id = deliverables.project_id and app_can_assign(p.workspace_id)))
  with check (exists (select 1 from projects p where p.id = deliverables.project_id and app_can_assign(p.workspace_id)));
create policy deliverables_delete on deliverables for delete to authenticated
  using (exists (select 1 from projects p where p.id = deliverables.project_id and app_can_assign(p.workspace_id)));

-- dependencies: members read, leads and up write
create policy deps_select on task_dependencies for select to authenticated
  using (exists (select 1 from tasks t join projects p on p.id = t.project_id
                 where t.id = task_dependencies.task_id and app_is_member(p.workspace_id)));
create policy deps_insert on task_dependencies for insert to authenticated
  with check (exists (select 1 from tasks t join projects p on p.id = t.project_id
                      where t.id = task_dependencies.task_id and app_can_assign(p.workspace_id)));
create policy deps_delete on task_dependencies for delete to authenticated
  using (exists (select 1 from tasks t join projects p on p.id = t.project_id
                 where t.id = task_dependencies.task_id and app_can_assign(p.workspace_id)));

-- comments: members of the project's workspace, writing as themselves
create policy comments_select on task_comments for select to authenticated
  using (exists (select 1 from tasks t join projects p on p.id = t.project_id
                 where t.id = task_comments.task_id and app_is_member(p.workspace_id)));
create policy comments_insert on task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from tasks t join projects p on p.id = t.project_id
                where t.id = task_comments.task_id and app_is_member(p.workspace_id))
  );
create policy comments_delete on task_comments for delete to authenticated
  using (author_id = auth.uid());

-- revisions: members log them as themselves
create policy revisions_select on task_revisions for select to authenticated
  using (exists (select 1 from tasks t join projects p on p.id = t.project_id
                 where t.id = task_revisions.task_id and app_is_member(p.workspace_id)));
create policy revisions_insert on task_revisions for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (select 1 from tasks t join projects p on p.id = t.project_id
                where t.id = task_revisions.task_id and app_is_member(p.workspace_id))
  );

-- leave requests: own rows, the approver up the line, executives
create policy leave_select on leave_requests for select to authenticated using (
  profile_id = auth.uid()
  or app_archetype(workspace_id) = 'executive'
  or exists (select 1 from memberships m
             where m.workspace_id = leave_requests.workspace_id
               and m.profile_id = leave_requests.profile_id
               and m.reports_to = auth.uid() and m.is_active)
);
create policy leave_insert on leave_requests for insert to authenticated with check (
  profile_id = auth.uid()
  and app_is_member(workspace_id)
  and status = 'pending'
  and lead_approved_by is null
  and decided_by is null
);
create policy leave_update on leave_requests for update to authenticated using (
  profile_id = auth.uid()
  or app_archetype(workspace_id) = 'executive'
  or exists (select 1 from memberships m
             where m.workspace_id = leave_requests.workspace_id
               and m.profile_id = leave_requests.profile_id
               and m.reports_to = auth.uid() and m.is_active)
) with check (app_is_member(workspace_id));

-- leave balances: visible to self, the lead above, executives. Writes are
-- system-side (approval trigger) or executive adjustments.
create policy balances_select on leave_balances for select to authenticated using (
  profile_id = auth.uid()
  or app_archetype(workspace_id) = 'executive'
  or exists (select 1 from memberships m
             where m.workspace_id = leave_balances.workspace_id
               and m.profile_id = leave_balances.profile_id
               and m.reports_to = auth.uid() and m.is_active)
);
create policy balances_insert on leave_balances for insert to authenticated
  with check (app_archetype(workspace_id) = 'executive');
create policy balances_update on leave_balances for update to authenticated
  using (app_archetype(workspace_id) = 'executive')
  with check (app_archetype(workspace_id) = 'executive');

-- notifications: mine only. Inserts are system-side (triggers, admin client).
create policy notifications_select on notifications for select to authenticated
  using (profile_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notifications_delete on notifications for delete to authenticated
  using (profile_id = auth.uid());

-- events: members read, leads and up manage
create policy events_select on events for select to authenticated
  using (app_is_member(workspace_id));
create policy events_insert on events for insert to authenticated
  with check (app_can_assign(workspace_id) and created_by = auth.uid());
create policy events_update on events for update to authenticated
  using (app_can_assign(workspace_id))
  with check (app_can_assign(workspace_id));
create policy events_delete on events for delete to authenticated
  using (created_by = auth.uid() or app_archetype(workspace_id) = 'executive');

-- announcements: members read, managers post
create policy announcements_select on announcements for select to authenticated
  using (app_is_member(workspace_id));
create policy announcements_insert on announcements for insert to authenticated
  with check (app_is_manager(workspace_id) and created_by = auth.uid());
create policy announcements_delete on announcements for delete to authenticated
  using (created_by = auth.uid() or app_archetype(workspace_id) = 'executive');
