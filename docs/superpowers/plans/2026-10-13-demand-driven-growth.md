# Demand-driven growth loop implementation plan

**Goal:** Each runnable edition automatically includes a safe commercial validation kit, and a separate local evidence engine guides which product to test or expand.

**Architecture:** The existing manufacturing compiler generates static draft offer assets from validated workflow recipes, includes them in hashed manifests and checks them in packaged/browser acceptance. A separate HMAC-protected local Proof Book records pseudonymous, source-labelled operator observations and computes conservative manual-review stages. No external network, payments or outreach.

**Tech stack:** Node.js 22 built-ins (crypto/fs), existing document workflow kernel, native Chromium CI.

**Spec:** `docs/superpowers/specs/2026-10-13-demand-driven-growth.md`.

**Global constraints:** No commercial activation, pricing/wallet modifications, Product 025+ unlock, external customer data, message delivery, public signup or deployment. Keep existing manufacturer and release gates.

**Review focus:** spoofed operator payment attestations vs actual provider verification; browser HTML injection; duplicate buyer/revenue credit; ledger corruption/wrong key; unsafe private paths; missing variable cost driving spurious scale decisions.

- [x] Test-first offer rendering (3 source recipes, 100 configurations, hostile HTML, no checkout).
- [x] Test-first conservative decision stages and coverage for refunds, unique buyers, synthetic claims and unit costs.
- [x] Test-first local signed Proof Book: strict event shapes, private state, distinct review key, persistent attestations and tamper tests.
- [x] Test-first operator CLI for init, record, attest and report; verify no raw PII or keys are emitted.
- [x] Extend application manufacturing with content-addressed offer assets and acceptance integrity checks.
- [ ] Run full new focused suites, original repository acceptance, packaged browser tests, then exact-head GitHub CI.
- [ ] Create an unmerged draft PR stacked on PR #31, record exact verification and explicit commercialization limits.
