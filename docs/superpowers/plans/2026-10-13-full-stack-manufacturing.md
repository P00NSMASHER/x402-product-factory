# Full-stack manufacturing implementation plan

**Goal:** Manufacture complete runnable application editions, automatically prove their workflows, and safely resume a batch without rebuilding accepted artifacts.
**Architecture:** Explicit source allowlist and deterministic manifests; immutable candidate directories; a serial build/test/publish loop with a private single-writer lock, bounded retries and persistent quarantine receipts. A child-process acceptance harness imports only the assembled application's modules and exercises real local HTTP, SQLite, evidence and recovery.
**Tech stack:** Node 22.13+, built-in filesystem/crypto/child_process/SQLite. No new production dependencies.
**Spec:** ../specs/2026-10-13-full-stack-manufacturing.md
**Execution:** Owner delegated prompt selection and inline execution; no independent reviewer is claimed.

## Constraints and review focus
No public deployment, secrets or customer state in outputs, product-number unlock, charges, schedules or automatic source generation. Expected digest must come from the current trusted compilation. Reject symlinks, missing/extra files, forged receipts and mixed editions. A failed edition never overwrites an accepted directory or suppresses other work. Resetting a stale process lock is an operator action, not guessed takeover.

## Tasks
- [x] Write and observe ten failing compiler/integrity contracts.
- [ ] Implement assembler.js; validate exact manifest/source coverage and deterministic output; run all contracts.
- [ ] Write failing acceptance tests, then exercise compiled HTTP/runtime/vault/recovery in a separately bounded child process.
- [ ] Write failing production-line contracts, implement resumable batch, retries/quarantine and CLI. Reverify existing receipts before reuse.
- [ ] Exercise all three actual editions and a 100-edition synthetic manufacturing batch; retain quantitative reports without inventing sales.
- [ ] Run complete repository and inherited native-browser CI; publish only tested candidate artifacts and final verification receipt.
