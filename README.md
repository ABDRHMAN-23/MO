# Spatial Inventory Platform

Search → verified quantity → exact place → find it.

This repository implements the core of a multi-tenant spatial inventory product: a searchable physical-space model rendered in 2D/3D, with product placement kept separate from authoritative stock.

## Current release boundary

The current code is a Phase 1/core foundation, not a fake AI dashboard. It includes a real PostgreSQL data model, tenant-scoped API, data-driven 2D/3D viewer/editor, product catalog, placement history, CSV onboarding, barcode scanning, PWA shell, conflict-safe offline product placement moves, a real Odoo connector, connector contracts, audit trail, OpenAPI, RBAC, and CI/RLS tests.

AI natural-language orchestration, voice, computer vision, AR, multiple provider connectors, billing, and advanced offline conflict resolution are deliberately gated until the core is verified against a real database and pilot.

## Non-negotiable data invariant

Every product has a stable identity, every physical placement has a stable location identity, and every stock quantity has a traceable authoritative source.

The 3D scene renders database state. It never owns stock truth and never invents coordinates or quantities. Stock values come from inventory_balances and are displayed as verified only when an authoritative source is connected.

## Monorepo

- apps/web — React + TypeScript + React Three Fiber/Drei client
- apps/api — Node.js HTTP API with strict input validation, tenant transaction context, security headers, rate limiting, and audit writes
- packages/domain — shared domain types, Arabic search normalization, and spatial helpers
- packages/integrations — provider-neutral connector contracts and canonical records
- packages/db — PostgreSQL migrations and tenant-isolation integration test

## Run

1. Copy .env.example to the API environment.
2. Set a Neon/PostgreSQL DATABASE_URL and a development DEV_TENANT_ID.
3. Apply migrations in packages/db/migrations in order.
4. Run pnpm dev:api.
5. Run pnpm dev.

Vite proxies /api to http://localhost:8787 during development.

## Security boundary

Production API requests are rejected until a verified authentication adapter is installed. Development mode uses a server-configured DEV_TENANT_ID; the browser cannot choose its tenant. The API binds that tenant inside a transaction with app.set_tenant_context(...), while PostgreSQL FORCE RLS policies enforce the same boundary.

Do not put database credentials, connector credentials, or model/API keys in frontend code.

## Import boundary

CSV is supported by a small local parser with row limits. The client does not ship the vulnerable/unmaintained xlsx package. Excel support remains a gated integration decision until a maintained, audited parser is selected.

## Quality gates

CI runs workspace type checks/build, domain tests, PostgreSQL migrations, and a cross-tenant RLS test under a non-superuser runtime role. The repository contains no runtime DDL.

See docs/ for architecture, database, API, security, deployment, 3D, imports, and open-source review guidance.
