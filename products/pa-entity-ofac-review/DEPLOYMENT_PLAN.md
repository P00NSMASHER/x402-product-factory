# Product 016 deployment plan — PA Entity OFAC Review Gate x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/pa-entity-ofac-review`
- Price: `$0.005 USDC`
- Atomic amount: `5000`
- Network: `eip155:8453`
- Inputs:
  - `company`
  - optional `minScore` 70–100, default 90
- Decisions:
  - `candidate_found`
  - `no_candidate`
  - `company_not_found`
  - `human_review`

## Decision sequence

1. Resolve the submitted company name against Pennsylvania Department of State data.
2. If no PA entity is found, return `company_not_found`.
3. If the PA identity is ambiguous or not strong enough, return `human_review`.
4. If one strong entity resolves, screen the **resolved legal business name** against current OFAC SDN primary-name and alias data.
5. Return `candidate_found` or `no_candidate`.

The raw user-entered alias/brand name is not screened in place of the resolved legal entity name.

## Sources

- Pennsylvania Department of State via data.pa.gov
- U.S. Treasury OFAC Specially Designated Nationals (SDN) List:
  - SDN.CSV
  - ALT.CSV

No seller-owned paid component endpoint is called internally.

## Payment lifecycle

`402 -> validate input -> verify payment -> registry resolution -> OFAC screen when applicable -> settle -> 200`

- invalid input: HTTP 400, no settlement
- registry transport failure: HTTP 502, `chargeable:false`, no settlement
- OFAC transport failure after registry resolution: HTTP 502, `chargeable:false`, no settlement
- completed `company_not_found`, `candidate_found`, or `no_candidate`: chargeable completed evidence
- unresolved payment: HTTP 503 and retry the same payment authorization

## Claim boundary

This is first-pass candidate-name screening.

It does not provide:
- a legal sanctions determination,
- sanctions clearance,
- OFAC 50 Percent Rule ownership analysis,
- beneficial-ownership analysis,
- proof of good standing,
- proof of ownership or contracting authority.

A `candidate_found` result means human review is warranted, not that the entity is sanctioned.

A `no_candidate` result means no name/alias candidate met the configured score threshold in the loaded OFAC data. It is not sanctions clearance.

## Discovery

Publish through the generated:
- resource-array x402 catalogs with resource-level `accepts[]`
- OpenAPI
- product index
- llms text
- release bundle

OpenAPI operationId:
`reviewPennsylvaniaEntityOfacName`

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.

## Verified live-source evidence

- submitted company: OpenAI OpCo
- resolved Pennsylvania legal name: Openai Opco, Llc
- filing number: 0014879623
- OFAC minimum score: 90
- OFAC candidate count: 0
- decision: `no_candidate`
- source failures: none
