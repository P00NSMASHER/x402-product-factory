# Remaining 17 staging products — required source billing safety

## Audited gap and scope

Earlier factory handlers correctly avoided x402 settlement when services returned `chargeable:false`, but a source adapter could return `{available:false}` without throwing an exception. The 17 remaining product services previously based `chargeable` solely on caught exceptions. That could settle a request whose authoritative source never supplied usable data.

**Affected existing products:** 003–015 and 021–024. Product 018 and composite Products 016, 017, 019, 020 retain their separate deeper audited source-contract gates. This proposal is stacked on draft composite safety PR #16. All routes, historical prices, decision enumerations, payment destinations and source adapters remain unchanged.

## Implementation

- `packages/sources/contracts.js` now exposes `trackRequiredEvidence(source, result, sourceFailures)`, wrapping the existing canonical `normalizedEvidence`. It appends exactly one safe `{source,detail:'SOURCE_UNAVAILABLE'}` record when an **invoked required adapter** returns unavailable or no usable object. It never marks an intentionally skipped optional adapter as a failure.
- All 17 services use this helper at **22 actual adapter call sites**, while continuing to use their existing decision implementations. If a source reports unavailability, services return `chargeable:false`. Handwritten and specification-generated x402 handlers return `502` after mock verification **without invoking settlement**.
- All **22 exception catch points** in these services use `safeSourceErrorCode`: known fixed adapter error codes are allowed; arbitrary error messages or unknown error codes become `SOURCE_ADAPTER_FAILURE`, so upstream exception text cannot leak private data.
- **Valid completed negatives stay billable:** a Pennsylvania business genuinely not found, an intentionally skipped Census comparison after no strong PA match, and an unregistered RDAP domain remain valid completed service outcomes. The helper is invoked only after an actual adapter lookup.

## Regression suite

```bash
node --test quality/benchmarks/remaining-source-evidence-billing.test.js
node scripts/run-all-tests.js
```

The matrix covers 17 registered products, 34 unavailable-source route executions (17 products × generated and handwritten handlers), 34 unknown-source-error privacy executions, six valid negative-evidence product scenarios in both payment handlers, and the shared source helper's deduplication/skipped-source policy. All adapter and facilitator responses are synthetic in-memory fixtures; no external sources, customers, payment signatures belonging to real buyers, or settlement transactions are used.

## Scope limitation and release

This specifically fixes *unavailable source* billing and exception-text privacy. It does **not** claim full independent validation of every upstream `available:true` payload's field schema. More specialized PA/OFAC/RDAP integrity checks exist in composite PR #16 and Product 018; SEC, Treasury, and Census field-level validation may require further independent source-contract work.

**Draft-only and unmerged:** no production deployment, price/payout/payment changes, permission to charge for missing evidence, new product number, proof of real buyer demand or actual operating profitability. Independent provider compatibility, security/privacy, current costs, paid settlement reconciliation and customer usefulness remain separate gates. Product 025+ remains frozen.
