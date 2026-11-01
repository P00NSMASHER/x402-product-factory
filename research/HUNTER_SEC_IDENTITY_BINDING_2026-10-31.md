# Hunter Network 2.0 | SEC EDGAR source identity binding

Date: 2026-10-31 UTC. Owner/canonical source: `P00NSMASHER/x402-product-factory`, `main` at `27293158aeda848f2bc68ce2c5f6aca71b57cb44`. Draft [PR #65](https://github.com/P00NSMASHER/x402-product-factory/pull/65). This is an isolated engineering candidate, not an approved release.

## Reproducible defect and change

Two existing staging products, `sec-filing-freshness` and `sec-company-identity-match`, use the same SEC source adapter. Previously, when the public SEC ticker map resolved one CIK but `submissions/CIK*.json` claimed another ticker or CIK, the adapter still returned `found:true`. It also treated a ticker-map row with an invalid CIK as a completed `found:false` rather than unavailable source evidence. A caller providing both ticker and CIK could get a successful record for an inconsistent pair. These are **synthetic adversarial input reproductions** against exact source code, not evidence that SEC made such a mistake or that a real customer was misbilled.

**Test first, exact original adapter:** [Actions run 41239991902](https://github.com/P00NSMASHER/x402-product-factory/actions/runs/41239991902) had 7 targeted failures and 12 passing controls across `sec-identity-binding.test.js` and `sec-filings.test.js`. Failures included both service-layer payment eligibility assertions: incompatible authoritative identifiers were treated as billable evidence.

The scoped fix is in `packages/sources/sec-filings.js`:
- malformed ticker-map CIK => `SOURCE_CONTRACT_INVALID`;
- SEC submission `cik` present but inconsistent with requested/resolved CIK => `SOURCE_CONTRACT_INVALID`;
- ticker requested but submission ticker list missing or inconsistent => `SOURCE_CONTRACT_INVALID`;
- normal SEC ticker normalization (including `BRK.B` / `BRK-B`) and historic CIK-only lookups with missing ticker arrays remain compatible.

Service composition already catches source contract failures, returns `sourceFailures`, sets `chargeable:false`, and suppresses settlement in the existing paid handlers. No source data is fabricated, no payment code is changed, and no real payment/marketplace is touched.

## Independent source-hunt: two licensed alternatives

| Candidate, immutable source SHA | Verified direct LICENSE | Fit and dependency / maintenance evidence | Decision |
| --- | --- | --- | --- |
| [medelman17/edgar-ts](https://github.com/medelman17/edgar-ts/tree/f97672553bcf88029917e0b239c23133d7aacbaa), `f97672553bcf88029917e0b239c23133d7aacbaa` (2026-07-11) | MIT, [LICENSE blob `809fb747`](https://github.com/medelman17/edgar-ts/blob/f97672553bcf88029917e0b239c23133d7aacbaa/LICENSE) | JS/TS SDK 0.5.0; zero declared runtime dependencies, multiple build/test devDependencies; direct source API adapter still must be reworked and audited | Rejected for this 3-assertion boundary; engineering/dependency churn exceeds benefit |
| [jadchaar/sec-edgar-downloader](https://github.com/jadchaar/sec-edgar-downloader/tree/185a5548e49fd37afb9871df8aa9485075f21e21), `185a5548e49fd37afb9871df8aa9485075f21e21` (2026-02-02) | MIT, [LICENSE blob `1148eced`](https://github.com/jadchaar/sec-edgar-downloader/blob/185a5548e49fd37afb9871df8aa9485075f21e21/LICENSE) | Python downloader, requires `requests` and `pyrate-limiter>=4`; incompatible runtime/purpose with the existing Node no-dependency adapter | Rejected, no Python bridge |

Source repository licenses and direct manifest dependencies were inspected; no external code was copied, no new dependency installed, so no third-party NOTICE or transitive vulnerability footprint is added. No claim of a comprehensive upstream advisory audit is made. External implementation references are research-only, immutable SHA references.

## Verification and release policy

The PR contains 9 new adapter/service adversarial and compatibility tests, a dedicated **read-only** `pull_request` GitHub Action, syntax validation and full factory regression command. Reproduce with:

```sh
node --test packages/sources/sec-identity-binding.test.js packages/sources/sec-filings.test.js
node scripts/validate-js-syntax.js
node scripts/run-all-tests.js
```

CI evidence (red baseline above): **patched exact-head CI remains the release gate; do not infer success until its final job is green.** Branch-protection/ruleset review and independent owner acceptance are still required before merge. Existing customer-facing prices, wallets, endpoints, public sources, trial/onboarding and deployments remain unchanged. No customer revenue observed or claimed.

## Engineering-time estimate and deduplicated backlog

Low-confidence **estimate: 1–3 engineering hours avoided**, not time-clock measurement. Counterfactual: 1–2 hours to reproduce and repair the same inconsistent SEC-identity handling separately in both product services plus 1 hour reviewing cross-service behavior; shared-source patch with one regression harness avoids that duplication. Only the source-level defect and test results are measured.

- **Hunter A (PermitPlate + CaptureBrief):** inspect currently open [PermitPlate #152/#155/#156/#157](https://github.com/P00NSMASHER/permitplate-nyc/pulls) and [CaptureBrief #167/#168/#169](https://github.com/P00NSMASHER/capturebrief/pulls) before implementing anything that overlaps. These remain user/customer-path review priorities. No launch-readiness or buyer demand proven by this SEC fix.
- **Hunter B (RETALLY/Freight + RecoveryOS):** canonical [freight evidence and engine docs](https://github.com/P00NSMASHER/github-value-hunt-ledger/tree/main/freight) include original-source replay and a known **zero independently verified bank settlements** / unknown field accuracy; do not claim customer recovery. Coordinate existing evidence/engine owners rather than creating competing rewrites.
- **Factory follow-up:** test contradictory official SEC accessions and historic `filings.files` pagination separately only after reading draft owners #17/#19/#20. No speculative release scope creep.
