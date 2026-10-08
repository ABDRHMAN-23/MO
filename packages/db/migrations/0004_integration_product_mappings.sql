begin;

create table if not exists integration_product_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null,
  external_product_id text not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  unique (tenant_id,source_id,external_product_id),
  foreign key (tenant_id,source_id) references inventory_sources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,product_id) references products(tenant_id,id) on delete restrict
);

create index if not exists integration_product_mappings_product_idx
  on integration_product_mappings(tenant_id,product_id);

alter table integration_product_mappings enable row level security;
alter table integration_product_mappings force row level security;

drop policy if exists integration_product_mappings_isolation on integration_product_mappings;
create policy integration_product_mappings_isolation on integration_product_mappings
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

revoke all on integration_product_mappings from public;

commit;
