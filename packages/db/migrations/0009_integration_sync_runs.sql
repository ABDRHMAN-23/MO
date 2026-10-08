begin;

create table if not exists integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  integration_id uuid not null,
  source_id uuid not null,
  provider_type text not null,
  triggered_by text not null default 'manual'
    check (triggered_by in ('manual','schedule','webhook','retry','system')),
  status text not null default 'running'
    check (status in ('pending','running','succeeded','failed')),
  attempt integer not null default 1 check (attempt > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  products_seen integer not null default 0 check (products_seen >= 0),
  products_created integer not null default 0 check (products_created >= 0),
  products_updated integer not null default 0 check (products_updated >= 0),
  locations_seen integer not null default 0 check (locations_seen >= 0),
  locations_upserted integer not null default 0 check (locations_upserted >= 0),
  stock_rows integer not null default 0 check (stock_rows >= 0),
  stock_skipped integer not null default 0 check (stock_skipped >= 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  foreign key (tenant_id,integration_id) references integration_connections(tenant_id,id) on delete cascade,
  foreign key (tenant_id,source_id) references inventory_sources(tenant_id,id) on delete cascade
);

create index if not exists integration_sync_runs_tenant_integration_idx
  on integration_sync_runs(tenant_id,integration_id,created_at desc);

create unique index if not exists integration_sync_runs_one_running_idx
  on integration_sync_runs(tenant_id,integration_id)
  where status='running';

alter table integration_sync_runs enable row level security;
alter table integration_sync_runs force row level security;

drop policy if exists integration_sync_runs_isolation on integration_sync_runs;
create policy integration_sync_runs_isolation on integration_sync_runs
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

revoke all on integration_sync_runs from public;

commit;
