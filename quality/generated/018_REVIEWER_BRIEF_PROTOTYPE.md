# Product 018 — offline reviewer-brief prototype

This is a **synthetic prototype**; no new live API response, price, wallet or settlement behavior is deployed.
It translates bounded reason codes and source-check statuses into explicit reviewer next actions. A contradictory `proceed` cannot bypass missing or adverse evidence. The current live product remains unchanged.

- Synthetic golden cases: **8**.
- Action codes represented: **6**.
- Contradictory proceed downgraded in prototype: **true**.
- Measured real buyer time saved, false proceed rate and willingness to pay: **unknown**.

| Synthetic case | Original decision | Cautious review | Suggested next action |
|---|---|---|---|
| clean_multi_source_checks | proceed | proceed | CONTINUE_STANDARD_DUE_DILIGENCE |
| ofac_candidate_requires_review | human_review | human_review | ESCALATE_NAME_SCREENING |
| registry_match_ambiguous | human_review | human_review | VERIFY_LEGAL_ENTITY |
| registered_domain_recent | human_review | human_review | VERIFY_DOMAIN_EVIDENCE |
| domain_alignment_mismatch | human_review | human_review | VERIFY_DOMAIN_EVIDENCE |
| rdap_source_unavailable | human_review | human_review | REVIEW_SOURCE_FAILURE |
| false_proceed_on_candidate | proceed | human_review | ESCALATE_NAME_SCREENING |
| unexpected_missing_source_checks | proceed | human_review | MANUAL_REVIEW_UNCLASSIFIED |

## Gate before any production integration

Run independent blind buyer workflow comparison, human/SEC/OFAC and security review, verify the source provenance and stop any false proceed. Do not interpret these fixtures as real performance or product-market fit.
