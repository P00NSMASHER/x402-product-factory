# Factory economics baseline — 2026-10-02

This completes the first small increment of Phase 1: a registry-wide settlement-cost screen. Full unit economics and profitability remain unmeasured.

## Evidence and assumptions

- Repository revision: `22688407b05a8b2dbc3badc7ed126d0e605e70a0`.
- Input: `product-registry.json`, 24 registered products.
- Payment implementation: `packages/x402/payment.js` uses Base and PayAI.
- [PayAI live pricing](https://facilitator.payai.network/pricing): Base `exact/eip3009` published rate **$0.00231 per settlement**, rate ID `3d1394f6-cae6-4a75-ae3b-1a3c29d428cb`; provider snapshot `asOf=2026-10-02T14:09:15.615Z`, effective `2026-09-22T11:11:01.537Z`.
- [PayAI account terms](https://docs.payai.network/x402/facilitators/pricing) describe a finite free allowance. This screen models paid settlement after that allowance; the seller's remaining credits, legacy allowance, discounts, and account-specific terms have not been inspected.
- Assumes one successful settlement per purchase at the published rate. Rates can change; refresh before launch or pricing decisions.
- The proposed 70% contribution target comes from the development plan and is a planning threshold, not an approved price change.

## Results

**7 of 24 registered prices fall below the settlement fee. 22 of 24 cannot reach the proposed 70% contribution target even before source, hosting, retry, refund, and other operating costs.** These counts include Product 024, which is in design; staging and reference status do not establish current availability or sales.

| Product | Registry status | Price USDC | Remaining after fee | Fee-only margin |
| --- | --- | ---: | ---: | ---: |
| 001 pa-entity-lookup | reference-production | $0.001 | -$0.001310 | -131.0% |
| 002 pa-vendor-intake-gate | production-reference | $0.020 | $0.017690 | 88.4% |
| 003 pa-vendor-identity-match | live-source-verified-staging | $0.005 | $0.002690 | 53.8% |
| 004 pa-business-address-match | live-source-verified-staging | $0.003 | $0.000690 | 23.0% |
| 005 pa-business-domain-match | live-source-verified-staging | $0.003 | $0.000690 | 23.0% |
| 006 sec-filing-freshness | source-contract-verified-staging | $0.005 | $0.002690 | 53.8% |
| 007 domain-registration-age | live-source-verified-staging | $0.002 | -$0.000310 | -15.5% |
| 008 treasury-average-rate-threshold | live-source-verified-staging | $0.003 | $0.000690 | 23.0% |
| 009 ofac-name-review-gate | live-source-verified-staging | $0.003 | $0.000690 | 23.0% |
| 010 pa-business-formation-age | live-source-verified-staging | $0.002 | -$0.000310 | -15.5% |
| 011 domain-expiration-horizon | live-source-verified-staging | $0.002 | -$0.000310 | -15.5% |
| 012 domain-last-changed-recency | live-source-verified-staging | $0.002 | -$0.000310 | -15.5% |
| 013 sec-company-identity-match | source-contract-verified-staging | $0.003 | $0.000690 | 23.0% |
| 014 treasury-average-rate-trend | live-source-verified-staging | $0.003 | $0.000690 | 23.0% |
| 015 treasury-average-rate-spread | live-source-verified-staging | $0.003 | $0.000690 | 23.0% |
| 016 pa-entity-ofac-review | live-source-verified-staging | $0.005 | $0.002690 | 53.8% |
| 017 pa-vendor-new-domain-review | live-source-verified-staging | $0.005 | $0.002690 | 53.8% |
| 018 pa-vendor-counterparty-review | live-source-verified-staging | $0.010 | $0.007690 | 76.9% |
| 019 pa-vendor-maturity-review | live-source-verified-staging | $0.007 | $0.004690 | 67.0% |
| 020 pa-vendor-domain-continuity-review | live-source-verified-staging | $0.006 | $0.003690 | 61.5% |
| 021 pa-entity-type-policy | live-source-verified-staging | $0.002 | -$0.000310 | -15.5% |
| 022 pa-registered-county-policy | live-source-verified-staging | $0.002 | -$0.000310 | -15.5% |
| 023 pa-local-vendor-policy-gate | live-source-verified-staging | $0.004 | $0.001690 | 42.3% |
| 024 pa-vendor-distance-gate | design | $0.004 | $0.001690 | 42.3% |

The seven settlement-negative products are 001, 007, 010, 011, 012, 021, 022.
Only Products 002 and 018 exceed 70% on this fee-only calculation; neither is certified profitable by this screen.

## Pricing floor and next evidence

Contribution per settled sale = collected price minus settlement, source, incremental hosting, and expected failed-request/retry/refund costs.

For a 70% contribution target, required price = measured variable cost / 0.30.
Settlement alone implies **$0.007700** at this snapshot. Actual required prices will be higher when other costs are included. Development, shared hosting, maintenance, and distribution costs must additionally be covered before claiming total profit.

Next small increment: record source request counts, caching/freshness behavior, hosting cost assumptions, and unknown costs for five existing products. Then verify applicable seller credit/account terms and calculate complete unit economics.

## Progress

- Phase 1, increment 1: settlement-cost baseline complete as a reviewable candidate.
- Phase 1 remains in progress: full costs, account terms, break-even demand, and price decisions are outstanding.
- Phases 2–7: six later phases remain.
- This note changes no product price, payment rail, deployment, or account setting.
