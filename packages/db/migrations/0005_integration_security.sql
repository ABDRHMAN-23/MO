begin;

alter table integration_connections
  add constraint integration_connections_https_chk
  check (base_url ~* '^https://');

commit;
