# Product 008 deployment plan — Treasury Average Rate Threshold x402

Status: **live-source-verified staging**. Production deployment is deferred while AppDeploy is account-limit paused.

## Contract

- Route: `GET /api/treasury-average-rate-threshold`
- Price: `$0.003 USDC`
- Atomic amount: `3000`
- Network: `eip155:8453`
- Inputs: `security`, `thresholdPercent`; optional `operator=gte|lte`
- Decisions: `threshold_met`, `threshold_not_met`, `human_review`

## Source

U.S. Treasury Fiscal Data:
Average Interest Rates on U.S. Treasury Securities.

The adapter selects the latest record date and requires exactly one matching security category. Ambiguous, missing, or null rate evidence returns `human_review`.

Important: JavaScript null-to-zero coercion is explicitly guarded. A null Treasury rate is unavailable evidence, not 0%.

## x402 ordering

`402 -> validate input -> verify payment -> Treasury lookup -> settle -> 200`

Source transport failure is HTTP 502, `chargeable:false`, and must not settle.

## Claim boundary

The rate is the official monthly weighted-average interest rate on outstanding Treasury securities for the selected category. It is not:
- a live market yield,
- a forecast,
- a rate for a specific new issuance,
- investment advice.

## Live verification

GitHub Actions Treasury Fiscal Data smoke:
- security: `Total Marketable`
- record date: `2026-08-31`
- average rate: `3.475%`
- test threshold: `0%`, operator `gte`
- decision: `threshold_met`

## Deployment blocker

AppDeploy weekly Free-tier pause reported through `2026-10-05T00:00:00Z`. No paid upgrade authorized.
