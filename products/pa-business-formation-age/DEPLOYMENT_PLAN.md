# Product 010 deployment plan — PA Business Formation Age x402

Status: **live-source-verified staging**. Production deployment is deferred while AppDeploy is account-limit paused.

## Contract
- Route: `GET /api/pa-business-formation-age`
- Price: **$0.002 USDC** / 2000 atomic units
- Inputs: `company`, optional `minAgeDays` (default 365)
- Decisions: `established_entity`, `recent_entity`, `company_not_found`, `human_review`

## Source
Pennsylvania Department of State public registry data via data.pa.gov.

## Decision
A unique strong entity match with a trustworthy creation date is compared with the caller's minimum age threshold. Missing/ambiguous registry evidence or unavailable formation date fails closed to `human_review`.

## Claim boundary
Formation age is an identity/history signal only. It does not establish current good standing, ownership, authority to contract, legitimacy, fraud risk, sanctions status, creditworthiness, or legal compliance.

## Live verification
Live PA registry smoke for `OpenAI OpCo` returned creation date `2025-09-29`; at `minAgeDays=30`, the result was `established_entity`.

## x402 ordering
`402 -> validate -> verify -> PA registry work -> settle -> 200`. Registry transport failure is HTTP 502 / non-chargeable / no settlement. Unresolved settlement is HTTP 503 and retries the same payment authorization.

## Deployment blocker
AppDeploy weekly Free-tier reset reported as `2026-10-05T00:00:00Z`. No upgrade/spend authorized.
