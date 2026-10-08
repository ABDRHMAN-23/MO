# API

The current API is intentionally small and domain-oriented.

## Health

GET /health

Returns database connectivity without exposing tenant data.

## Spatial

GET /api/spatial?q=...

List active spatial nodes, optionally by name or code.

GET /api/spatial/:id

Fetch one location.

GET /api/spatial/:id/products

List products currently placed at a location.

POST /api/spatial

Create a location. Coordinates are optional; omitting them means not mapped yet.

PATCH /api/spatial/:id

Update name, code, coordinates, dimensions, rotation, or metadata.

DELETE /api/spatial/:id

Soft-archive a node only when it has no active children or placements.

## Products

GET /api/products?q=...

Search by name, SKU, barcode, or category.

POST /api/products

Create a catalog product.

GET /api/products/:id/locations

Return every mapped location plus inventory observations available through location mappings.

## Placements

POST /api/placements

Create a product placement. No quantity is accepted.

PATCH /api/placements/:id

Move a placement and record placement_history plus an audit row in the same transaction.

DELETE /api/placements/:id

Soft-remove a placement and preserve its history.

## Inventory sources

GET /api/inventory-sources

List source health metadata.

POST /api/inventory-sources

Register a source record. Registration starts as disconnected; it does not pretend a connector is alive.

## Import

POST /api/import/products

Accept up to 5,000 normalized product rows. Quantity is accepted only when an authoritative source is explicitly supplied and each quantity row includes a locationCode.

## Authentication note

Development uses a server-side fixed tenant context. Production authentication is intentionally not faked and returns AUTH_REQUIRED until a verified adapter is installed.
