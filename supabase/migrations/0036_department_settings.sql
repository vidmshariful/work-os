-- A space had a name, a slug, an accent colour, and nothing else to say for
-- itself. The settings panel needs three more things, and all three are
-- properties of the space rather than of anything inside it.
--
-- description: one line about what the space is for, shown on the index card
-- and under the space title. Null and empty both mean "nothing to say".
--
-- icon: a single emoji. Null falls back to the first letter of the name,
-- which is what every surface already draws today, so existing spaces look
-- exactly as they did. Capped at 8 characters because a multi-codepoint
-- emoji with a skin tone or a zero-width joiner can be several code units,
-- and the cap is there to stop a paragraph being pasted in, not to count
-- glyphs.
--
-- archived_at: when the space was archived, null while it is active.
-- Archiving is a UI-level state, not a permission: it removes the space from
-- the sidebar and the index so it stops competing for attention, and the page
-- itself still loads with a banner. Nothing here touches
-- app_can_see_department or any policy, so who can see a space is decided in
-- exactly the same place it was before.
--
-- Wall note: a space name, description, and icon are internal organisation
-- and carry no client identity, which is the same footing the name and
-- accent colour were already on.

alter table departments
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists archived_at timestamptz;

alter table departments
  drop constraint if exists departments_icon_len_check;

alter table departments
  add constraint departments_icon_len_check
  check (icon is null or char_length(icon) between 1 and 8);

alter table departments
  drop constraint if exists departments_description_len_check;

alter table departments
  add constraint departments_description_len_check
  check (description is null or char_length(description) <= 280);

-- The default space is where createProject files work that names no space,
-- so it has to stay reachable. deleteDepartment already refuses to remove it;
-- this says the same thing about archiving, in the one place that cannot be
-- talked out of it.
alter table departments
  drop constraint if exists departments_default_not_archived_check;

alter table departments
  add constraint departments_default_not_archived_check
  check (not (is_default and archived_at is not null));

-- Archived spaces drop out of the index and the sidebar, which both read in
-- sort_order within a workspace.
create index if not exists idx_departments_active
  on departments (workspace_id, sort_order)
  where archived_at is null;
