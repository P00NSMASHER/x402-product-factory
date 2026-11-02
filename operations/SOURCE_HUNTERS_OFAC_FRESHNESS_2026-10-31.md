# Source Hunters: OFAC list freshness and empty-list recovery (2026-10-31)

## Repo, ownership, and safe change boundary

- Canonical repo: [P00NSMASHER/x402-product-factory](https://github.com/P00NSMASHER/x402-product-factory); source base **main** commit `27293158aeda848f2bc68ce2c5f6aca71b57cb44`.
- Source contracts: [OFAC adapter](../packages/sources/ofac-name-screen.js), tests, [CONTRACTS](../packages/sources/CONTRACTS.md). Separate active draft PRs [#59](https://github.com/P00NSMASHER/x402-product-factory/pull/59), [#60](https://github.com/P00NSMASHER/x402-product-factory/pull/60), [#61](https://github.com/P00NSMASHER/x402-product-factory/pull/61) have **no changes to this adapter or test file** (changed-file listing checked). CaptureBrief [#167](https://github.com/P00NSMASHER/capturebrief/pull/167) and PermitPlate [#152](https://github.com/P00NSMASHER/permitplate-nyc/pull/152) already own the sales-path edits; this branch avoids them.
- Authenticated owner repo listing showed no separately accessible repositories for RETALLY, FreightRecovery, or RecoveryOS. Their identity or existence elsewhere must not be assumed.
- No customer, payment, production, live trades, or external account access is involved. No PHI or private customer data.

## Reproducible pre-patch defects

1. **Unbounded list age.** The original OFAC adapter set `cache` on first successful SDN/ALT fetch and subsequently returned it without a freshness check. A live process could screen indefinitely against the first downloaded list, even after OFAC updates. Exact main blob `afc03107b569d98a1a4ebeef80f97df0450a5d4e`. Deterministic isolated V8 mock: initial old snapshot produced **0** exact matches for ALICE SMITH; advancing a synthetic clock beyond 1 hour and replacing the mock SDN source with an ALICE SMITH row still yielded **0**, with only **2** network fetches. Modified source refreshed both files and yielded **1** exact match with **4** fetches.
2. **Empty snapshot poisoning.** Original `load()` assigned `cache=[]` before throwing `SOURCE_CONTRACT_INVALID` for an empty SDN response. Subsequent calls saw a truthy array and returned an **available, empty** screening even after the upstream source recovered, rather than retrying. Fixed by constructing and validating an entire new snapshot **before** assigning to cache.

These are **source-code and mocked-response defects**, not evidence of a specific incorrect real-world sanctions decision or a legal compliance certification.

## Smallest safe repair

- Default OFAC SDN/ALT snapshot lifetime: **60 minutes** after successful fetch completion (a conservative configurable application policy, **not** an OFAC prescribed interval); injected `nowMs` enables deterministic tests.
- Expired cache refresh is **fail-closed**: fetch failures throw and are not converted into a successful stale screening. A failed or empty refresh leaves data unavailable until a subsequent successful refresh. New data is published atomically after both files are loaded and nonempty.
- Concurrent lookups share a single in-flight refresh rather than independently downloading entire lists. Bounded configurable TTL: 1 second to 24 hours; production default is 1 hour. Clock reversal triggers a new fetch instead of extending stale data.
- Five new regression tests: expiration/new source content, 12-way concurrency, source HTTP failure and retry, empty dataset recovery, invalid TTL. Existing alias, CSV, and error behavior stays intact.
- Rollback: revert this PR; no schema migration, new package dependency, lockfile change, secrets or external deployment.

## Reviewed external source candidates (no copied code)

1. [sindresorhus/p-memoize](https://github.com/sindresorhus/p-memoize/tree/49be452fa90183f04d7225b0f46ddd25a915febf): **MIT** (`license` blob `fa7ceba3eb4a9657a9db7f3ffca4e4e97a9019de`); package **9.0.0**, Node >=22, transitive dependency `mimic-function ^5.0.1`, upstream commit **2026-10-15**. Rejected as a new dependency/ESM graph for one controlled adapter's bounded in-flight promise.
2. [sindresorhus/quick-lru](https://github.com/sindresorhus/quick-lru/tree/a2190ebdf8e455b95a7138803d274ff5ed57ebcd): **MIT** (same license blob), package **7.3.0**, Node >=18, no runtime package dependencies declared, upstream commit **2026-09-18**. Rejected as a new dependency for exactly one immutable snapshot, where LRU eviction would not solve failed/expired-refresh behavior.
3. Context: [OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service) supplies current downloadable lists. [OFAC FAQ 105](https://ofac.treasury.gov/faqs/topic/1641) explicitly identifies caching as a potential cause of stale data. The exact hour is **our testable operational choice**.

No external code, license text, or dependency was imported; there are no new NOTICE or transitive-license requirements. Upstream full advisories and package lock audit were not performed; this choice deliberately keeps dependency exposure unchanged.

## Validation and remaining steps

- Isolated exact-source V8 mock comparison: indefinite-old-cache behavior replicated before patch and fixed afterward; **8 simultaneous** patched lookups made **2** file fetches; empty snapshot recovered on a later call (**4** fetches). This is not substitute for Node/hosted CI.
- [Native OFAC CI](../.github/workflows/ofac-source-cache-ci.yml): syntax checks, focused OFAC tests, and `node scripts/run-all-tests.js`, checkout pinned to immutable `11bd71901bbe5b1630ceea73d27597364c9af683` (actions/checkout v4.2.2). Record actual run/check status before considering merge.
- Engineering-time saving **2–4 hours forecast, low confidence**: 1 engineer-hour to diagnose and validate cache expiry, another 1–3 to separately reason through concurrent fetches and failure recovery across shared consumers; not timed actual labor. No claim of recovered commercial revenue or confirmed legal compliance.
- Before merge: inspect hosted full test results, independent source/security review of CSV parsing and timestamp/clock handling, validate downstream availability handling, and obtain explicit release authorization for sanctions-facing logic. Stay isolated pending review. Next scan: malformed CSV quote fail-closed and publication freshness metadata, without changing production in parallel.
