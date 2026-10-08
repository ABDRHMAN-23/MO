\set ON_ERROR_STOP on

-- Disposable integration test. It runs as a non-superuser runtime role.
do $bootstrap$
begin
  if not exists (select 1 from pg_roles where rolname = 'spatial_runtime_test') then
    create role spatial_runtime_test nologin;
  end if;
end
$bootstrap$;

alter role spatial_runtime_test nosuperuser nobypassrls;
grant usage on schema public, app to spatial_runtime_test;
grant execute on function app.current_tenant_id() to spatial_runtime_test;
grant execute on function app.set_tenant_context(uuid) to spatial_runtime_test;
grant select, insert, update, delete on
  tenants, users, spatial_nodes, products, placements, audit_events,
  inventory_sources, inventory_location_mappings, inventory_balances,
  inventory_events, placement_history, integration_connections,
  integration_locations, integration_product_mappings, integration_sync_runs
  to spatial_runtime_test;
grant usage, select on all sequences in schema public to spatial_runtime_test;

insert into tenants (id,name,slug)
values
  ('11111111-1111-4111-8111-111111111111','Tenant A','tenant-a'),
  ('22222222-2222-4222-8222-222222222222','Tenant B','tenant-b')
on conflict (id) do nothing;

set role spatial_runtime_test;

begin;
select app.set_tenant_context('11111111-1111-4111-8111-111111111111');

do $search_assert$
begin
  if app.normalize_search_text('أَكْسِير  ديور ـ') <> 'اكسير ديور' then
    raise exception 'Arabic search normalization regression';
  end if;
end
$search_assert$;

insert into users (tenant_id,external_subject,display_name,role)
values (app.current_tenant_id(),'user-a','A','owner')
on conflict do nothing;

insert into spatial_nodes (tenant_id,node_type,name,code,x,y,z)
values (app.current_tenant_id(),'space','A Space','A',0,0,0);

insert into products (tenant_id,sku,name)
values (app.current_tenant_id(),'A-001','Tenant A Product');

insert into integration_connections
  (tenant_id,provider_type,name,base_url,encrypted_secret)
values
  (app.current_tenant_id(),'odoo','A Odoo','https://odoo.example.test','test-ciphertext');

insert into integration_sync_runs
  (tenant_id,integration_id,source_id,provider_type,status)
select app.current_tenant_id(),c.id,s.id,'odoo','succeeded'
from integration_connections c
join inventory_sources s on s.connection_id=c.id
where c.name='A Odoo';

do $assert$
begin
  if exists (select 1 from tenants where id='22222222-2222-4222-8222-222222222222') then
    raise exception 'tenant isolation failure: tenant A can read tenant B';
  end if;
  if exists (select 1 from products where sku='B-001') then
    raise exception 'tenant isolation failure: tenant A can read tenant B product';
  end if;
  if exists (select 1 from integration_sync_runs r join integration_connections c on c.id=r.integration_id where c.name='B Odoo') then
    raise exception 'tenant A can read tenant B sync run';
  end if;
end
$assert$;

do $cross_insert$
begin
  begin
    insert into products (tenant_id,sku,name)
    values ('22222222-2222-4222-8222-222222222222','B-001','Should Fail');
    raise exception 'cross-tenant insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into integration_connections
      (tenant_id,provider_type,name,base_url,encrypted_secret)
    values
      ('22222222-2222-4222-8222-222222222222','odoo','B Odoo','https://odoo.example.test','test');
    raise exception 'cross-tenant integration insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into integration_sync_runs
      (tenant_id,integration_id,source_id,provider_type,status)
    select '22222222-2222-4222-8222-222222222222',c.id,s.id,'odoo','running'
    from integration_connections c
    join inventory_sources s on s.connection_id=c.id
    where c.name='A Odoo';
    raise exception 'cross-tenant sync run insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$cross_insert$;

commit;

begin;
select app.set_tenant_context('22222222-2222-4222-8222-222222222222');

do $tenant_b_visibility$
begin
  if exists (select 1 from integration_connections where name='A Odoo') then
    raise exception 'tenant B can read tenant A integration';
  end if;
end
$tenant_b_visibility$;

insert into products (tenant_id,sku,name)
values (app.current_tenant_id(),'B-001','Tenant B Product');

insert into integration_connections
  (tenant_id,provider_type,name,base_url,encrypted_secret)
values
  (app.current_tenant_id(),'odoo','B Odoo','https://odoo.example.test','test-ciphertext');

do $tenant_b$
begin
  if not exists (select 1 from products where sku='B-001') then
    raise exception 'tenant B runtime session cannot see its own product';
  end if;
  if not exists (select 1 from integration_connections where name='B Odoo') then
    raise exception 'tenant B runtime session cannot see its own integration';
  end if;
  if not exists (select 1 from integration_sync_runs r join integration_connections c on c.id=r.integration_id where c.name='B Odoo') then
    raise exception 'tenant B runtime session cannot see its own sync run';
  end if;
end
$tenant_b$;

commit;
reset role;

delete from tenants
where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');

drop owned by spatial_runtime_test;
drop role spatial_runtime_test;
