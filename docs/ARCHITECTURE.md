# Architecture

## System shape

~~~text
Browser
  |
  +-- Search / 2D / 3D / Scan / Forms
  |
  +-- same-origin /api
          |
          v
     Tenant-scoped API
          |
          +-- Domain validation
          +-- Audit write
          +-- DB transaction
                  |
                  v
             PostgreSQL / Neon
                  |
        +---------+---------+
        |                   |
   Spatial truth       Inventory truth
        |                   |
   nodes/placements    sources/balances/events
        +---------+---------+
                  |
            Future connector hub
~~~

The separation is intentional:

- Spatial truth answers where an item is mapped.
- Inventory truth answers what quantity an authoritative source reports.
- Integration adapters normalize provider-specific data before it enters the business model.
- AI is a future orchestrator. It calls allow-listed application tools; it never gets arbitrary SQL access.

## Tenant context

In production, tenant identity must be derived from the authenticated principal on the server. The current development adapter maps requests to DEV_TENANT_ID only to make the core usable before auth exists.

Every database transaction starts with BEGIN, then app.set_tenant_context(tenant_id), then tenant-scoped queries, then COMMIT or ROLLBACK.

Every tenant-owned table is protected with FORCE RLS.

## Spatial model

The hierarchy is intentionally generic:

Space → Floor → Zone → Room/Aisle → Rack/Cabinet → Shelf/Drawer → Bin/Box/Slot → Placement

Not every business needs every level.

## Write semantics

Location edits, placement changes, and product/import changes are transactional. Consequential writes emit audit records. Product moves append placement_history.

Quantities are never accepted by placement APIs.

## Scaling direction

Start as a modular monolith. Add dedicated workers for imports/connectors/AI only when workload justifies them. NATS, BullMQ/Redis, CDC, vector search, and provider services remain replaceable modules rather than assumptions baked into the core.
