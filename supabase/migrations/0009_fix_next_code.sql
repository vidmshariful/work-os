-- Fix: inside next_code, the ON CONFLICT target (workspace_id, kind) was
-- ambiguous between the column and the function parameter named kind.
-- use_column resolves identifiers to columns wherever a column is in scope;
-- in VALUES no column is in scope, so the parameters still apply there.

create or replace function next_code(ws uuid, kind text)
returns text language plpgsql security definer
set search_path = public as $$
#variable_conflict use_column
declare
  n int;
  prefix text;
begin
  prefix := case kind
    when 'client' then 'CLT'
    when 'project' then 'PRJ'
    else upper(left(kind, 3))
  end;
  insert into workspace_counters (workspace_id, kind, value)
  values (ws, kind, 1001)
  on conflict (workspace_id, kind)
  do update set value = workspace_counters.value + 1
  returning value into n;
  return prefix || '-' || n::text;
end;
$$;
