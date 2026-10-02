# Product 003 — PA Vendor Identity Match

Proposed route:

`GET /api/pa-vendor-identity-match?company=...&address=...&domain=...`

Proposed price: **$0.005 USDC on Base**.

This product is intentionally narrower than Product 002. It does not perform OFAC screening or provide a vendor-intake continuation decision.

It checks only whether:
1. the company name strongly resolves to a Pennsylvania registry entity,
2. the supplied and registry addresses geocode within 0.25 miles, and
3. RDAP confirms the supplied domain is registered.

Possible results:
- `consistent`
- `human_review`

There is no automatic reject result.

A `consistent` result is not proof of domain ownership, address control, good standing, authority, fraud risk, sanctions status, creditworthiness, or legal compliance.
