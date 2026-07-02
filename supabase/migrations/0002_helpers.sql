-- Helper functions. Security definer so they read memberships without RLS
-- recursion. These are the primitives every policy builds on.

create or replace function app_is_member(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(select 1 from memberships m
    where m.profile_id = auth.uid() and m.workspace_id = ws and m.is_active);
$$;

create or replace function app_is_above_wall(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(select 1 from memberships m
    where m.profile_id = auth.uid() and m.workspace_id = ws
      and m.wall_side = 'above' and m.is_active);
$$;

create or replace function app_archetype(ws uuid)
returns archetype_type language sql security definer stable
set search_path = public as $$
  select m.archetype from memberships m
    where m.profile_id = auth.uid() and m.workspace_id = ws and m.is_active limit 1;
$$;

-- True when the current user may create and assign tasks in the workspace.
create or replace function app_can_assign(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select app_archetype(ws) in ('executive','domain_manager','team_lead');
$$;

-- True when the current user manages work broadly in the workspace.
create or replace function app_is_manager(ws uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select app_archetype(ws) in ('executive','domain_manager');
$$;

-- Auto-create a profile whenever an auth user is created.
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
