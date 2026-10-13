# SEC and Treasury source-quality contract (Products 006, 008, 013–015)

## Why this change exists

The 22-product availability patch already withholds payment when a source returns `available:false`. However, these five staging services can receive `available:true` with malformed SEC filing dates, incomplete SEC legal identity, Treasury rate values that are not finite, mismatched security categories, or inconsistent month/dates. Before this patch those malformed results could reach an otherwise chargeable decision.

## Implementation

The new pure `packages/sources/market-evidence-contract.js` validates the data **actually used by the existing decision engine**. Each of the five services calls it on successfully returned `available:true` evidence. An invalid result is downgraded to `sourceUnavailable` with exactly one `SOURCE_CONTRACT_INVALID` failure, so existing handwritten/spec-generated handlers return **HTTP 502, `chargeable:false`, without settlement**.

The source adapters, x402 verification/settlement implementation, registry prices, product identifiers and decision code/enums are unchanged. The validator runs before an actual priced decision is returned and accepts normal missing/not-found signals:

- **006, 013 SEC:** the company's registered name and ten-digit CIK must be present on positive matches; SEC filing dates must be actual UTC calendar dates, no later than the observation, and the requested form must match. A genuinely unresolvable CIK or ticker remains a chargeable `company_not_found`, not a claimed source failure. Product 013 also confirms a caller-supplied CIK matches the SEC-resolved one.
- **008 Treasury threshold:** the official record date must be real and not in the future. The query and selected category must reconcile with match counts, unambiguous selection, same-month record date, and an actual finite 0–100% reported rate.
- **014 Treasury trend:** the selected category and query must reconcile; observed valid history dates must be in descending order and rates finite. Two observations support rise/fall; one valid month remains a genuine paid `TREASURY_HISTORY_INSUFFICIENT` review.
- **015 Treasury spread:** both selected category descriptions and query identities must match the requested distinct securities, official record dates must be identical, and rates must be finite before classifying a spread. Genuine completed not-found or ambiguity findings remain paid human reviews.

## Evidence and acceptance

The new [payment-path regression test](sec-treasury-evidence-gate.test.js) uses synthetic in-memory SEC/Treasury results and injected mock x402 facilitator responses. Every invalid evidence mutation is run against the **handwritten and generated** handlers. Required-source contract failures must return 502 after synthetic verification **without settlement**, receipts or source-error leakage. Every product also has a good-data paid control and a completed negative-data paid control.

Run from repo root:

```bash
node --test quality/benchmarks/sec-treasury-evidence-gate.test.js
node --test products/sec-filing-freshness/service.test.js products/sec-company-identity-match/service.test.js
node --test products/treasury-average-rate-threshold/service.test.js products/treasury-average-rate-trend/service.test.js products/treasury-average-rate-spread/service.test.js
```

This is **code-defined source-contract validation**, not new live SEC/Treasury requests, external ground truth, a licensed compliance opinion, or evidence of financial/customer viability. Full provider schema review and current source data, customer use, unit economics, actual settlement/reconciliation and human privacy/security review remain separate blockers. Product 025+ stays frozen.
