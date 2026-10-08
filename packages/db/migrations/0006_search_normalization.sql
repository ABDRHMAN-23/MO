begin;

create or replace function app.normalize_search_text(input text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $fn$
select trim(
  regexp_replace(
    translate(
      lower(coalesce(input,'')),
      'أإآٱىيكکةؤئـًٌٍَُِّْٰ',
      'اااايييككهوي'
    ),
    '[[:space:]]+',
    ' ',
    'g'
  )
);
$fn$;

alter table spatial_nodes
  add column if not exists search_text_normalized text not null default '';

alter table products
  add column if not exists search_text_normalized text not null default '';

update spatial_nodes
set search_text_normalized=app.normalize_search_text(coalesce(name,'') || ' ' || coalesce(code,''));

update products
set search_text_normalized=app.normalize_search_text(
  coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(barcode,'') || ' ' || coalesce(category,'')
);

create index if not exists spatial_nodes_tenant_search_idx
  on spatial_nodes(tenant_id,search_text_normalized)
  where deleted_at is null;

create index if not exists products_tenant_search_idx
  on products(tenant_id,search_text_normalized)
  where status <> 'archived';

commit;
