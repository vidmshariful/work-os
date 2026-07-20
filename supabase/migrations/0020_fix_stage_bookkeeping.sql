-- Fix: clients_stage_bookkeeping() still referenced new.intake_status (and the
-- intake_* timestamp columns), all of which 0012 dropped when intake moved to
-- the project level. Since it is a BEFORE UPDATE trigger, every client update
-- (edits, stage changes, and the handoff's kickoff_done write) raised
-- "record new has no field intake_status". Drop the obsolete intake block and
-- keep the stage bookkeeping. Intake is now handled per project.
-- Discovered while verifying the D4 handoff -> department trigger.

create or replace function clients_stage_bookkeeping()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  actor text;
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    select full_name into actor from profiles where id = auth.uid();
    perform log_client_activity(
      new.id,
      coalesce(actor, 'The system') || ' moved this client to ' ||
        case new.stage
          when 'onboard' then 'Onboard'
          when 'active' then 'Active'
          when 'blocked' then 'Blocked'
          when 'blacklist' then 'Black list'
          when 'done' then 'Done'
        end,
      jsonb_build_object('from', old.stage, 'to', new.stage)
    );
  end if;
  return new;
end;
$$;
