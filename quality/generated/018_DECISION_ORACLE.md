# Product 018 — evidence-contradiction oracle

Offline QA only. All 40 gold labels were authored as **synthetic test expectations**; no independently labeled real-world evidence or actual buyer validation exists.

- Baseline synthetic oracle matches: **22/40**.
- Offline hardened candidate synthetic oracle matches: **40/40**.
- Baseline synthetic incorrect `proceed`: **18**.
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
| registry_two_ranked_one_strong_valid | proceed | proceed | proceed |
| registry_three_ranked_one_strong_valid | proceed | proceed | proceed |
| registry_ranked_overflow | human_review | proceed | human_review |
| registry_strong_count_missing | human_review | proceed | human_review |
| registry_unverified_identity_complete | human_review | proceed | human_review |
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
| ofac_wrong_entity_screened | human_review | proceed | human_review |
| ofac_wrong_threshold_screened | human_review | proceed | human_review |
| ofac_missing_screen_context | human_review | proceed | human_review |
| ofac_valid_truncated_three_of_four | human_review | human_review | human_review |
| rdap_unavailable | human_review | human_review | human_review |
| domain_unregistered | human_review | human_review | human_review |
| domain_registration_unknown | human_review | human_review | human_review |
| domain_name_mismatch | human_review | human_review | human_review |
| domain_date_missing | human_review | human_review | human_review |
| domain_invalid_calendar | human_review | proceed | human_review |
| domain_malformed_timestamp | human_review | proceed | human_review |
| domain_future_registration | human_review | human_review | human_review |
| domain_threshold_equal | proceed | proceed | proceed |
| domain_threshold_just_below | human_review | human_review | human_review |
| dual_ofac_and_recent_domain | human_review | human_review | human_review |
| dual_ofac_bad_count_and_bad_date | human_review | proceed | human_review |

## Decision-design findings

The audited Pennsylvania adapter can return several ranked candidates when exactly one is a strong match; these are valid matches, not cardinality errors. The offline candidate now checks strongCandidateCount/identityComplete rather than assuming candidateCount===1, and verifies OFAC screening name, requested threshold and bounded candidate tallies. It also checks invalid/future RDAP registration dates. A synthetic expected label is not independent legal or source-provider truth.

The real staging decision implementation, source adapters, payment handlers, registered prices, wallets and production runtime are **unchanged**. Human source-contract, privacy/security, independent gold-label evaluation, costs and product-value reviews remain required before considering integration.
