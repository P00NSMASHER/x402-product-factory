# Product 019 deployment plan — PA Vendor Maturity Review x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/pa-vendor-maturity-review`
- Price: `$0.007 USDC`
- Atomic amount: `7000`
- Network: `eip155:8453`
- Inputs:
  - `company`
  - `domain`
  - optional `minEntityAgeDays` 1–36500, default 30
  - optional `minDomainAgeDays` 1–3650, default 90
- Decisions:
  - `established_vendor`
  - `human_review`
- No automatic reject.

## Decision sequence

1. Resolve the submitted company to one unique strong Pennsylvania Department of State legal entity.
2. Read the registry creation date and require entity age >= `minEntityAgeDays`.
3. Query the supplied domain through IANA bootstrap and authoritative registry RDAP.
4. Require the domain to plausibly align with the **resolved legal business name**.
5. Require domain registration age >= `minDomainAgeDays`.

Any recent entity, recent domain, unregistered domain, legal-name/domain mismatch, ambiguous registry identity, incomplete evidence, or source uncertainty returns `human_review`.

## Sources

- Pennsylvania Department of State via data.pa.gov
- IANA RDAP bootstrap
- authoritative TLD registry RDAP

No seller-owned paid/demo endpoint is called internally.

## Payment lifecycle

`402 -> validate input -> verify payment -> PA registry + authoritative RDAP -> settle -> 200`

- invalid input: HTTP 400, no settlement
- source transport/contract failure: HTTP 502, `chargeable:false`, no settlement
- completed maturity-review decisions are chargeable
- unresolved payment: HTTP 503, retry the same authorization
- confirmed settlement: HTTP 200 with PAYMENT-RESPONSE and `x402-settled:true`

## Claim boundary

- `established_vendor` is a maturity/history workflow signal only
- entity age does not establish current good standing, ownership, authority, legitimacy, creditworthiness, or legal compliance
- domain age and legal-name alignment do not prove domain ownership/control
- older entity/domain history is not proof a vendor is safe or trustworthy
- recent entity/domain registration is a review signal, not proof of fraud

## Discovery

Publish through generated:
- resource-array x402 catalog with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- deterministic release bundle

OpenAPI operationId:
`reviewPennsylvaniaVendorMaturity`

## Verified live-source evidence — 2026-10-02

Input:
- company: OpenAI OpCo
- domain: openai.com
- minEntityAgeDays: 30
- minDomainAgeDays: 90

Observed:
- resolved legal name: Openai Opco, Llc
- filing number: 0014879623
- entity creation date: 2025-09-29
- entity age: 368 days
- authoritative domain registration date: 2007-01-19
- domain age: 7196 days
- legal-name/domain alignment: true
- source failures: none
- decision: `established_vendor`

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.
