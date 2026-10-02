# Product 018 deployment plan — PA Vendor Counterparty Review x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/pa-vendor-counterparty-review`
- Price: `$0.010 USDC`
- Atomic amount: `10000`
- Network: `eip155:8453`
- Inputs:
  - `company`
  - `domain`
  - optional `minScore` 70–100, default 90
  - optional `minDomainAgeDays` 1–3650, default 90
- Decisions:
  - `proceed`
  - `human_review`
- No automatic reject.

## Decision sequence

1. Resolve the submitted company against Pennsylvania Department of State data.
2. Require one unique strong legal-entity match.
3. Screen the **resolved legal name** against current OFAC SDN primary names and aliases.
4. Query the supplied domain through IANA bootstrap and its authoritative registry RDAP service.
5. Require the domain hostname to plausibly align with the resolved legal name.
6. Read the authoritative registration event.
7. Require domain age >= `minDomainAgeDays`.

`proceed` is returned only when every configured review trigger passes.

Any OFAC candidate, recent domain registration, unregistered domain, domain/legal-name mismatch, ambiguous registry identity, incomplete evidence, or other completed review trigger returns `human_review`.

## Sources

- Pennsylvania Department of State via data.pa.gov
- U.S. Treasury OFAC current SDN.CSV + ALT.CSV
- IANA RDAP bootstrap
- authoritative TLD registry RDAP

No seller-owned paid/demo endpoint is called internally.

## Payment lifecycle

`402 -> validate input -> verify payment -> PA registry + OFAC + authoritative RDAP -> settle -> 200`

- invalid input: HTTP 400, no settlement
- source transport/contract failure: HTTP 502, `chargeable:false`, no settlement
- completed human-review evidence is chargeable
- unresolved payment: HTTP 503, retry the same payment authorization
- confirmed settlement: HTTP 200 with PAYMENT-RESPONSE and `x402-settled:true`

## Claim boundary

- proceed is only a workflow signal that configured review triggers were not hit
- a no-candidate OFAC result is not sanctions clearance
- OFAC 50 Percent Rule ownership analysis is not included
- domain-name alignment does not prove ownership/control
- recent domain registration is a review signal, not proof of fraud
- PA registry identity does not prove good standing, ownership, authority to contract, creditworthiness, or legal compliance

## Discovery

Publish through generated:
- resource-array x402 catalog with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- deterministic release bundle

OpenAPI operationId:
`reviewPennsylvaniaVendorCounterparty`

## Verified live-source evidence — 2026-10-02

Input:
- company: OpenAI OpCo
- domain: openai.com
- minScore: 90
- minDomainAgeDays: 90

Observed:
- resolved legal name: Openai Opco, Llc
- filing number: 0014879623
- OFAC candidates at/above threshold: 0
- authoritative domain registration date: 2007-01-19
- observed domain age: 7196 days
- legal-name/domain alignment: true
- source failures: none
- decision: `proceed`

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.
