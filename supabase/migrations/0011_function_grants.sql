-- Harden function grants. Postgres grants EXECUTE to PUBLIC on new
-- functions, so revoking from anon/authenticated alone is not airtight:
-- those roles inherit PUBLIC. Revoke from PUBLIC and grant back exactly
-- what each caller needs.
--
-- next_code stays executable by authenticated: the project creation action
-- calls it under the user client, and RLS still gates the insert itself.
-- The RLS helper functions stay PUBLIC: policies evaluate them as the
-- querying user.

revoke execute on function notify_user(uuid, uuid, text, text, text, text, uuid) from public;
revoke execute on function log_client_activity(uuid, text, jsonb) from public;
revoke execute on function scaffold_kickoff_project(uuid) from public;

-- The admin path (service role) drives manual kickoffs.
grant execute on function scaffold_kickoff_project(uuid) to service_role;
-- Trigger functions owned by postgres keep working: the owner always may.
