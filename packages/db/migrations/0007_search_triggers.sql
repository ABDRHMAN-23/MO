begin;

create or replace function app.set_spatial_search_text()
returns trigger
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $fn$
begin
  new.search_text_normalized := app.normalize_search_text(
    coalesce(new.name,'') || ' ' || coalesce(new.code,'')
  );
  return new;
end;
$fn$;

create or replace function app.set_product_search_text()
returns trigger
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $fn$
begin
  new.search_text_normalized := app.normalize_search_text(
    coalesce(new.name,'') || ' ' ||
    coalesce(new.sku,'') || ' ' ||
    coalesce(new.barcode,'') || ' ' ||
    coalesce(new.category,'')
  );
  return new;
end;
$fn$;

drop trigger if exists spatial_nodes_search_text_trg on spatial_nodes;
create trigger spatial_nodes_search_text_trg
before insert or update of name,code on spatial_nodes
for each row execute function app.set_spatial_search_text();

drop trigger if exists products_search_text_trg on products;
create trigger products_search_text_trg
before insert or update of name,sku,barcode,category on products
for each row execute function app.set_product_search_text();

update spatial_nodes
set search_text_normalized=app.normalize_search_text(coalesce(name,'') || ' ' || coalesce(code,''));

update products
set search_text_normalized=app.normalize_search_text(
  coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' ||
  coalesce(barcode,'') || ' ' || coalesce(category,'')
);

commit;
