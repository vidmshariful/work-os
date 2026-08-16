-- An executive can file leave for a teammate, and cancelling approved leave
-- gives the days back.
--
-- WHY. Leave could only ever be filed by the person taking it, so an
-- executive recording somebody's already agreed time off had no way to do it.
-- And there was a hole underneath that: leave_after_update added days to
-- used_days on approval and nothing ever took them off again. Approve three
-- days and cancel them and the person was still three days down. Proved on
-- the live schema before writing this, in a transaction that was rolled back:
-- used_days went 3 to 6 on approval, stayed 6 on cancel, and stayed 6 after
-- the row was deleted outright.
--
-- WHAT CHANGES IN EXISTING RLS, asked for and approved. leave_insert gains an
-- executive branch. leave_select and leave_update are untouched: an executive
-- could already read and decide anything through them. No delete policy is
-- added, because removing a record cancels it rather than erasing it, so
-- nothing needs the privilege. Departments, projects, app_can_see_department
-- and projects_select are not involved.

-- ---- filing for someone else ----------------------------------------------

-- The first branch is the 0021 wording, character for character: the person
-- filing for themselves still has to start pending, unendorsed and undecided.
-- The second lets an executive file for anyone in the workspace, at whatever
-- status they are recording, which is how already agreed leave gets written
-- down after the fact.
drop policy if exists leave_insert on leave_requests;
create policy leave_insert on leave_requests for insert
  with check (
    (
      profile_id = auth.uid()
      and app_is_member(workspace_id)
      and status = 'pending'
      and lead_approved_by is null
      and decided_by is null
    )
    or app_archetype(workspace_id) = 'executive'
  );

-- Who wrote the row down, when it was not the person taking the leave. Null
-- for anything somebody filed themselves, which is every row that exists
-- today, so the column reads as "filed on their behalf by".
alter table leave_requests add column if not exists filed_by uuid references profiles(id) on delete set null;

-- ---- the balance comes back ------------------------------------------------

-- Two changes from 0044. Approval still only spends the allowance for annual
-- leave. Leaving the approved state now refunds it, so a cancelled or
-- reversed approval returns the days rather than quietly costing them. The
-- endorsement notification and the decision notifications are the 0044 text.
create or replace function leave_after_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  requester_name text;
begin
  -- lead endorsement moves it to the final gate: the Operations Manager
  if new.lead_approved_at is not null and old.lead_approved_at is null
     and new.status = 'pending' then
    select full_name into requester_name from profiles where id = new.profile_id;
    perform notify_user(m.profile_id, new.workspace_id, 'leave_endorsed',
      'Leave request awaiting final approval',
      coalesce(requester_name, 'A teammate') || ', ' || new.start_date::text || ' to ' || new.end_date::text,
      'leave_request', new.id)
    from memberships m
    where m.workspace_id = new.workspace_id
      and m.archetype = 'executive' and m.is_active;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      -- Annual is the only type that spends the allowance.
      if new.type = 'annual' then
        insert into leave_balances (workspace_id, profile_id, year, used_days)
        values (new.workspace_id, new.profile_id, extract(year from new.start_date)::int, new.days)
        on conflict (workspace_id, profile_id, year)
        do update set used_days = leave_balances.used_days + excluded.used_days;
      end if;
      perform notify_user(new.profile_id, new.workspace_id, 'leave_decided',
        'Leave approved',
        new.start_date::text || ' to ' || new.end_date::text, 'leave_request', new.id);
    elsif new.status = 'rejected' then
      perform notify_user(new.profile_id, new.workspace_id, 'leave_decided',
        'Leave rejected',
        coalesce(new.decision_note, new.start_date::text || ' to ' || new.end_date::text),
        'leave_request', new.id);
    end if;

    -- Whatever it became, if it was approved annual leave a moment ago the
    -- days go back. greatest() keeps a balance that was edited underneath
    -- this from going negative.
    if old.status = 'approved' and old.type = 'annual' then
      update leave_balances
      set used_days = greatest(0, used_days - old.days)
      where workspace_id = old.workspace_id
        and profile_id = old.profile_id
        and year = extract(year from old.start_date)::int;
    end if;

    if new.status = 'cancelled' and old.status = 'approved' then
      perform notify_user(new.profile_id, new.workspace_id, 'leave_decided',
        'Approved leave cancelled',
        new.start_date::text || ' to ' || new.end_date::text, 'leave_request', new.id);
    end if;
  end if;
  return new;
end;
$$;

-- A row deleted outright would leave the days spent with nothing to reverse
-- it. Nobody can delete through the application, since there is no delete
-- policy, but the service role and psql can, and the accounting should hold
-- for them too.
create or replace function leave_after_delete()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.status = 'approved' and old.type = 'annual' then
    update leave_balances
    set used_days = greatest(0, used_days - old.days)
    where workspace_id = old.workspace_id
      and profile_id = old.profile_id
      and year = extract(year from old.start_date)::int;
  end if;
  return old;
end;
$$;

drop trigger if exists t4_leave_after_delete on leave_requests;
create trigger t4_leave_after_delete after delete on leave_requests
  for each row execute function leave_after_delete();

-- ---- what an executive may do to a request ---------------------------------

-- The executive branch is the only one that changes: it used to stamp the
-- decision on a pending row and wave everything else through unexamined.
-- Cancelling an approved request is now stamped the same way, so the record
-- says who reversed it. Every other branch, the requester's, the lead's, and
-- the final raise, is the wording that was already there.
create or replace function leave_guard_transitions()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  is_lead_of boolean;
begin
  if auth.uid() is null then return new; end if;  -- service role paths

  if app_archetype(new.workspace_id) = 'executive' then
    if old.status = 'pending' and new.status in ('approved','rejected') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif old.status = 'approved' and new.status = 'cancelled' then
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
    return new;
  end if;

  if new.profile_id = auth.uid() then
    if old.status = 'pending' and new.status = 'cancelled'
       and new.lead_approved_by is not distinct from old.lead_approved_by
       and new.decided_by is not distinct from old.decided_by then
      return new;
    end if;
    raise exception 'A request can only be cancelled while pending';
  end if;

  select exists(
    select 1 from memberships m
    where m.workspace_id = new.workspace_id
      and m.profile_id = new.profile_id
      and m.reports_to = auth.uid() and m.is_active
  ) into is_lead_of;

  if is_lead_of then
    if old.status = 'pending' and new.status = 'pending'
       and old.lead_approved_at is null and new.lead_approved_by = auth.uid() then
      new.lead_approved_at := now();
      return new;
    end if;
    if old.status = 'pending' and new.status = 'rejected' then
      new.decided_by := auth.uid();
      new.decided_at := now();
      return new;
    end if;
    raise exception 'Leads endorse or reject pending requests';
  end if;

  raise exception 'Not allowed';
end;
$$;

-- ---- who hears about a row filed for them ----------------------------------

-- A request an executive writes down as already approved should not ask the
-- person's lead to endorse something that is settled. It tells the person
-- instead, which is the only news in it. Anything filed the normal way, still
-- pending, routes exactly as it did.
create or replace function leave_after_insert()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  approver uuid;
  requester_name text;
begin
  if new.status <> 'pending' then
    perform notify_user(new.profile_id, new.workspace_id, 'leave_decided',
      case when new.status = 'approved' then 'Leave recorded for you'
           else 'A leave record was added for you' end,
      new.start_date::text || ' to ' || new.end_date::text || ', ' || new.days || ' days',
      'leave_request', new.id);
    return new;
  end if;

  select m.reports_to into approver from memberships m
    where m.workspace_id = new.workspace_id and m.profile_id = new.profile_id and m.is_active;
  select full_name into requester_name from profiles where id = new.profile_id;
  if approver is not null then
    perform notify_user(
      approver, new.workspace_id, 'leave_requested',
      'Leave request from ' || coalesce(requester_name, 'a teammate'),
      new.start_date::text || ' to ' || new.end_date::text || ', ' || new.days || ' days',
      'leave_request', new.id
    );
  else
    -- top of the line: route straight to executives
    perform notify_user(m.profile_id, new.workspace_id, 'leave_requested',
      'Leave request from ' || coalesce(requester_name, 'a teammate'),
      new.start_date::text || ' to ' || new.end_date::text || ', ' || new.days || ' days',
      'leave_request', new.id)
    from memberships m
    where m.workspace_id = new.workspace_id and m.archetype = 'executive' and m.is_active;
  end if;
  return new;
end;
$$;

-- An insert that already says approved has to spend the allowance, because
-- the update trigger that normally does it never runs for a row that was born
-- approved.
create or replace function leave_after_insert_balance()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'approved' and new.type = 'annual' then
    insert into leave_balances (workspace_id, profile_id, year, used_days)
    values (new.workspace_id, new.profile_id, extract(year from new.start_date)::int, new.days)
    on conflict (workspace_id, profile_id, year)
    do update set used_days = leave_balances.used_days + excluded.used_days;
  end if;
  return new;
end;
$$;

drop trigger if exists t5_leave_after_insert_balance on leave_requests;
create trigger t5_leave_after_insert_balance after insert on leave_requests
  for each row execute function leave_after_insert_balance();
