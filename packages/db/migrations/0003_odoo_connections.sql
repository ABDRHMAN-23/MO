begin;

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_type text not null check (provider_type in ('odoo')),
  name text not null,
  base_url text not null,
  provider_database text,
  encrypted_secret text not null,
  secret_version text not null default 'v1',
  enabled boolean not null default true,
  last_healthcheck_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);

create index if not exists integration_connections_tenant_idx
  on integration_connections(tenant_id,provider_type);

alter table inventory_sources
  add column if not exists connection_id uuid;

alter table inventory_sources
  add constraint inventory_sources_connection_tenant_fk
  foreign key (tenant_id,connection_id)
  references integration_connections(tenant_id,id)
  on delete set null;

create table if not exists integration_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  connection_id uuid not null,
  external_location_id text not null,
  parent_external_location_id text,
  name text not null,
  complete_name text,
  usage text,
  active boolean not null default true,
  raw_metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (tenant_id,id),
  unique (tenant_id,connection_id,external_location_id),
  foreign key (tenant_id,connection_id) references integration_connections(tenant_id,id) on delete cascade
);

create index if not exists integration_locations_tenant_conn_idx
  on integration_locations(tenant_id,connection_id,name);

alter table inventory_balances
  alter column quantity type numeric(20,4)
  using quantity::numeric(20,4);

alter table integration_connections enable row level security;
alter table integration_connections force row level security;
alter table integration_locations enable row level security;
alter table integration_locations force row level security;

drop policy if exists integration_connections_isolation on integration_connections;
create policy integration_connections_isolation on integration_connections
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists integration_locations_isolation on integration_locations;
create policy integration_locations_isolation on integration_locations
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

revoke all on integration_connections from public;
revoke all on integration_locations from public;

commit;
