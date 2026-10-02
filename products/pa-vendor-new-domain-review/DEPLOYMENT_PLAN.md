# Product 017 deployment plan — PA Vendor New-Domain Review x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/pa-vendor-new-domain-review`
- Price: `$0.005 USDC`
- Atomic amount: `5000`
- Network: `eip155:8453`
- Inputs:
  - `company`
  - `domain`
  - optional `minDomainAgeDays` 1–3650, default 90
- Decisions:
  - `established_domain_match`
  - `recent_domain_review`
  - `domain_mismatch`
  - `unregistered_domain`
  - `company_not_found`
  - `human_review`

## Decision sequence

1. Resolve the submitted company name against Pennsylvania Department of State data.
2. Require one unique strong legal-entity match for automated continuation.
3. Query authoritative RDAP for the supplied domain.
4. Compare the domain hostname against the **resolved legal business name**, not merely the raw submitted alias.
5. Read the authoritative domain registration event.
6. Compare domain age to `minDomainAgeDays`.

Recent registration produces `recent_domain_review`, not automatic rejection.

## Sources

- Pennsylvania Department of State via data.pa.gov
- IANA RDAP bootstrap
- authoritative TLD registry RDAP

No seller-owned paid/demo endpoint is called internally.

## Payment lifecycle

`402 -> validate input -> verify payment -> PA entity resolution -> authoritative RDAP -> settle -> 200`

- invalid input: HTTP 400, no settlement
- registry/RDAP transport failure: HTTP 502, `chargeable:false`, no settlement
- completed evidence decisions are chargeable
- unresolved payment: HTTP 503 and retry the same payment authorization

## Claim boundary

- domain-name alignment is a deterministic heuristic and does not prove domain ownership/control
- recent registration is a review signal, not proof of fraud
- an established domain is not proof a vendor is safe or trustworthy
- a PA registry match does not prove good standing, ownership, or authority to contract

## Discovery

Publish through generated:
- resource-array x402 catalogs with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- release bundle

OpenAPI operationId:
`reviewPennsylvaniaVendorDomainAge`

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.

## Verified live-source evidence

- submitted company: OpenAI OpCo
- resolved legal name: Openai Opco, Llc
- filing number: 0014879623
- domain: openai.com
- authoritative registration date: 2007-01-19
- minimum domain age: 90 days
- observed domain age: 7196 days
- decision: `established_domain_match`
- source failures: none
