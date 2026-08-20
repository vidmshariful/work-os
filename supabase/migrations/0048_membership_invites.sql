-- Remember that a membership began as an invitation.
--
-- WHY. Adding somebody meant an executive inventing a temporary password and
-- passing it along by hand, which is both a chore and a bad habit: the
-- password travels through a chat message and often stays unchanged. An
-- invitation instead lets the person set their own, and the People screen can
-- show who has accepted and who is still outstanding.
--
-- Whether an invitation has been accepted is not stored here. That fact lives
-- in auth.users.last_sign_in_at, which is the truth, and duplicating it would
-- give two answers that can disagree. These two columns record only what this
-- app knows and auth does not: when the invitation was sent, and by whom.
--
-- No policy changes. memberships already has its four, and every write to
-- these columns goes through the service role in a server action that has
-- checked the caller is an executive.

alter table memberships add column if not exists invited_at timestamptz;
alter table memberships add column if not exists invited_by uuid references profiles(id) on delete set null;

comment on column memberships.invited_at is
  'When the invitation was sent. Null for the seeded team, who never had one.';
comment on column memberships.invited_by is
  'The executive who sent it. Set null if that person is later removed.';
