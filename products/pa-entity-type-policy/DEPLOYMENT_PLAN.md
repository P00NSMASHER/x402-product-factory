# Product 021 deployment plan — PA Entity Type Policy x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/pa-entity-type-policy`
- Price: `$0.002 USDC`
- Atomic amount: `2000`
- Network: `eip155:8453`
- Inputs: `company`, `allowedKinds`
- Decisions: `policy_match`, `policy_mismatch`, `company_not_found`, `human_review`

Supported normalized kinds:
- `llc`
- `corporation`
- `limited_partnership`
- `llp`
- `professional_corporation`
- `other`

## Evidence

Source:
`https://data.pa.gov/resource/xvd7-5r2c.json`

Use the shared PA registry adapter and require one unique strong entity match for automatic policy evaluation.

The source `registrationType` is normalized deterministically to one stable policy kind.

## Charging semantics

- missing payment -> 402
- invalid company/allowedKinds -> 400, no settlement
- registry transport failure -> 502, `chargeable:false`, no settlement
- completed `policy_match` or `policy_mismatch` -> chargeable
- unresolved verify/settle -> 503, retry same payment authorization
- confirmed settlement -> 200 + PAYMENT-RESPONSE

## Claim boundary

This product evaluates only the caller-supplied legal-entity-type policy. It does not determine or prove:
- good standing,
- ownership,
- authority to contract,
- tax treatment,
- liability protection,
- fraud risk,
- sanctions status,
- creditworthiness,
- legal or regulatory compliance.

## Pre-deploy evidence

- decision tests: passing
- service/input tests: passing
- x402 handler tests: passing
- discovery metadata tests: passing
- factory integrity CI: passing
- live PA registry smoke: passing
- live example: OpenAI OpCo -> Foreign Limited Liability Company -> llc -> policy_match for allowedKinds=llc,corporation

## Current deployment blocker

AppDeploy deployment remains blocked by the previously recorded Free-tier weekly limit. Do not purchase an upgrade unless explicitly authorized.
