-- A space icon can now be a named icon, not only an emoji.
--
-- 0036 allowed 1 to 8 characters, which fits an emoji and nothing else. In
-- practice nobody typed one, because typing an emoji into a text box is a
-- worse affordance than picking from a set, so every space fell through to
-- the letter fallback and the sidebar was a column of monograms.
--
-- The column now accepts either form:
--   an emoji, as before, still 1 to 8 characters
--   a lucide icon name, lowercase kebab, such as megaphone or trending-up
--
-- Which one it is, is decided by the renderer: SpaceGlyph looks the value up
-- in the SPACE_ICONS map and draws that icon when it hits, otherwise draws
-- the value as text. Two forms in one column is the pragmatic choice here
-- because both mean exactly the same thing to a reader, "the picture for
-- this space", and splitting them into two columns would put the app in the
-- position of deciding which one wins when both are set.
--
-- 40 characters is well past the longest name in the set and still short
-- enough that the column cannot become a place to paste things.
--
-- No policy changes. departments_update is unchanged, and an icon carries no
-- client identity, so the wall is untouched.

alter table departments
  drop constraint if exists departments_icon_len_check;

alter table departments
  add constraint departments_icon_len_check
  check (icon is null or char_length(icon) between 1 and 40);
