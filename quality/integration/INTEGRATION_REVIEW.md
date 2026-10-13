# Product Factory — combined safety and source-drift integration

## Scope

This stacked **draft-only** integration brings together two separately verified developments without merging either original PR:

- **PR #18:** Product 018 public-source monitoring-history integrity, including strict validation of the immediately prior completed same-branch redacted observation and fail-closed missing/corrupted prior artifact handling.
- **PR #19:** Availability/billing protections for all 22 existing staging products, including full field-level SEC/Treasury guards for five products, deeper PA/OFAC/RDAP checks for Products 016–020, and unavailable-source safeguards for the remaining twelve.

The branches share source-drift PR #14 as an ancestor but are **not** already combined. This integration uses PR #19 as its base and incorporates PR #18's known-good monitor/source files with reviewed CI/documentation reconciliation.

## Compatibility and verified review goals

- **22 unchanged x402 product routes**, prices, asset, network and receiving wallet. All 22 unpaid paths return the original 402 challenge; each OPTIONS preflight remains valid; no source or payment network call is made in integration tests.
- **5 deeper PA composite checks** for Products 016–020.
- **5 deeper market checks** for Products 006, 008, 013, 014, 015.
- **12 remaining availability-only checks** (no claim of independent field-level certification).
- **History continuity:** previous completed same-branch observation or explicit, non-green HOLD; no silent bootstrap after history loss.
- Source/public-fixture monitoring remains **read-only** and bounded, with a proposed (not yet enabled) daily UTC schedule. No raw data, source URLs, payment headers, customer input or signed OFAC publication URLs are persisted.

## Run

```bash
node --test quality/integration/source-safety-and-history.test.js
node --test quality/benchmarks/018-baseline-continuity.test.js
node --test quality/benchmarks/018-live-source-probe.test.js
node --test quality/benchmarks/sec-treasury-evidence-gate.test.js
node --test quality/benchmarks/remaining-source-evidence-billing.test.js
node --test quality/benchmarks/composite-016-020-evidence-gate.test.js
node scripts/run-all-tests.js
```

The **source-observation workflow** also runs its fixed-public GET-only check in CI and restores the prior redacted history artifact when available. A green source observation is not financial, buyer, sanctions, security, or independent live-payment evidence.

## Hold / governance

No real paid transaction, source billing receipt, cash-margin verification, human regulatory approval, commercial launch, merge, production deployment, change of price, wallet or Product 025+ unlock is part of this integration. All upstream PRs remain draft; independent real-world evidence and a deliberate staged merge review are required.
