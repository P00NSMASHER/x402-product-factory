# Product 020 deployment plan — PA Vendor Domain Continuity Review x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/pa-vendor-domain-continuity-review`
- Price: `$0.006 USDC`
- Atomic amount: `6000`
- Network: `eip155:8453`
- Inputs:
  - `company`
  - `domain`
  - optional `minExpirationDays` 1–3650, default 180
  - optional `minStableDays` 1–3650, default 30
- Decisions:
  - `stable_domain`
  - `human_review`
- No automatic reject.

## Decision sequence

1. Resolve one unique strong Pennsylvania legal entity.
2. Verify the supplied domain through IANA bootstrap + authoritative RDAP.
3. Require domain/legal-name alignment.
4. Require days until authoritative expiration >= `minExpirationDays`.
5. Require days since authoritative `lastChanged` >= `minStableDays`.

Any expiring-soon domain, recent authoritative change, unregistered domain, name mismatch, unavailable authoritative date, ambiguous entity, or source uncertainty becomes `human_review`.

## Sources

- Pennsylvania Department of State via data.pa.gov
- IANA RDAP bootstrap
- authoritative TLD registry RDAP

No seller-owned paid/demo endpoint is called internally.

## Payment lifecycle

`402 -> validate input -> verify payment -> PA registry + authoritative RDAP -> settle -> 200`

- invalid input: HTTP 400, no settlement
- source transport/contract failure: HTTP 502, `chargeable:false`, no settlement
- completed continuity-review decisions are chargeable
- unresolved payment: HTTP 503, retry the same authorization
- confirmed settlement: HTTP 200 with PAYMENT-RESPONSE and `x402-settled:true`

## Claim boundary

- `stable_domain` is a continuity/timing workflow signal only
- expiration runway does not guarantee renewal or uninterrupted service
- lastChanged recency does not by itself establish compromise, ownership transfer, malicious activity, or fraud
- legal-name/domain alignment does not prove domain ownership/control
- PA registry identity does not prove good standing, ownership, authority, creditworthiness, or legal compliance

## Discovery

Publish through generated:
- resource-array x402 catalog with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- deterministic release bundle

OpenAPI operationId:
`reviewPennsylvaniaVendorDomainContinuity`

## Verified live-source evidence — 2026-10-02

Input:
- company: OpenAI OpCo
- domain: openai.com
- minExpirationDays: 180
- minStableDays: 30

Observed:
- resolved legal name: Openai Opco, Llc
- filing number: 0014879623
- expiration date: 2029-01-19
- days until expiration: 840
- lastChanged date: 2024-10-17
- days since lastChanged: 715
- legal-name/domain alignment: true
- source failures: none
- decision: `stable_domain`

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.
