# Product Quality Lab — design improvement backlog

Generated from the **existing 22 specifications only**. This is NOT independently verified product-market fit, buyer demand, actual profitability, or launch approval.

## Observable historical fee-only categories

- Registered prices below the *spec-pinned* paid settlement/source-fee assumptions: **6**.
- Positive fee-only amount but below the spec's 70% margin target: **15**.
- Mathematically pass the fee-only screen before unknown real costs: **1**.

The historical settlement-fee assumptions may be stale. Actual hosting, source-provider billing, retries, refunds, latency, accuracy, buyer identity, repeat purchase, and willingness to pay are **unknown**, not zero.

## First-order product improvement queue

1. **Prove buyer utility:** For a multi-source workflow candidate, benchmark a real user's task against direct/free authoritative source lookups; capture time, error and decision-action outcomes using blinded cases.
2. **Make outputs decision-ready:** Design explicit evidence provenance, reason codes, uncertainty, and reviewer next actions without upgrading an identity, name-match or metadata signal into a legal clearance.
3. **Repair product economics:** For the six historically fee-negative standalone tools, test bundling/re-scoping as *hypotheses* rather than changing live price or asserting demand.
4. **Keep review gates separate:** Run adversarial input/failure tests and independent buyer, source, privacy and full invoice review before proposing any commercial release.

## Product-by-product experiments

| # | Product | Registered USDC | Historical fee-only margin | Category | Next experiment |
|---|---|---:|---:|---|---|
| 003 | pa-vendor-identity-match | 0.005 | 53.8% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 004 | pa-business-address-match | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 005 | pa-business-domain-match | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 006 | sec-filing-freshness | 0.005 | 53.8% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 007 | domain-registration-age | 0.002 | -15.5% | fee_negative | repackage_or_retire_standalone_hypothesis |
| 008 | treasury-average-rate-threshold | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 009 | ofac-name-review-gate | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 010 | pa-business-formation-age | 0.002 | -15.5% | fee_negative | repackage_or_retire_standalone_hypothesis |
| 011 | domain-expiration-horizon | 0.002 | -15.5% | fee_negative | repackage_or_retire_standalone_hypothesis |
| 012 | domain-last-changed-recency | 0.002 | -15.5% | fee_negative | repackage_or_retire_standalone_hypothesis |
| 013 | sec-company-identity-match | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 014 | treasury-average-rate-trend | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 015 | treasury-average-rate-spread | 0.003 | 23.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 016 | pa-entity-ofac-review | 0.005 | 53.8% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 017 | pa-vendor-new-domain-review | 0.005 | 53.8% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 018 | pa-vendor-counterparty-review | 0.010 | 76.9% | passes_fee_only_screen | run_buyer_workflow_benchmark_before_any_commercial_claim |
| 019 | pa-vendor-maturity-review | 0.007 | 67.0% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 020 | pa-vendor-domain-continuity-review | 0.006 | 61.5% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 021 | pa-entity-type-policy | 0.002 | -15.5% | fee_negative | repackage_or_retire_standalone_hypothesis |
| 022 | pa-registered-county-policy | 0.002 | -15.5% | fee_negative | repackage_or_retire_standalone_hypothesis |
| 023 | pa-local-vendor-policy-gate | 0.004 | 42.2% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |
| 024 | pa-vendor-distance-gate | 0.004 | 42.2% | below_target_fee_only | prove_incremental_buyer_value_and_full_cost_fit |

## Hard boundaries

- No real buyer counts are inferred from fixtures, HTTP 200, web visits, or operator-supplied claims.
- No automatic price adjustment, launch, refund, wallet, payment submission, or Product 025+ generation/unlock.
- None of the 22 products is marked commercially validated by this report.
