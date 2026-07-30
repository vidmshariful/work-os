-- Lists had a name and an order and nothing else, so a space with several of
-- them reads as an undifferentiated stack of headers. A colour gives each one
-- a handle the eye can find.
--
-- Stored as a palette key, not a hex value. The seven keys are exactly the
-- TagTone set the design system already draws with, so a list cannot be given
-- a colour that has no token behind it, and a future retheme moves the lists
-- with everything else. departments.accent_color predates that palette and
-- still holds hex; this column deliberately does not follow it.
--
-- Null means no colour, which is the honest default for every list that
-- exists today. Nothing about the wall changes: a list name and its colour
-- are internal organisation, carrying no client identity.

alter table project_lists
  add column if not exists color text;

alter table project_lists
  drop constraint if exists project_lists_color_check;

alter table project_lists
  add constraint project_lists_color_check
  check (color is null or color in ('blue', 'violet', 'green', 'amber', 'rose', 'teal', 'gray'));
