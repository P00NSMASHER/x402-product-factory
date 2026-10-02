# Product 007 deployment plan — Domain Registration Age x402

Status: **live-source-verified staging**. Production deployment is deferred while AppDeploy is account-limit paused.

## Contract

- Route: `GET /api/domain-registration-age`
- Price: `$0.002 USDC`
- Atomic amount: `2000`
- Network: `eip155:8453`
- Inputs: `domain`; optional `minAgeDays` 1–3650 (default 90)
- Decisions: `established`, `recent_registration`, `unregistered`, `human_review`

## Evidence

Authoritative path:
1. IANA RDAP bootstrap
2. authoritative TLD registry RDAP service

`established` requires a valid registration event on or before the UTC calendar-day cutoff.
`recent_registration` requires a valid registration event after the cutoff.
A valid authoritative 404 is `unregistered`.
A registered domain without a trustworthy registration event returns `human_review`.

## x402 ordering

`402 -> validate input -> verify payment -> RDAP lookup -> settle -> 200`

Transport/source failure is HTTP 502, `chargeable:false`, and must not settle.

## Claim boundary

Domain registration age is one identity signal only. It does not prove:
- ownership/control,
- legitimacy,
- safety,
- absence or presence of fraud,
- business operating history.

## Live verification

GitHub Actions authoritative-RDAP smoke:
- domain: `openai.com`
- registered: true
- registration date: `2007-01-19`
- observed age: `7196` days
- threshold: `90` days
- decision: `established`
- source: authoritative RDAP discovered through IANA bootstrap

## Deployment blocker

AppDeploy weekly Free-tier pause reported through `2026-10-05T00:00:00Z`. No paid upgrade authorized.
