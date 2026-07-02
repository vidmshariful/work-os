-- The wall view. The only door to client data. Filters rows by membership,
-- masks commercial columns below the wall. Direct access to the base table
-- is revoked from the application roles.

create view v_clients with (security_invoker = false) as
select
  c.id, c.workspace_id, c.code, c.status, c.owner_id, c.created_at,
  case when app_is_above_wall(c.workspace_id) then c.commercial_name end as commercial_name,
  case when app_is_above_wall(c.workspace_id) then c.contact_name    end as contact_name,
  case when app_is_above_wall(c.workspace_id) then c.contact_email   end as contact_email,
  case when app_is_above_wall(c.workspace_id) then c.origin::text    end as origin,
  case when app_is_above_wall(c.workspace_id) then c.contract_value  end as contract_value
from clients c
where app_is_member(c.workspace_id);

revoke all on clients from anon, authenticated;
revoke all on v_clients from anon;
grant select on v_clients to authenticated;
