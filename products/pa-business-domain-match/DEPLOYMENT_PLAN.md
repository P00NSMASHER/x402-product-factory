# Product 005 deployment plan — PA Business Domain Match x402

Status: live-source-verified staging candidate. Production deployment is deferred while AppDeploy is account-limit paused.

## Contract

- Route: `GET /api/pa-business-domain-match`
- Price: `$0.003 USDC`
- Atomic amount: `3000`
- Network: `eip155:8453`
- Inputs: `company`, `domain`
- Decisions: `match` or `human_review`
- No automatic reject.

## Evidence

1. Pennsylvania Department of State registry via `data.pa.gov`
2. IANA RDAP bootstrap
3. authoritative TLD registry RDAP

A `match` requires:
- exactly one strong PA registry identity candidate,
- authoritative RDAP resolution,
- registered domain,
- plausible company/domain name alignment.

A registered but unrelated domain returns `human_review`; that completed evidence result is chargeable. Source transport failure is non-chargeable and must not settle.

## x402 ordering

`402 -> validate input -> verify -> source work -> settle -> 200`

- bad input: 400, no settlement
- required source failure: 502, `chargeable:false`, no settlement
- unresolved payment state: 503, retry same authorization
- confirmed settlement: 200 + PAYMENT-RESPONSE

## Discovery

Publish with resource-level `accepts[]` in the x402 catalog, plus OpenAPI and agent documentation.

OpenAPI operationId:
`matchPennsylvaniaBusinessDomain`

## Claim boundary

A match is only a public-evidence identity consistency signal. It does not prove domain ownership/control, business good standing, ownership, authority to contract, fraud risk, sanctions status, creditworthiness, or legal compliance.

## Pre-deploy evidence

- decision tests: passing
- service tests: passing
- paid-handler tests: passing
- discovery metadata tests: passing
- coordinated live-source smoke: passing
- live example: OpenAI OpCo + openai.com -> `match`

## Deployment blocker

AppDeploy weekly Free-tier reset reported as `2026-10-05T00:00:00Z`. No upgrade/spend authorized.
