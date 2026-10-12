# Product 018 — Staging Source Evidence Gate (draft only)

## Behavior change under review

The Product 018 **staging service** now validates each required source's evidence contract before allowing an x402 paid result. This patch is stacked on the source-audited Product Quality Lab PR #8; it is not merged or deployed to production.

- **Pennsylvania registry:** a unique strong match among two or three ranked results remains valid. A contradictory `strongCandidateCount`, impossible ranked count, missing identity completeness or invalid score is treated as unusable evidence **before** making dependent OFAC/RDAP lookups.
- **OFAC name/alias screening:** the response must match the resolved legal name and exact requested score threshold, and have internally consistent bounded candidate counts. A completed OFAC name candidate remains a valid, *chargeable* `human_review` (not a sanctions determination). Transport-success-with-unavailable-data or contradictory evidence becomes a **non-chargeable HTTP 502**, with no settlement.
- **RDAP:** unregistered domains and valid mismatches are completed review signals. Unavailable, incomplete, impossible or future registration dates, and unknown registration status, now produce a **non-chargeable HTTP 502** and prevent settlement.
- **Payment safety:** existing handwritten and generated x402 handlers verify the submitted authorization first, but both **skip settlement** after the service returns `chargeable:false` or required-source failures. No charged answer is returned on these source-contract failures.
- **Output stability:** normal `proceed` and coherent `human_review` decisions keep existing price, decision set, source adapters, provenance, and x402 settlement behavior. Contract failures carry generic reason codes, not fake new clearance decisions.

## Full route-level shadow acceptance

A separate [mocked runtime canary](../../quality/benchmarks/018_RUNTIME_ACCEPTANCE.md) checks the AppDeploy bridge to the **actual Product 018 staging service**, including the generated paid handler, payment challenge identity, mock verifier/settler flow, source-contract failures, and non-leakage of upstream exception secrets. This is a draft integration test; no provider call or actual payment is made.

## Tests

```bash
node --test products/pa-vendor-counterparty-review/evidence-gate.test.js
node --test products/pa-vendor-counterparty-review/service.test.js
node --test quality/benchmarks/018-source-contract-replay.test.js
node quality/benchmarks/018-decision-oracle.js --check
```

The tests use **in-memory adapter results and mock payment facilitator requests**; they do not contact government sources, make real settlement attempts, authorize customer activity or establish false-proceed rates. Full factory CI and staging release gates must pass at the same exact revision.

## Gate to deployment

The underlying `decision.js` helper remains unchanged; this gate hardens the **service used by the paid runtime**. Before releasing, independently review real Pennsylvania/OFAC/RDAP response shapes, source-unavailability billing semantics, data privacy, x402 refund/settlement integration, complete unit economics, and buyer usefulness. The Product 025+ freeze remains in force.
