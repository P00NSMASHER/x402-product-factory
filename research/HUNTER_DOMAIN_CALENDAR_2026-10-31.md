# Source Hunters: RDAP domain-age calendar integrity (2026-10-31)

**Scope:** Product 007 deterministic registration-age decision, research/staging only. No payments, live calls, hosting, price, provider, state, or production changes. **Source main:** `27293158aeda848f2bc68ce2c5f6aca71b57cb44`; baseline decision blob `ca247dd7d4eb1fe7254bf0dad81ea98f56dc6625`. Existing concurrent PR #23 changes domain service contract and test, not this decision file; PR #66 changes a separate RDAP adapter. Coordinate before any merge.

## Reproduction (exact source, mocked evidence; no actual upstream incident asserted)

Baseline `assessDomainAge` accepted an impossible `2026-02-30` event as normalized `2026-03-02`, reporting `recent_registration` with age 1 day at 2026-03-03. A future event `2026-03-04` returned `recent_registration` with age -1 day. These cases violate source-date integrity. The corrected decision requires `human_review` with `REGISTRATION_DATE_UNAVAILABLE` or `REGISTRATION_DATE_IN_FUTURE`. Legitimate 2024 leap day, same-day 0 age, older age and ISO RDAP timestamps remain compatible. Pre-commit isolated V8 execution of the exact fetched source and patch: 4 targeted before/after verdicts passed; this is not a substitute for GitHub's Node CI.

## External source evaluation (immutable references; no code copied)

| Candidate | Verified source and license | Fit / decision |
| --- | --- | --- |
| [Luxon at `f427515a38f6a671f8de663e6bcc040ed81f114e`](https://github.com/moment/luxon/tree/f427515a38f6a671f8de663e6bcc040ed81f114e) | MIT [LICENSE.md, blob `2d560a6433eb68f3b1277d58a819ce56a01f9dd5`](https://github.com/moment/luxon/blob/f427515a38f6a671f8de663e6bcc040ed81f114e/LICENSE.md); package 3.7.2; no runtime dependency declared; repository pushed 2026-08-09, not archived. | Capable ISO parsing but full dependency for one UTC-day invariant is unnecessary. |
| [Temporal polyfill at `c55b211de913320d8aba32c456bb45914739f414`](https://github.com/js-temporal/temporal-polyfill/tree/c55b211de913320d8aba32c456bb45914739f414) | ISC [LICENSE, blob `75c4ded485dee91270b2c06a75ed12e4b560fb85`](https://github.com/js-temporal/temporal-polyfill/blob/c55b211de913320d8aba32c456bb45914739f414/LICENSE); package 0.5.1 with `jsbi ^4.3.0` dependency; repo pushed 2026-09-22, not archived. | Correct temporal primitives, but needless transitive dependency and runtime growth. |

**Adoption:** small independently authored UTC calendar-day roundtrip plus future-date review guard, zero dependencies, no copying, no additional license/NOTICE obligation. No software-vulnerability absence is claimed; no packages or lockfile changed. Both alternatives would require deeper transitive advisory and compatibility vetting if adopted later.

## Tests / release

Added regression cases for impossible leap dates, future records, valid leap-day timestamps, and old/same-day controls, plus a read-only dedicated GitHub PR/push workflow using pinned actions/checkout v4.2.2 commit `11bd71901bbe5b1630ceea73d27597364c9af683`. Required whole-suite GitHub CI is the actual integration gate. Existing PRs/ownership and protected workflows must be respected. Rollback is reverting the focused source/test/workflow commit; no data migration.

**Estimated engineering time:** conditional 0.5–2 hours avoided if an upstream malformed-date investigation occurs (manual trace/reproduction otherwise); no realized time saving or customer revenue proven. **Next:** coordinate with RDAP service-integrity PR #23 and adapter PR #66 before broad future-date consistency checks; independently inspect source-adapter evidence charging only after their outstanding work resolves. No customer event is asserted.
