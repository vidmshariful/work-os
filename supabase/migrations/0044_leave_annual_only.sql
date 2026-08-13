-- Only annual leave draws down the annual allowance.
--
-- THE BUG. leave_after_update added new.days to used_days on every approval,
-- whatever the type. Approve two sick days and the person's twenty annual
-- days became eighteen: being ill was costing holiday. Sick, unpaid and
-- other are recorded and routed exactly as before, they just stop billing
-- the annual balance.
--
-- Verified before writing this: an approved sick request decremented
-- used_days on the live schema. Only the one condition changes; the
-- notifications and the endorsement block are character for character the
-- 0021 version. No policy, no view, and the wall is not involved.

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
  end if;
  return new;
end;
$$;
