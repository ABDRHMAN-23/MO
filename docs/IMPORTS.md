# Imports

## CSV

CSV is the first safe spreadsheet onramp.

Required minimum fields:
Product Name | SKU

Optional:
Barcode | Category | Image URL | Quantity | Location Code

The client parser handles quoted commas, escaped quotes, CRLF/LF, duplicate-header rejection, and a 5,000-row limit.

## Quantities

A quantity is accepted only when an authoritative inventory source is explicitly selected. Location Code is required in that mode. The API writes the observation to inventory_balances, never to products or placements.

## Excel

The browser does not bundle the legacy xlsx package. Excel support is intentionally gated until an actively maintained, audited parser is selected.

## Idempotence

Product imports upsert by tenant plus SKU. Inventory observations upsert by tenant plus source plus product plus external location reference.

Remote connector events must use the inventory_events external-event identity to prevent duplicate processing.
