# Composite vendor source-quality gate — Products 016, 017, 019 and 020

## Why

The four existing composite products were already handling thrown provider exceptions as non-chargeable failures, but normalized adapter results with `available:false`, incomplete OFAC candidate contracts, or contradictory/invalid registered-domain timestamps could still return **chargeable:true**. This allows an x402 settlement after an incomplete paid decision. Some catch blocks also forwarded arbitrary upstream error messages or provider-defined codes.

## New source contract shared by five products

The existing audited Product 018 evidence contract has moved to `packages/sources/vendor-evidence-contract.js`; the original Product 018 import path remains a thin compatibility shim. Products 016, 017, 019 and 020 share `packages/sources/composite-evidence-guard.js` with these invariant checks:

- **Pennsylvania registry:** `available:true` required for completed evidence; a strong match needs exactly one **strong** candidate among up to three ranked results, a consistent registry score and complete legal identity. Malformed strong records halt dependent OFAC/RDAP requests. A correctly reported company-not-found/ambiguous/weak match remains a completed outcome.
- **OFAC (016):** same resolved legal name and requested minScore, bounded current SDN/ALT candidate totals and list shape. A real name candidate is a completed paid `candidate_found` result and **not** sanctions clearance.
- **RDAP (017/019):** source available and registered-status valid; registered aligned domains require a real nonfuture ISO registration date; returned domain must match the requested normalized domain. A truly unregistered domain or deliberate name mismatch remains a completed response.
- **RDAP (020):** registered domains need valid expiration and last-changed dates, with no future last-changed date. An already-short expiration runway is a completed review, not an upstream source failure.
- **Source exceptions:** only allowlisted, fixed source error codes are returned; unrecognized errors become generic `SOURCE_ADAPTER_FAILURE`. No raw provider exception detail, header, query or token appears in sourceFailures.

On required-source failure the existing decision is conservatively classified as `human_review`, `sourceFailures` names the failed source, and `chargeable:false` is returned. Existing handwritten **and** specification-generated x402 handlers then return HTTP 502 **without settlement**, even when the verifier accepted the caller's signature. Valid responses preserve registered prices, payout address, chain, route and decision enumerations.

## Tests and release boundary

```bash
node --test quality/benchmarks/composite-016-020-evidence-gate.test.js
node --test products/pa-vendor-counterparty-review/evidence-gate.test.js
node scripts/run-all-tests.js
```

All tests use only synthetic in-memory adapter and facilitator responses. The paid runtime and existing product specs still require independent external source-compatibility samples, complete fee/support/refund economics, privacy/legal/security review and true external buyer demand before a release decision.

**Draft only:** PR is stacked on the still-draft Product 018 source monitoring branch. No merge, deployment, external transaction, customer outreach, price/wallet/rail change, or Product 025+ unlock.
