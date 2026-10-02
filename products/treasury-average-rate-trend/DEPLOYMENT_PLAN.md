# Product 014 deployment plan — Treasury Average Rate Trend x402

Status: staging candidate pending factory release-gate promotion.

## Contract

- Route: `GET /api/treasury-average-rate-trend`
- Price: `$0.003 USDC`
- Atomic amount: `3000`
- Network: `eip155:8453`
- Inputs:
  - `security`
  - optional `minChangeBps` integer 1–1000, default 1
- Decisions:
  - `rising`
  - `falling`
  - `unchanged`
  - `human_review`

## Source

U.S. Treasury Fiscal Data:
`https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates`

The shared Treasury adapter selects one security description and returns the two newest distinct monthly records.

## Decision rule

Let `changeBps = (latestRatePercent - previousRatePercent) * 100`.

- `rising` when `changeBps >= minChangeBps`
- `falling` when `changeBps <= -minChangeBps`
- `unchanged` when absolute change is smaller than `minChangeBps`
- `human_review` for unavailable, ambiguous, incomplete, or invalid source history

## Payment ordering

`402 -> validate input -> verify payment -> Treasury source work -> settle -> 200`

- invalid input: 400, no settlement
- Treasury source/contract failure: 502, `chargeable:false`, no settlement
- unresolved payment state: 503, retry the same authorization
- completed trend result: settle before HTTP 200

## Discovery

Publish through the factory-generated:
- x402 catalogs with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- release bundle

OpenAPI operationId:
`getTreasuryAverageRateTrend`

## Claim boundary

The result is a mechanical comparison of official monthly weighted-average rates on outstanding Treasury debt. It is not:
- a live market yield,
- an interest-rate forecast,
- a monetary-policy prediction,
- investment advice,
- a recommendation.

## Deployment blocker

AppDeploy weekly Free-tier reset recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.

## Post-deploy acceptance

1. Unpaid request returns 402 with 3000 atomic USDC on Base.
2. Invalid input is rejected before facilitator verification.
3. Source failure does not settle.
4. Completed result settles before 200.
5. Resource-level `accepts[]` is present.
6. Existing Products 001–013 remain unchanged.
7. Live Fiscal Data smoke returns one of `rising`, `falling`, or `unchanged` with two monthly observations.
