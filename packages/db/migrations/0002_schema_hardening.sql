begin;

-- Tenant metadata and stable tenant-scoped identity.
alter table tenants
  add column if not exists slug text,
  add column if not exists status text not null default 'active' check (status in ('active','suspended','cancelled')),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists tenants_slug_uq on tenants(slug) where slug is not null;

-- Spatial model: the database is the source of coordinates, geometry, and lifecycle.
alter table spatial_nodes
  add column if not exists code text,
  add column if not exists floor_id uuid,
  add column if not exists x double precision,
  add column if not exists y double precision,
  add column if not exists z double precision,
  add column if not exists width double precision not null default 1 check (width > 0),
  add column if not exists height double precision not null default 1 check (height > 0),
  add column if not exists depth double precision not null default 1 check (depth > 0),
  add column if not exists rotation_x double precision not null default 0,
  add column if not exists rotation_y double precision not null default 0,
  add column if not exists rotation_z double precision not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table spatial_nodes drop constraint if exists spatial_nodes_parent_id_fkey;
alter table spatial_nodes
  add constraint spatial_nodes_tenant_id_id_uq unique (tenant_id,id);
alter table spatial_nodes
  add constraint spatial_nodes_parent_tenant_fk
  foreign key (tenant_id,parent_id) references spatial_nodes(tenant_id,id) on delete restrict;
alter table spatial_nodes
  add constraint spatial_nodes_floor_tenant_fk
  foreign key (tenant_id,floor_id) references spatial_nodes(tenant_id,id) on delete restrict;

create index if not exists spatial_nodes_tenant_code_idx on spatial_nodes(tenant_id,code) where deleted_at is null;
create index if not exists spatial_nodes_tenant_name_idx on spatial_nodes(tenant_id,name) where deleted_at is null;
create index if not exists spatial_nodes_tenant_parent_idx on spatial_nodes(tenant_id,parent_id) where deleted_at is null;

-- Add product metadata needed for onboarding without mixing stock truth into product records.
alter table products
  add column if not exists category text,
  add column if not exists image_url text,
  add column if not exists status text not null default 'active'
    check (status in ('active','archived','discontinued','draft')),
  add column if not exists updated_at timestamptz not null default now();

alter table products
  add constraint products_tenant_id_id_uq unique (tenant_id,id);

create unique index if not exists products_barcode_tenant_uq
  on products(tenant_id,barcode) where barcode is not null;
create index if not exists products_tenant_name_idx on products(tenant_id,name) where status <> 'archived';
create index if not exists products_tenant_category_idx on products(tenant_id,category) where status <> 'archived';

-- A placement identifies a physical association; it is never a source of stock quantity.
alter table placements
  add column if not exists status text not null default 'placed'
    check (status in ('placed','missing_location','stale_location','disputed')),
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create unique index if not exists placements_active_product_node_uq
  on placements(tenant_id,product_id,spatial_node_id) where deleted_at is null;
alter table placements drop constraint if exists placements_product_id_fkey;
alter table placements drop constraint if exists placements_spatial_node_id_fkey;
alter table placements
  add constraint placements_product_tenant_fk
  foreign key (tenant_id,product_id) references products(tenant_id,id) on delete restrict;
alter table placements
  add constraint placements_spatial_tenant_fk
  foreign key (tenant_id,spatial_node_id) references spatial_nodes(tenant_id,id) on delete restrict;
alter table placements
  add constraint placements_quantity_not_truth_chk
  check (quantity_source = 'inventory' or quantity_source = 'unknown');

comment on column placements.quantity is
  'Deprecated compatibility field. Application code must never use it as stock truth; inventory_balances is authoritative.';

-- Inventory truth is explicitly represented by a source and an observation.
create table if not exists inventory_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_type text not null,
  name text not null,
  location_ref text,
  status text not null default 'disconnected'
    check (status in ('connected','syncing','delayed','disconnected','error')),
  is_authoritative boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);

create index if not exists inventory_sources_tenant_idx on inventory_sources(tenant_id);

create table if not exists inventory_location_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null,
  spatial_node_id uuid not null,
  external_location_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  unique (tenant_id,source_id,external_location_ref),
  foreign key (tenant_id,source_id) references inventory_sources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,spatial_node_id) references spatial_nodes(tenant_id,id) on delete restrict
);

create index if not exists inventory_location_map_node_idx
  on inventory_location_mappings(tenant_id,spatial_node_id);

create table if not exists inventory_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null,
  product_id uuid not null,
  external_location_ref text not null,
  quantity bigint not null check (quantity >= 0),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id,id),
  unique (tenant_id,source_id,product_id,external_location_ref),
  foreign key (tenant_id,source_id) references inventory_sources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,product_id) references products(tenant_id,id) on delete restrict
);

create index if not exists inventory_balances_product_idx
  on inventory_balances(tenant_id,product_id,observed_at desc)
  where deleted_at is null;
create index if not exists inventory_balances_location_idx
  on inventory_balances(tenant_id,source_id,external_location_ref)
  where deleted_at is null;

create table if not exists inventory_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null,
  external_event_id text not null,
  product_id uuid,
  event_type text not null,
  quantity_before bigint,
  quantity_change bigint,
  quantity_after bigint,
  external_location_ref text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processed','failed','ignored')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id,id),
  unique (tenant_id,source_id,external_event_id),
  foreign key (tenant_id,source_id) references inventory_sources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,product_id) references products(tenant_id,id) on delete set null
);

create index if not exists inventory_events_pending_idx
  on inventory_events(tenant_id,processing_status,received_at);

-- Historical physical moves survive soft deletion of current placements.
create table if not exists placement_history (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  placement_id uuid not null,
  product_id uuid not null,
  old_spatial_node_id uuid,
  new_spatial_node_id uuid,
  actor_user_id uuid,
  source text not null check (source in ('user','barcode','import','connector','ai')),
  reason text,
  occurred_at timestamptz not null default now(),
  foreign key (tenant_id,placement_id) references placements(tenant_id,id) on delete restrict,
  foreign key (tenant_id,product_id) references products(tenant_id,id) on delete restrict,
  foreign key (tenant_id,old_spatial_node_id) references spatial_nodes(tenant_id,id) on delete restrict,
  foreign key (tenant_id,new_spatial_node_id) references spatial_nodes(tenant_id,id) on delete restrict,
  foreign key (tenant_id,actor_user_id) references users(tenant_id,id) on delete set null
);

create index if not exists placement_history_tenant_product_idx
  on placement_history(tenant_id,product_id,occurred_at desc);

-- Make audit data explicit and privacy-aware.
alter table audit_events
  add column if not exists old_data jsonb,
  add column if not exists new_data jsonb,
  add column if not exists request_id text,
  add column if not exists source text not null default 'api';

alter table audit_events
  add constraint audit_events_actor_tenant_fk
  foreign key (tenant_id,actor_user_id) references users(tenant_id,id) on delete set null;

create index if not exists audit_events_tenant_entity_idx
  on audit_events(tenant_id,entity_type,entity_id,created_at desc);

-- PostgreSQL tenant context. The API sets this inside the transaction and RLS reads it.
create schema if not exists app;

create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  raw text;
begin
  raw := current_setting('app.tenant_id', true);
  if raw is null or raw = '' then
    return null;
  end if;
  begin
    return raw::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function app.set_tenant_context(p_tenant_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $$
begin
  if p_tenant_id is null then
    raise exception 'tenant context cannot be null';
  end if;
  perform set_config('app.tenant_id', p_tenant_id::text, true);
end;
$$;

-- RLS must be enforced, not merely enabled. Policies always compare tenant_id to trusted session context.
alter table tenants enable row level security;
alter table tenants force row level security;
alter table users enable row level security;
alter table users force row level security;
alter table spatial_nodes enable row level security;
alter table spatial_nodes force row level security;
alter table products enable row level security;
alter table products force row level security;
alter table placements enable row level security;
alter table placements force row level security;
alter table audit_events enable row level security;
alter table audit_events force row level security;
alter table inventory_sources enable row level security;
alter table inventory_sources force row level security;
alter table inventory_location_mappings enable row level security;
alter table inventory_location_mappings force row level security;
alter table inventory_balances enable row level security;
alter table inventory_balances force row level security;
alter table inventory_events enable row level security;
alter table inventory_events force row level security;
alter table placement_history enable row level security;
alter table placement_history force row level security;

drop policy if exists tenants_isolation on tenants;
create policy tenants_isolation on tenants
  using (id = app.current_tenant_id())
  with check (id = app.current_tenant_id());

drop policy if exists users_isolation on users;
create policy users_isolation on users
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists spatial_nodes_isolation on spatial_nodes;
create policy spatial_nodes_isolation on spatial_nodes
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists products_isolation on products;
create policy products_isolation on products
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists placements_isolation on placements;
create policy placements_isolation on placements
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists audit_events_isolation on audit_events;
create policy audit_events_isolation on audit_events
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists inventory_sources_isolation on inventory_sources;
create policy inventory_sources_isolation on inventory_sources
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists inventory_location_mappings_isolation on inventory_location_mappings;
create policy inventory_location_mappings_isolation on inventory_location_mappings
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists inventory_balances_isolation on inventory_balances;
create policy inventory_balances_isolation on inventory_balances
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists inventory_events_isolation on inventory_events;
create policy inventory_events_isolation on inventory_events
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

drop policy if exists placement_history_isolation on placement_history;
create policy placement_history_isolation on placement_history
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- Runtime role needs only the context function; its table grants are environment-specific.
revoke all on function app.current_tenant_id() from public;
revoke all on function app.set_tenant_context(uuid) from public;

commit;
