# Security Model

## Authentication and authorization

Production must derive tenant and user identity from a verified authentication mechanism. The current development server intentionally fails closed in production with AUTH_REQUIRED.

Roles belong to the tenant user model: owner, admin, operator, viewer. They must be enforced by auth middleware and service-level policy checks before privileged endpoints are exposed.

## Database isolation

All tenant-owned tables have tenant_id, FORCE RLS, a USING policy requiring tenant_id = app.current_tenant_id(), and a WITH CHECK policy using the same predicate.

Cross-tenant foreign keys use tenant_id plus id where a relation could otherwise cross a tenant.

The CI integration test switches to a non-superuser, non-BYPASSRLS runtime role and verifies tenant A cannot read or write tenant B data.

## API protections

- parameterized SQL only
- 1 MB JSON body ceiling
- rate limiting by client address
- strict CORS allow-list
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- strict referrer policy
- Permissions Policy
- COOP/CORP headers
- HSTS in production
- no stack traces in client responses
- request IDs on responses/errors
- HTTPS-only product images
- no arbitrary SQL endpoint

The in-memory rate limiter is a local guard. Production should also enforce edge/WAF limits so protection survives multiple API instances.

## AI boundary

Future AI tools should be allow-listed for search, verified stock, locations, location contents, sync status, and 3D highlighting.

Writes such as stock adjustments, product moves, deletions, billing changes, or integration disconnects require explicit confirmation and auditable authorization.

## Secrets

Connector credentials must never reach the browser. The production integration subsystem should encrypt credentials at rest with a managed key facility, rotate keys, redact secrets from logs, and avoid retaining raw webhook payloads longer than required.

## Uploads and SSRF

Future generic connector/upload endpoints must restrict outbound hosts, enforce HTTPS, validate content type and size, and reject private or link-local addresses. Do not add a generic fetch-this-URL endpoint without explicit SSRF defenses.


## Odoo integration secret storage

Odoo API keys are encrypted with AES-256-GCM before database persistence using INTEGRATION_ENCRYPTION_KEY. The ciphertext, IV, authentication tag, and version are stored together; the plaintext key never reaches the browser or audit log.

Production should source INTEGRATION_ENCRYPTION_KEY from a managed secret/KMS facility and rotate it through a versioned migration path. Odoo 19 API keys have provider-side expiration and rotation rules; the connector uses them only server-side.