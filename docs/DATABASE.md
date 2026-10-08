# Database

Migrations are ordered and forward-only. The application contains no runtime schema creation or alteration.

## Core tables

- tenants — organization boundary
- users — tenant members
- spatial_nodes — physical hierarchy and geometry
- products — stable catalog identity
- placements — product-to-location association
- placement_history — append-only movement history
- inventory_sources — external/local source registry
- inventory_location_mappings — maps provider location IDs/codes to spatial nodes
- inventory_balances — observed stock per source/location/product
- inventory_events — idempotent external events and processing state
- audit_events — consequential application changes

## Stock truth

placements contains no operational quantity that application code uses. The legacy quantity fields from the bootstrap migration are compatibility-only and explicitly deprecated. The application reads stock from inventory_balances.

inventory_balances.quantity is an observed value, not an inference. A disconnected source does not become zero.

## Spatial truth

Coordinates and dimensions belong to spatial_nodes. Null coordinates are valid for newly created/unmapped objects. Soft deletion preserves historical identity.

## Foreign keys

Tenant-scoped composite references prevent a row in tenant A from pointing at an object owned by tenant B. This is defense in depth in addition to RLS.

## Retention

History and audit data need a documented retention policy before production. Offboarding must remain explicit, auditable, exportable, and restorable.
