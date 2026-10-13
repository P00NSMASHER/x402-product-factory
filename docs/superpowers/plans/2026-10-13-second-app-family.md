# Second App Family Implementation Plan

**Goal:** Add a substantively different, fully operational quote-to-order SaaS generation family to the existing autonomous factory.

**Spec:** docs/superpowers/specs/2026-10-13-second-app-family.md

**Technology:** Node 22.13+, built-in `node:sqlite`, core HTTP/crypto, static responsive HTML/CSS/JS, existing native Playwright acceptance infrastructure.

**Global constraints:** Do not touch default branch, billing/payments, existing 6-hour user schedule, paid APIs, x402 Product 025+ registry, production user data or protected release controls. Work in stacked draft PR, require exact-head CI, no success claim without executed evidence.

- [x] TDD for quote domain transitions, validity, amount bounds, cost arithmetic, roles and expired orders.
- [x] TDD for durable SQLite scopes, key-based roles, idempotent replay and internal expiry after restart.
- [x] TDD for loopback HTTP guards, tenant authorization and quote-to-order service with no external transport.
- [x] Build polished native browser workbench, accessible forms, code-free CSP and memory-only credentials.
- [x] TDD for static manufacturing manifests, source file bounds, tamper, quarantine and independently executed packages.
- [x] Add CLI with package-only credentials, executable full-stack acceptance and runnable app artifacts.
- [ ] Add second-lane GitHub CI and native desktop/mobile acceptance to inherited factory workflow; execute all on exact PR head.
- [ ] Review native screenshots and any browser failures, retain original no-payment and no-market-claims boundaries, finalize exact-head draft acceptance receipt.
