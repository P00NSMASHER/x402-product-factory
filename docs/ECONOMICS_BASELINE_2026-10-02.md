# Factory economics baseline — 2026-10-02

This records the first two increments of Phase 1: a registry-wide settlement-cost screen plus a source/hosting measurement pass for five canonical factory-managed products. Full unit economics and profitability remain unmeasured.

## Evidence and assumptions

- Repository revision: `22688407b05a8b2dbc3badc7ed126d0e605e70a0`.
- Input: `product-registry.json`, 24 registered products.
- Payment implementation: `packages/x402/payment.js` uses Base and PayAI.
- [PayAI live pricing](https://facilitator.payai.network/pricing): Base `exact/eip3009` published rate **$0.00231 per settlement**, rate ID `3d1394f6-cae6-4a75-ae3b-1a3c29d428cb`; provider snapshot `asOf=2026-10-02T14:09:15.615Z`, effective `2026-09-22T11:11:01.537Z`.
- [PayAI account terms](https://docs.payai.network/x402/facilitators/pricing) currently specify 1,000 free credits per receiving wallet for life for new wallets. At the current Base EIP-3009 rate of 2.31 credits/settlement, that is at most 432 complete Base settlements if the entire default allowance is available. Shared hosts/IPs also draw from a shared pool and may exhaust earlier; some older wallets retain a 10,000-credit legacy allowance.
- The seller wallet's specific entitlement and remaining free-credit balance are still unverified. This screen therefore keeps two states separate: $0 facilitator fee while a verified allowance remains, and the published paid settlement rate after allowance exhaustion.
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

## Five-product source and hosting measurement — increment 2

Machine-readable evidence: `economics/phase1-five-product-costs.json`. Its arithmetic and registry binding are enforced by `economics/phase1-five-product-costs.test.js`.

The measured scope is Products **003–007**, the first five products whose complete decision/source paths are canonical modules in this repository. Products 001 and 002 remain production/reference routes and are not used to infer the generated factory runtime's source-call profile.

| Product | Normal source requests, cold | Normal source requests, warm | Configured direct source fee | Incremental hosting cost | Lower-bound contribution after settlement + configured source fees |
| --- | ---: | ---: | ---: | ---: | ---: |
| 003 PA Vendor Identity Match | 5–6 | 4–5 | $0.000000 | unknown | $0.002690 |
| 004 PA Business Address Match | 3–4 | 3–4 | $0.000000 | unknown | $0.000690 |
| 005 PA Business Domain Match | 3–4 | 2–3 | $0.000000 | unknown | $0.000690 |
| 006 SEC Filing Freshness | 1–2 | 1–2 | $0.000000 | unknown | $0.002690 |
| 007 Domain Registration Age | 2 | 1 | $0.000000 | unknown | -$0.000310 |

Request-count details:

- The PA registry adapter normally performs one prefix search and performs a second contains search when fewer than three prefix rows are returned. Retryable timeout/429/5xx errors can raise those PA calls to four before failure.
- Census address comparison performs two geocoder calls: supplied address and registry address.
- RDAP performs one IANA bootstrap fetch plus one authoritative registry request on a cold adapter. Only the IANA bootstrap document is cached in memory; authoritative domain results are not cached.
- SEC freshness performs one submissions request when CIK is supplied, or a ticker-map request plus submissions request when ticker is supplied. The adapter has no response cache.
- A configured direct source fee of $0 means these implementations contain no paid source credential or source-billing path. It does **not** assert unlimited upstream capacity, immunity from rate limits, or a permanent provider pricing guarantee.

Hosting remains intentionally fail-closed. Products 003–007 are staging candidates and are not currently deployed through the factory because the AppDeploy free-tier pause prevents a live runtime cost measurement. The existing reference seller at `https://pa-entity-x402.floot.app` is currently published on Floot's free plan, but that fact is not used to assume zero-cost capacity for Products 003–007.

Therefore the table's contribution values are lower bounds, not complete margins. They subtract the current PayAI settlement rate and configured direct source fees, but **not** unknown incremental hosting, retries/failures, refunds, development, maintenance, or distribution.

## Free-credit terms — increment 3

Current PayAI documentation now resolves the general allowance model:

- new receiving wallets: **1,000 free credits lifetime**, not a monthly reset;
- current Base exact/EIP-3009 settlement: **2.31 credits = $0.00231**;
- maximum complete Base settlements under an untouched 1,000-credit allowance at this rate: **432**;
- shared hosts/IPs also consume a shared pool and may hit the applicable limit sooner;
- some older receiving wallets retain a **10,000-credit** legacy allowance;
- pre-21-September-2026 settlements count as one credit each toward the allowance.

This does **not** establish the current seller wallet's remaining allowance. No public endpoint inspected here exposes that wallet-specific balance, so the economics record leaves it null rather than assuming either free or exhausted status.

Operationally, the post-allowance pricing floor remains the sustainable scaling constraint. During a verified free-credit window, settlement cost can be $0, but that temporary allowance should not be used to certify a product's long-run margin.

## Pricing floor and next evidence

Contribution per settled sale = collected price minus settlement, source, incremental hosting, and expected failed-request/retry/refund costs.

For a 70% contribution target, required price = measured variable cost / 0.30.
Settlement alone implies **$0.007700** at this snapshot. Actual required prices will be higher when other costs are included. Development, shared hosting, maintenance, and distribution costs must additionally be covered before claiming total profit.

Next small increment: obtain account-specific evidence for the seller wallet's remaining/legacy PayAI allowance, then measure live shared-host request/capacity behavior when Products 003–007 have a non-credit-gated origin. Keep retry/failure/refund cost fail-closed until observed.

## Progress

- Phase 1, increment 1: settlement-cost baseline complete as a reviewable candidate.
- Phase 1, increment 2: Products 003–007 source-request profiles, source billing configuration, caching behavior, and hosting unknowns recorded with a machine-readable test.
- Phase 1, increment 3: current PayAI free-credit rules and the 432-Base-settlement ceiling for a fully available new-wallet allowance recorded; seller-wallet-specific remaining entitlement stays explicitly unknown.
- Phase 1 remains in progress: seller-wallet balance evidence, live hosting/capacity cost, failure/retry/refund rates, break-even demand, and price decisions are outstanding.
- Phases 2–7: six later phases remain.
- This note changes no product price, payment rail, deployment, or account setting.
