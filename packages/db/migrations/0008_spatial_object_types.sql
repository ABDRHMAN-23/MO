begin;

alter table spatial_nodes
  drop constraint if exists spatial_nodes_node_type_check;

alter table spatial_nodes
  add constraint spatial_nodes_node_type_check
  check (
    node_type in (
      'space','floor','zone','room','aisle','rack','shelf','cabinet','drawer','bin','box','slot',
      'wall','table','desk','counter','refrigerator','freezer','display_case','storage_area'
    )
  );

commit;
