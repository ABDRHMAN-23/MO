# AI tool boundary

The AI layer is an interpreter/orchestrator, not the database.

## Allow-listed tools

Read-only tools:
- `search_products`
- `get_product_stock`
- `get_product_locations`
- `list_products_in_location`
- `get_sync_status`
- `open_3d_location`

Proposal tools:
- `propose_product_move`
- `propose_stock_adjustment`

High-impact tools:
- `write_stock_adjustment`
- `move_product`
- `delete_product`
- `disconnect_integration`
- `change_billing`

High-impact tools require explicit confirmation. The registry rejects tool names that are not allow-listed.

## Trust boundary

The AI must never receive:
- arbitrary SQL execution,
- connector secrets,
- cross-tenant records,
- direct unrestricted database credentials,
- silent authorization to modify inventory or billing.

Tool implementations must derive tenant scope from authenticated server context and re-check authorization server-side.

## Search and answer rules

Product identity resolution should prefer:
1. exact SKU/barcode,
2. normalized text,
3. fuzzy matching,
4. aliases/synonyms,
5. semantic retrieval,
6. LLM interpretation only when required.

Quantity questions must read inventory truth. Location questions must read spatial truth. A cached quantity must carry freshness/status and must never be presented as live when the connector is unavailable.

The repository currently implements the reusable guardrail contract only. A concrete LLM provider is intentionally not coupled to the core until production authentication, telemetry, and AI cost controls are configured.
