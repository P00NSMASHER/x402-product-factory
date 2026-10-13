# Durable application runtime implementation plan

**Goal:** Run the existing application-family workflows without a browser and recover safely across restarts.
**Architecture:** SQLite-backed runtime reuses the PR #25 kernel; authenticated HTTP commands and a bounded supervisor share transactional state and a durable internal inbox.
**Spec:** ../specs/2026-10-13-durable-application-runtime.md
**Execution:** Inline implementation and self-review; no independent reviewer is claimed.

## Tasks
- [x] Write failing runtime acceptance tests for durable state, tenant authorization, idempotency, leases, retry/quarantine, cancellation, and 100-workspace catch-up.
- [x] Implement `packages/application-factory/runtime/runtime.js` with SQLite storage, private credential digests, scoped commands and fenced worker transactions.
- [x] Write failing HTTP/supervisor tests; implement `worker.js` and `http.js` with automatic bounded polling and loopback-only authenticated APIs.
- [x] Implement `scripts/run-application-runtime.js` for private provisioning, one sweep, or a running local service; verify actual child-process persistence.
- [ ] Run all new tests and the 100-workspace acceptance, inspect the diff, preserve all existing gates, then require full exact-head GitHub CI.
- [ ] Record observed outcomes and outstanding production capabilities in the runtime README and PR receipt.

## Review focus
Cross-tenant IDs; input-controlled clock or identity; duplicate client retries; stale workers after expiry/pause; corrupt persisted snapshots. Each has explicit tests. No path introduces live payment or notification transport.
