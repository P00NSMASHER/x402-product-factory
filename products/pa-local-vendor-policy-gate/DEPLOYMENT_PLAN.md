# Product 023 deployment plan — PA Local Vendor Policy Gate x402

- Route: `GET /api/pa-local-vendor-policy-gate`
- Price: `$0.004 USDC`
- Atomic amount: `4000`
- Inputs: company, allowedKinds, allowedCounties, optional minAgeDays (default 365)
- Decisions: proceed, human_review, company_not_found

Use exactly one shared PA registry lookup, then evaluate entity type, source-published registered county, and formation age. A completed caller-policy failure is chargeable human_review. Registry transport failure is non-chargeable and must not settle.

Proceed is only a workflow signal for the caller's supplied policy. It is not legal/compliance approval or proof of good standing, ownership, authority, local operations, tax situs, fraud risk, sanctions status, or creditworthiness.
