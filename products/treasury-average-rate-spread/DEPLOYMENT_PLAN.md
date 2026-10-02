# Product 015 deployment plan — Treasury Average Rate Spread x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/treasury-average-rate-spread`
- Price: `$0.003 USDC`
- Atomic amount: `3000`
- Network: `eip155:8453`
- Inputs:
  - `leftSecurity`
  - `rightSecurity`
  - optional `toleranceBps` from 0–1000, default 2
- Decisions:
  - `left_higher`
  - `right_higher`
  - `within_tolerance`
  - `human_review`

## Source

U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities.

Both security categories must be resolved from the same fetched dataset and same latest monthly record date.

## Decision rule

`spreadBps = (left averageInterestRatePercent - right averageInterestRatePercent) * 100`

- `within_tolerance` when absolute spreadBps <= toleranceBps
- `left_higher` when spreadBps > toleranceBps
- `right_higher` when spreadBps < -toleranceBps
- `human_review` when either category is missing, ambiguous, lacks a usable rate, or record dates are inconsistent

## Payment ordering

`402 -> validate input -> verify payment -> Treasury source work -> settle -> 200`

- invalid input: 400, no settlement
- Treasury source/contract failure: 502, chargeable=false, no settlement
- unresolved payment: 503, retry the same authorization
- completed spread result: settle before 200

## Discovery

Publish through factory-generated:
- resource-array x402 catalogs with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- release bundle

OpenAPI operationId:
`compareTreasuryAverageRateSpread`

## Claim boundary

This compares monthly weighted-average rates on outstanding Treasury securities. It is not:
- a live market yield spread,
- a yield-curve trading signal,
- a forecast,
- a monetary-policy prediction,
- investment advice,
- a recommendation.

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.

## Post-deploy acceptance

1. Unpaid request returns 402 with 3000 atomic USDC on Base.
2. Identical left/right security inputs are rejected before facilitator verification.
3. Source failure does not settle.
4. Both selected rates use the same record date.
5. Completed classification settles before HTTP 200.
6. Resource-level `accepts[]` is present.
7. Products 001–014 remain unchanged.
8. Official Fiscal Data live smoke returns a non-review decision with finite spreadBps.

## Verified live-source evidence

- source record date: 2026-08-31
- Treasury Bills: 3.788%
- Treasury Notes: 3.345%
- spread: +44.3 basis points
- tolerance: 2 basis points
- decision: `left_higher`
