# Product 022 deployment plan — PA Registered County Policy x402

- Route: `GET /api/pa-registered-county-policy`
- Price: `$0.002 USDC`
- Atomic amount: `2000`
- Network: `eip155:8453`
- Inputs: `company`, `allowedCounties`
- Decisions: `policy_match`, `policy_mismatch`, `company_not_found`, `human_review`

Use the shared direct Pennsylvania Department of State adapter. Validate county names before payment verification. Completed policy mismatch is chargeable; registry transport failure is non-chargeable and must not settle.

Claim boundary: this checks only source-published registered county against caller policy. It does not prove operations, headquarters, service area, residency, local ownership, tax situs, good standing, authority, or legal compliance.

Publish in resource-level x402 `accepts[]`, OpenAPI, llms/skill docs, and generated factory discovery surfaces.
