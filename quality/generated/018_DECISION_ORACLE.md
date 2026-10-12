# Product 018 — evidence-contradiction oracle

Offline QA only. All 30 gold labels were authored as **synthetic test expectations**; no independently labeled real-world evidence or actual buyer validation exists.

- Baseline synthetic oracle matches: **19/30**.
- Offline hardened candidate synthetic oracle matches: **30/30**.
- Baseline synthetic incorrect `proceed`: **11**.
- Hardened candidate synthetic incorrect `proceed`: **0**.
- Release: **HOLD_OFFLINE_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW**; no production change.

| Synthetic fixture | Oracle | Current staging decision | Offline proposed decision |
|---|---|---|---|
| clean_consistent | proceed | proceed | proceed |
| clean_registered_alias | proceed | proceed | proceed |
| registry_unavailable | human_review | human_review | human_review |
| registry_missing | human_review | human_review | human_review |
| registry_ambiguous | human_review | human_review | human_review |
| registry_weak | human_review | human_review | human_review |
| registry_missing_name | human_review | human_review | human_review |
| registry_two_strong_candidates | human_review | proceed | human_review |
| registry_zero_candidates_with_entity | human_review | proceed | human_review |
| registry_negative_count | human_review | proceed | human_review |
| registry_fractional_count | human_review | proceed | human_review |
| ofac_unavailable | human_review | human_review | human_review |
| ofac_name_candidate | human_review | human_review | human_review |
| ofac_total_positive_candidates_empty | human_review | human_review | human_review |
| ofac_negative_total | human_review | proceed | human_review |
| ofac_positive_array_zero_total | human_review | proceed | human_review |
| ofac_count_missing | human_review | proceed | human_review |
| ofac_candidates_missing | human_review | proceed | human_review |
| ofac_nan_total | human_review | proceed | human_review |
| rdap_unavailable | human_review | human_review | human_review |
| domain_unregistered | human_review | human_review | human_review |
| domain_registration_unknown | human_review | human_review | human_review |
| domain_name_mismatch | human_review | human_review | human_review |
| domain_date_missing | human_review | human_review | human_review |
| domain_invalid_calendar | human_review | proceed | human_review |
| domain_future_registration | human_review | human_review | human_review |
| domain_threshold_equal | proceed | proceed | proceed |
| domain_threshold_just_below | human_review | human_review | human_review |
| dual_ofac_and_recent_domain | human_review | human_review | human_review |
| dual_ofac_bad_count_and_bad_date | human_review | proceed | human_review |

## Decision-design findings

The offline candidate adds conservative guards for contradictory registry candidate counts, inconsistent/incomplete OFAC candidate tallies and invalid/future authoritative domain registration dates. Existing matching, ambiguous, no-candidate and exact-age-boundary decisions remain unchanged when the evidence contract is coherent.

The real staging decision implementation, source adapters, payment handlers, registered prices, wallets and production runtime are **unchanged**. Human source-contract, privacy/security, independent gold-label evaluation, costs and product-value reviews remain required before considering integration.
