-- Fixes a pre-existing bug: ExotelWebhookService#resolveTenantId already calls this function,
-- but it existed in no migration and not in rls.sql — every real inbound Exotel call 500'd.
create or replace function resolve_tenant_by_virtual_number(p_number text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from numbers where number = p_number limit 1
$$;
revoke execute on function resolve_tenant_by_virtual_number(text) from public;
grant execute on function resolve_tenant_by_virtual_number(text) to astronomiq_app;
