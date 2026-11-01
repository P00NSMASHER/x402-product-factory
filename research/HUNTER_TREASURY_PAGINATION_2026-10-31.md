# Revenue Source Hunter B | Treasury historical pagination | 2026-10-31

## Identity, scope and ownership
- Canonical product repository: [P00NSMASHER/x402-product-factory](https://github.com/P00NSMASHER/x402-product-factory), **public** at inspection. Base `main@27293158aeda848f2bc68ce2c5f6aca71b57cb44`, 2026-10-31.
- Isolated draft [PR #67](https://github.com/P00NSMASHER/x402-product-factory/pull/67), branch `hunter/treasury-history-pagination-20261031`. No production deployment, merge, customer contact, secrets or paid request.
- Hunter A read/reconciled [PermitPlate PRs #152,155–158](https://github.com/P00NSMASHER/permitplate-nyc/pulls) and [CaptureBrief PRs #167–169](https://github.com/P00NSMASHER/capturebrief/pulls). Their owners' existing branches were untouched.
- Hunter B inspected authoritative x402 paid-source and decision paths. Distinct from [#64](https://github.com/P00NSMASHER/x402-product-factory/pull/64) (missing Treasury numeric rates), [#65](https://github.com/P00NSMASHER/x402-product-factory/pull/65) (SEC identity), [#66](https://github.com/P00NSMASHER/x402-product-factory/pull/66) (RDAP identity), [#19](https://github.com/P00NSMASHER/x402-product-factory/pull/19) (field validity) and [#23](https://github.com/P00NSMASHER/x402-product-factory/pull/23) (domain timestamps). No Unified Engine Evidence Lab modification or competing work.

## Reproducible defect and provenance
- [Exact original adapter](https://github.com/P00NSMASHER/x402-product-factory/blob/27293158aeda848f2bc68ce2c5f6aca71b57cb44/packages/sources/treasury-average-rates.js) fetches the first 300 records sorted by `-record_date` and returns them as if complete. `history({security,points})` supports 2–24 distinct monthly observations. A full first page with only one matching month and the previous month on page two cannot provide correct two-month trend data.
- Source: [U.S. Treasury Fiscal Data, Average Interest Rates on U.S. Treasury Securities](https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates). [Official API documentation](https://fiscaldata.treasury.gov/api-documentation/) defines pagination fields. No actual live Treasury payload was used in controlled regression; this is a source-level pagination risk, **not** an observed real customer incident.
- [Initial red GitHub run #41249477297](https://github.com/P00NSMASHER/x402-product-factory/actions/runs/41249477297): 13/15 focused assertions passed, **two deliberately failed** against original code: expected two requests but got one, and a source-truncation error was missing. Syntax passed. Red branch commit `b3370cec9ffde133851be2347dc7220f0fb9a68e`.
- Code commit `0632990347592aa4c0d32b8ab68d0ff4cf07e584` adds sequential official-endpoint pages with explicit 5-request budget, stops when requested dates collected, never follows source-provided off-origin links, and fails closed on incomplete bounded scans. `rows()` preserves existing single-page behavior for lookups and comparisons. No new package, lockfile, migration, payment policy, or platform configuration.
- Adversarial payment-boundary test commit `552f0d7769c40c3556ea0b4723ab6b2d4ab84287`: asserts 5-page cap causes `SOURCE_CONTRACT_INVALID` and `treasury-average-rate-trend` returns `chargeable:false` and `human_review`, not an unverified billable trend.
- [Exact-head green GitHub run #41249531668](https://github.com/P00NSMASHER/x402-product-factory/actions/runs/41249531668) for `552f0d7769c40c3556ea0b4723ab6b2d4ab84287`: source syntax passed, **16/16 focused tests passed**, entire discovered factory regression command `node scripts/run-all-tests.js` passed. This confirms deterministic code, not any real paid transaction. No browser UX affected, so no new browser smoke relevant.

## External GitHub source due diligence (read only; no imports)
1. [sindresorhus/p-limit](https://github.com/sindresorhus/p-limit), inspected HEAD `a8a6fbec4e0e866d6d779b10889bb4f5567e70eb`, package v7.3.3, **MIT** license (LICENSE blob `fa7ceba3eb4a9657a9db7f3ffca4e4e97a9019de`); pushed 2026-09-18, zero reported open issues at inspection, runtime chain includes `yocto-queue:^1.2.1`. Rejected: async concurrency control unnecessary for strictly sequential, bounded Treasury pagination; would add dependency audit and lockfile work.
2. [SGrondin/bottleneck](https://github.com/SGrondin/bottleneck), inspected HEAD `b83528333ba4d27cf70b81cc2be12e09d7ff692f`, package v2.19.5, **MIT** license (LICENSE blob `835fc314528e99ad0fa3d1ca7ee8b3570b35840c`); pushed 2024-01-23, 88 reported open issues at inspection, no direct runtime dependencies. Rejected: general scheduler significantly broader than a five-page sequential bound, poorer maintenance currency.
- Both source and license metadata were inspected through connected GitHub. No source copied, so no third-party NOTICE/lockfile changes needed. Comparative maintenance numbers are inspection snapshots, not a vulnerability clearance certificate.

## Reproduce and rollback
```sh
node scripts/validate-js-syntax.js
node --test packages/sources/treasury-average-rates.test.js packages/sources/treasury-pagination.test.js
node scripts/run-all-tests.js
```
- Focused positive controls: both months on first page, one valid monthly observation on complete single page.
- Negative controls: second month only on page two, source-provided hostile `links.next` URL, 20-page misleadingly complete source, nonchargeable failed service result.
- Rollback by reverting branch's changes to `packages/sources/treasury-average-rates.js`; all changes stay in draft PR before any acceptance.
- No actual paid buyer, revenue, customer conversion, production fix, or source data completeness was verified. First-page source identity is already enforced by its official origin; multi-page completeness is bounded to at most five pages, not arbitrary 24 requested months.
- **Engineering effort estimate:** roughly 1–3 developer hours to reimplement and regression-test this bounded pagination without importing a full rate-limit library, *low confidence estimation*, not logged labor saved.

## Next acceptance and owner coordination
1. Preserve draft until exact-head checks and protected release procedure are independently accepted. Current `main` was reported unprotected by GitHub API; do not treat that as merge authorization.
2. Confirm Treasury's real production `meta` pagination schema against a read-only public data sample under approved rate limits and no payment; test a seeded year-boundary case, malformed metadata and page ordering.
3. After base integration, rerun full factory release gates; preserve unrelated #19/#23/#64/65/66 PR ownership and customer-facing services.
4. Rotate Hunter A next to a genuinely uncovered PermitPlate/CaptureBrief first-customer defect only, not already owned intake PRs.
