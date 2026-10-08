# Offline behavior

The web client supports a bounded local queue for **product placement moves**.

When the device is offline:
- recently cached products and spatial records can remain readable;
- an existing product placement can be recorded as a pending move;
- the UI shows a pending-sync count;
- the pending move is not presented as server truth;
- the operation stores the placement's last known `updated_at`.

When the device reconnects:
1. pending moves are sent one at a time;
2. the API validates tenant, role, target location, and the expected placement version;
3. a newer server version produces `409 PLACEMENT_CONFLICT`;
4. the pending action is retained instead of silently overwriting the newer move;
5. successful moves are removed from the local queue.

The queue is untrusted client state. It is only a transport buffer; PostgreSQL and the API remain authoritative.

Not implemented intentionally in this phase:
- offline stock adjustments,
- offline integration credential changes,
- offline billing changes,
- a generic offline last-write-wins queue,
- silent conflict resolution.

Those require explicit conflict workflows and production authentication before they are safe.
