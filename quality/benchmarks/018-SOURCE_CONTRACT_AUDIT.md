# Product 018 — source-contract audit v2

## Scope

Audited the code-defined contracts of `packages/sources/live-pa-identity.js` and `packages/sources/ofac-name-screen.js`, plus the Product 018 decision/service implementation. All adapter tests use injected responses; there are no government-source calls, real buyers, payments, or independent legal determinations.

## Pennsylvania registry findings

The adapter ranks at most three distinct returned entities. `candidateCount` is the total ranked result count; `strongCandidateCount` is the number of name matches scoring 0 or 1. The result also carries `ambiguous`, `matchScore`, `identityComplete` and `strongMatch`.

**One strong match among two or three total search results is valid.** The v1 offline Quality Lab incorrectly interpreted a `candidateCount` of two by itself as contradictory. Version 2 now accepts 1–3 ranked results with exactly one strong match and complete identity fields. It rejects incompatible counts, ambiguous strength assertions and missing source-contract evidence.

## OFAC findings

The adapter returns `query`, `minScore`, `totalCandidatesAboveThreshold`, and up to three returned candidate objects. A total greater than the displayed list is normal when the list was truncated. A negative total, empty list paired with positive total, displayed list larger than total, missing count, or wrong screened legal name/threshold is inconsistent. These are name-screening signals only, not sanctions clearance or ownership-rule analysis.

## RDAP findings

The existing decision uses UTC-day registration cutoff arithmetic. Offline v2 checks impossible calendar dates, malformed timestamps, future registration, and inclusive day-boundary behavior; missing dates continue to require human review.

## Verification

```bash
node --test quality/benchmarks/018-source-contract-v2.test.js
node --test quality/benchmarks/018-source-adapter-v2.test.js
node --test quality/benchmarks/018-hardened-decision.test.js
node quality/benchmarks/018-decision-oracle.js --check
```

The revised synthetic oracle has expanded coverage. Its mismatch counts are specific to repository-authored synthetic expectations, not production accuracy or independently held-out truth. The live Product 018 decision, payments, routes, prices, wallets, provider adapters, and runtime are unchanged.

No external buyer evidence, verified contribution margin, legal clearance, merge or deployment authorization, or Product 025+ unlock is established.
