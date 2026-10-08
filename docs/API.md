# API

The API is domain-oriented and tenant-scoped.

## Core

- GET /health
- GET /api/overview
- GET /api/spatial?q=...
- GET /api/spatial/:id
- GET /api/spatial/:id/products
- POST /api/spatial
- PATCH /api/spatial/:id
- DELETE /api/spatial/:id
- GET /api/products?q=...
- POST /api/products
- GET /api/products/:id/locations
- POST /api/placements
- PATCH /api/placements/:id
- DELETE /api/placements/:id

## Inventory

- GET /api/inventory-sources
- POST /api/inventory-sources
- POST /api/inventory-location-mappings
- POST /api/import/products

## Odoo

The first real provider connector is Odoo 19 JSON-2.

- GET /api/integrations
- POST /api/integrations/odoo
- POST /api/integrations/odoo/:connectionId/health
- POST /api/integrations/odoo/:connectionId/sync
- GET /api/integrations/:connectionId/locations

The Odoo API key is encrypted server-side immediately and is never returned to the browser.

Sync imports:
- active Odoo products,
- internal stock locations,
- stock quantities from stock.quant.

Provider product IDs are stored in tenant-scoped integration_product_mappings. Stock is written only to inventory_balances. It is not copied into products or placements.

An Odoo location is not assumed to be a spatial location. It must be explicitly mapped to an internal spatial node before the UI can label its quantity as spatially verified.
