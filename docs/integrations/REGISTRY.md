# Integration & Source Registry

This registry is the project's explicit record of the current Integration Hub targets and the engineering repositories used as references.

## Runtime / implemented

- React Three Fiber
- Drei
- ZXing Browser
- Odoo connector
- CSV/Excel import foundation

## Integration Hub targets registered in the product

1. Odoo
2. ERPNext
3. WooCommerce
4. Shopify
5. Saleor
6. Medusa
7. Vendure
8. Dolibarr
9. Generic REST API
10. Generic GraphQL API
11. PostgreSQL read-only
12. CSV / Excel
13. Generic webhook receiver

Each provider must pass through the canonical integration layer. The frontend never talks directly to provider APIs.

A provider being **registered** means the provider exists as a first-class target in the Integration Hub and has a stable source/contract entry. It does not mean customer credentials have been supplied or that a provider-specific connector has been falsely marked connected.

## Engineering references registered in the project

- openPlan3D
- Blueprint3D Modern
- 3d-warehouse
- WarehouseDigitalTwin
- WareTwin
- Inventory Management System
- Inventory-POS

These repositories are references, not copied applications. Their ideas/components are reviewed and selectively implemented in the project's React/TypeScript architecture.

## Future-only infrastructure

The following remain outside the current runtime until Phase 2/3/4 requires them:

- Node-RED
- PostgREST
- Hasura
- Debezium
- NATS
- MindAR
- AR.js
- advanced vision/LLM serving stacks

This separation prevents an unmaintainable "clone many repositories" architecture while keeping the intended ecosystem explicitly recorded.
