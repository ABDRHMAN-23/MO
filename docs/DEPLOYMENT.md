# Deployment

## Required services

- PostgreSQL-compatible Neon database
- static web host for the Vite build
- Node.js API runtime capable of outbound PostgreSQL connections

The repository does not claim a production host that has not been configured.

## Production environment

Set DATABASE_URL, NODE_ENV=production, WEB_ORIGIN, and the verified authentication adapter configuration.

Do not set DEV_TENANT_ID in production.

## Migration procedure

1. Review migration SQL.
2. Verify backup/restore point.
3. Apply migrations in order.
4. Run the tenant-isolation test against disposable staging.
5. Deploy API and web.
6. Verify /health.
7. Verify authenticated tenant reads/writes.
8. Record the migration version in release notes.

## PWA

The web app includes a basic service worker that avoids /api caching. It is not a full offline write queue. Offline mutations must not be silently accepted until the later conflict-safe queue exists.
