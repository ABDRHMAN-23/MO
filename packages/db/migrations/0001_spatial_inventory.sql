create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  external_subject text not null,
  display_name text,
  role text not null check (role in ('owner','admin','operator','viewer')),
  created_at timestamptz not null default now(),
  unique (tenant_id, external_subject)
);

create table if not exists spatial_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  parent_id uuid references spatial_nodes(id) on delete cascade,
  node_type text not null check (node_type in ('space','floor','zone','rack','shelf','bin')),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists spatial_nodes_tenant_parent_idx on spatial_nodes(tenant_id, parent_id);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  barcode text,
  created_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index if not exists products_barcode_idx on products(tenant_id, barcode);

create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  spatial_node_id uuid not null references spatial_nodes(id) on delete cascade,
  quantity integer,
  quantity_source text not null default 'inventory' check (quantity_source in ('inventory','unknown')),
  created_at timestamptz not null default now()
);

create index if not exists placements_spatial_idx on placements(tenant_id, spatial_node_id);
create index if not exists placements_product_idx on placements(tenant_id, product_id);

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_time_idx on audit_events(tenant_id, created_at desc);

alter table users enable row level security;
alter table spatial_nodes enable row level security;
alter table products enable row level security;
alter table placements enable row level security;
alter table audit_events enable row level security;

-- Production deployments must bind app.tenant_id to the authenticated tenant
-- in a transaction/session before querying tenant-scoped tables.
