-- Direct messages between two people in a workspace.
--
-- WHY. The studio runs its day in ClickUp's DMs: "kau direct purchase link
-- chaile eita diyen", a link pasted at 10pm, a reply the next morning.
-- Replacing ClickUp without this means the team keeps ClickUp open for the
-- one thing it is used for most.
--
-- ONE TABLE, NO THREAD ROW. A conversation is just the messages between two
-- people, so there is nothing to keep in sync and no way for a thread and its
-- messages to disagree. The pair is read off sender and recipient.
--
-- THE WALL IS NOT INVOLVED, AND THAT IS DELIBERATE. A message is free text
-- between two members, the same footing as projects.brief, which is already
-- readable below the wall. Nothing here reads clients or v_clients. What a
-- person types into a message is a matter for people, not for SQL: someone
-- can paste a client name into a DM exactly as they can into a project
-- title. This does not widen what anyone can see, because a message is
-- visible only to the two people in it, which is narrower than anything else
-- in the schema.
--
-- app_can_see_department, projects_select and project_lists_select are
-- untouched.

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  -- Set by the recipient when the conversation is on screen. Null is unread,
  -- which is what the badge counts.
  read_at timestamptz
);

alter table direct_messages drop constraint if exists direct_messages_body_len_check;
alter table direct_messages
  add constraint direct_messages_body_len_check
  check (char_length(body) between 1 and 4000);

-- Talking to yourself is a note, not a message, and the app has to-dos for
-- that. Without this the pair logic below has a second case for no reason.
alter table direct_messages drop constraint if exists direct_messages_not_self_check;
alter table direct_messages
  add constraint direct_messages_not_self_check
  check (sender_id <> recipient_id);

-- Reading one conversation, in both directions. Postgres will not use one
-- index for both legs of an OR over different columns, so there are two.
create index if not exists idx_dm_pair_out
  on direct_messages (workspace_id, sender_id, recipient_id, created_at);
create index if not exists idx_dm_pair_in
  on direct_messages (workspace_id, recipient_id, sender_id, created_at);

-- The unread badge, which runs on every page load, so it gets its own
-- partial index rather than scanning a growing table.
create index if not exists idx_dm_unread
  on direct_messages (recipient_id, workspace_id)
  where read_at is null;

alter table direct_messages enable row level security;

-- A message belongs to the two people in it and to nobody else, not even an
-- executive. That is stricter than the rest of the schema on purpose: a
-- private message that a manager can read is not a private message, and
-- nothing in this app needs to read one.
drop policy if exists direct_messages_select on direct_messages;
create policy direct_messages_select on direct_messages for select to authenticated
  using (
    app_is_member(workspace_id)
    and (sender_id = auth.uid() or recipient_id = auth.uid())
  );

-- You may only send as yourself, and only to someone who is actually in this
-- workspace with you. The membership check is what stops a crafted request
-- from filing a message against a stranger's id.
drop policy if exists direct_messages_insert on direct_messages;
create policy direct_messages_insert on direct_messages for insert to authenticated
  with check (
    app_is_member(workspace_id)
    and sender_id = auth.uid()
    and exists (
      select 1 from memberships m
      where m.workspace_id = direct_messages.workspace_id
        and m.profile_id = direct_messages.recipient_id
        and m.is_active
    )
  );

-- Only the recipient marks a message read. The sender cannot mark their own
-- message read on the other person's behalf, which would make the badge lie.
-- Which column may change is enforced in the action, since a policy cannot
-- name columns.
drop policy if exists direct_messages_update on direct_messages;
create policy direct_messages_update on direct_messages for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Unsending is the sender's to do, and only their own words.
drop policy if exists direct_messages_delete on direct_messages;
create policy direct_messages_delete on direct_messages for delete to authenticated
  using (sender_id = auth.uid());

-- Realtime, the same way notifications already arrive. Without this the
-- other person's message only appears on a refresh, which is not messaging.
-- Wrapped because the publication may already carry the table on a re-run.
do $$
begin
  alter publication supabase_realtime add table direct_messages;
exception
  when duplicate_object then null;
end
$$;
