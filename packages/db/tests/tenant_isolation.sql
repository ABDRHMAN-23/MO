\set ON_ERROR_STOP on

-- This file is an integration test, not a production migration.
-- It creates a disposable runtime role to prove tenant isolation under FORCE RLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'spatial_runtime_test') then
    create role spatial_runtime_test nologin;
  end if;
end $$;

alter role spatial_runtime_test nosuperuser nobypassrls;
grant usage on schema public, app to spatial_runtime_test;
grant execute on function app.current_tenant_id() to spatial_runtime_test;
grant execute on function app.set_tenant_context(uuid) to spatial_runtime_test;
grant select, insert, update, delete on
  tenants, users, spatial_nodes, products, placements, audit_events,
  inventory_sources, inventory_location_mappings, inventory_balances,
  inventory_events, placement_history
  to spatial_runtime_test;
grant usage, select on all sequences in schema public to spatial_runtime_test;

-- Seed two tenants as the migration/test owner before switching to the runtime role.
insert into tenants (id,name,slug)
values
  ('11111111-1111-4111-8111-111111111111','Tenant A','tenant-a'),
  ('22222222-2222-4222-8222-222222222222','Tenant B','tenant-b')
on conflict (id) do nothing;

set role spatial_runtime_test;

select app.set_tenant_context('11111111-1111-4111-8111-111111111111');

insert into users (tenant_id,external_subject,display_name,role)
values (app.current_tenant_id(),'user-a','A','owner')
on conflict do nothing;

insert into spatial_nodes (tenant_id,node_type,name,code,x,y,z)
values (app.current_tenant_id(),'space','A Space','A',0,0,0);

insert into products (tenant_id,sku,name)
values (app.current_tenant_id(),'A-001','Tenant A Product');

-- A runtime session must never see B.
select 0 as unexpected_rows
where exists (
  select 1 from tenants where id='22222222-2222-4222-8222-222222222222'
)
union all
select 0 where exists (
  select 1 from products where sku='B-001'
);

-- Explicitly crossing the tenant boundary must fail policy checks.
do $$
begin
  begin
    insert into products (tenant_id,sku,name)
    values ('22222222-2222-4222-8222-222222222222','B-001','Should Fail');
    raise exception 'cross-tenant insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select app.set_tenant_context('22222222-2222-4222-8222-222222222222');

insert into products (tenant_id,sku,name)
values (app.current_tenant_id(),'B-001','Tenant B Product');

select count(*)::int = 1 as tenant_b_only
from products
where sku='B-001';

reset role;

-- Keep the test database reusable.
delete from tenants
where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
drop role spatial_runtime_test;
