# Product Factory — cost sensitivity frontier

All amounts below are **hypothetical arithmetic from 2026 specification-pinned fee assumptions**, not current facilitator quotes, real provider invoices, confirmed profit, or willingness-to-pay estimates.

## Critical Product 018 constraint

- Existing registered price: **$0.010 USDC**.
- Historical paid settlement assumption: **$0.002310 USD** per transaction.
- To keep a 70% margin, **all additional actual incremental costs together** could total no more than **$0.000690** under those assumptions.
- Actual hosting, network retries, source API fees, refunds, support and seller-specific facilitator pricing are **unverified**, so commercial viability remains HOLD.

## Registered portfolio: estimated cost headroom

| # | Product | Registered USDC | Historical fee-only margin | Cost headroom at target | Hypothetical minimum 0.001-grid price |
|---|---|---:|---:|---:|---:|
| 003 | pa-vendor-identity-match | 0.005 | 53.8% | -0.000810 | 0.008 |
| 004 | pa-business-address-match | 0.003 | 23.0% | -0.001410 | 0.008 |
| 005 | pa-business-domain-match | 0.003 | 23.0% | -0.001410 | 0.008 |
| 006 | sec-filing-freshness | 0.005 | 53.8% | -0.000810 | 0.008 |
| 007 | domain-registration-age | 0.002 | -15.5% | -0.001710 | 0.008 |
| 008 | treasury-average-rate-threshold | 0.003 | 23.0% | -0.001410 | 0.008 |
| 009 | ofac-name-review-gate | 0.003 | 23.0% | -0.001410 | 0.008 |
| 010 | pa-business-formation-age | 0.002 | -15.5% | -0.001710 | 0.008 |
| 011 | domain-expiration-horizon | 0.002 | -15.5% | -0.001710 | 0.008 |
| 012 | domain-last-changed-recency | 0.002 | -15.5% | -0.001710 | 0.008 |
| 013 | sec-company-identity-match | 0.003 | 23.0% | -0.001410 | 0.008 |
| 014 | treasury-average-rate-trend | 0.003 | 23.0% | -0.001410 | 0.008 |
| 015 | treasury-average-rate-spread | 0.003 | 23.0% | -0.001410 | 0.008 |
| 016 | pa-entity-ofac-review | 0.005 | 53.8% | -0.000810 | 0.008 |
| 017 | pa-vendor-new-domain-review | 0.005 | 53.8% | -0.000810 | 0.008 |
| 018 | pa-vendor-counterparty-review | 0.010 | 76.9% | 0.000690 | 0.008 |
| 019 | pa-vendor-maturity-review | 0.007 | 67.0% | -0.000210 | 0.008 |
| 020 | pa-vendor-domain-continuity-review | 0.006 | 61.5% | -0.000510 | 0.008 |
| 021 | pa-entity-type-policy | 0.002 | -15.5% | -0.001710 | 0.008 |
| 022 | pa-registered-county-policy | 0.002 | -15.5% | -0.001710 | 0.008 |
| 023 | pa-local-vendor-policy-gate | 0.004 | 42.2% | -0.001110 | 0.008 |
| 024 | pa-vendor-distance-gate | 0.004 | 42.2% | -0.001110 | 0.008 |

**Important:** A negative headroom means the historical fee-only target is already missed before unknown real costs. The price floor is a *mathematical hypothetical*, never an approved or recommended price change.

## Sensitivity illustration for Product 018

| Hypothetical extra cost | Hypothetical margin | Mathematical 70% screen |
|---:|---:|---|
| $0.000000 | 76.9% | passes |
| $0.000500 | 71.9% | passes |
| $0.001000 | 66.9% | fails |

No observed purchases, buyer effects, verified current provider charges or price changes were created. Preserve the Product 025+ freeze and human commercial/security review.
