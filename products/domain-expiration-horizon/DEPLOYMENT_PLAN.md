# Product 011 deployment plan — Domain Expiration Horizon x402

Status: **live-source-verified staging**. Production deployment is deferred while AppDeploy is account-limit paused.

## Contract
- Route: `GET /api/domain-expiration-horizon`
- Price: **$0.002 USDC** / 2000 atomic units
- Inputs: `domain`, optional `horizonDays` (default 60)
- Decisions: `expiring_soon`, `not_expiring_soon`, `unregistered`, `human_review`

## Source
IANA RDAP bootstrap plus the authoritative TLD registry RDAP service.

## Decision
For a registered domain with an authoritative expiration event, compare the expiration date with the caller's future horizon. Missing expiration evidence fails closed to `human_review`.

## Claim boundary
This is a registration timing signal only. Registry renewal/grace/redemption policies vary. It does not prove domain ownership, control, legitimacy, security, fraud risk, or business identity.

## Live verification
Live authoritative RDAP smoke for `openai.com` returned expiration date `2029-01-19`; at a 180-day horizon it returned `not_expiring_soon` with 840 days until expiration in that run.

## x402 ordering
`402 -> validate -> verify -> authoritative RDAP work -> settle -> 200`. Source failure is HTTP 502 / non-chargeable / no settlement. HTTP 503 retries the same payment authorization.

## Deployment blocker
AppDeploy weekly Free-tier reset reported as `2026-10-05T00:00:00Z`. No upgrade/spend authorized.
