# Product 004 deployment plan — PA Business Address Match x402

Status: live-source-verified staging candidate. Production deployment is deferred while AppDeploy app usage/deployments are account-limit blocked.

## Contract

- Route: `GET /api/pa-business-address-match`
- Price: `$0.003 USDC`
- Atomic amount: `3000`
- Network: `eip155:8453`
- Asset: Base USDC
- payTo: `0x708f7b52b56eafd7fc1de65fc7752ed732914021`
- Inputs: `company`, `address`
- Decisions: `match` or `human_review`
- No automatic rejection.

## Evidence

Use authoritative sources directly:

1. Pennsylvania Department of State via `data.pa.gov/resource/xvd7-5r2c.json`
2. U.S. Census Bureau Geocoding Services

A `match` requires:
- one unique strong PA registry entity,
- complete registered-address evidence,
- Census match for supplied address,
- Census match for registry address,
- same primary street number,
- same ZIP,
- coordinate distance <= 0.25 miles.

## x402 ordering

1. Missing payment -> 402.
2. Decode payment.
3. Validate product input.
4. Verify payment.
5. Fetch evidence.
6. Required-source transport failure -> 502, `chargeable:false`, no settlement.
7. Completed evidence -> `match` or `human_review`.
8. Settle the same payment.
9. Unresolved settlement -> 503, retry same authorization.
10. Confirmed settlement -> 200 + PAYMENT-RESPONSE + `x402-settled:true`.

## Discovery

Add the route to:
- x402 discovery manifests,
- resource-array catalog with resource-level `accepts[]`,
- OpenAPI,
- llms/skill documentation,
- landing product list.

OpenAPI operationId:
`matchPennsylvaniaBusinessAddress`

## Claim boundary

A match means only that the supplied address is consistent with the selected public registry address under the configured Census comparison. It is not proof of:
- physical presence,
- address control,
- good standing,
- ownership,
- authority,
- fraud/sanctions/credit status,
- legal/compliance approval.

## Pre-deploy evidence

- deterministic decision tests: passing
- source composition tests: passing
- x402 ordering tests: passing
- discovery metadata tests: passing
- coordinated live-source smoke: passing
- live smoke example: OpenAI OpCo + registered Harrisburg address -> `match`

## Deployment blocker

AppDeploy account-wide usage/deployment pause is expected to remain until the weekly reset reported as `2026-10-05T00:00:00Z`. Do not pay for an upgrade unless explicitly authorized.

## Post-deploy acceptance

- unpaid route returns exact 402 for $0.003 / 3000 atomic USDC,
- invalid input does not settle,
- source failure does not settle,
- valid result settles before 200,
- discovery surfaces include resource-level accepts,
- Products 001–003 remain unchanged,
- production regression and live smoke pass.
