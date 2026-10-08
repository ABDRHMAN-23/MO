# Spatial Inventory Platform

Spatial Inventory Platform turns physical storage into a searchable spatial memory:

**Search → verified quantity → exact place → find it.**

## Architecture

- React + TypeScript
- React Three Fiber + Drei for the real 3D spatial workspace
- PostgreSQL/Neon-ready relational model
- Multi-tenant identifiers on all business records
- Product catalog separated from spatial placement and inventory truth
- Audit events for consequential mutations
- PWA-ready frontend
- Open-source provenance recorded in `open-source/manifest.csv`

## Monorepo

- `apps/web` — web client and interactive 3D workspace
- `packages/domain` — shared domain types and spatial helpers
- `packages/db` — PostgreSQL schema and migrations

## Development

```bash
pnpm install
pnpm dev
```

The first implementation deliberately establishes the spatial core before adding AI, voice, vision, or multiple connectors.
