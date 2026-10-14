# Build third autonomous SaaS family — inventory replenishment

Goal: Generate three working inventory stock and internal replenishment apps alongside document and quote families, using separate mechanics and independent end-to-end acceptance.

- [x] Write failing tests for stock math, reservations, low-stock suggestions, synthetic proposal lifecycle and separate approval.
- [x] Implement a finite inventory SKU kernel using integer quantities and illustrative integer-cent cost calculations; never place purchases.
- [x] Write failing tests and implement SQLite tenant-isolated store, two-role credentials, idempotent commands, restart persistence and internal worker.
- [x] Write tests and implement loopback-only HTTP/CSP browser UI with no storage, external messages or checkout.
- [x] Write failing manufacturing tests and build content-addressed self-contained app assembler, subprocess acceptance and replay-safe quarantine.
- [x] Add dedicated family CI plus autonomy lane and native desktop/mobile browser acceptance for three editions.
- [ ] Verify all six workflows on exact PR head, inspect artifacts/screenshots and resolve any true regression without weakening authorization.
- [ ] Preserve draft/unmerged/undeployed status; record verified technical output separate from commercial demand. No new scheduled tasks.
