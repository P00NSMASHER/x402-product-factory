# Revenue product source hunters: SEC deployment identity preflight (2026-10-31)

## Verified scope and ownership
- Canonical working repository: [P00NSMASHER/x402-product-factory](https://github.com/P00NSMASHER/x402-product-factory), main base commit `27293158aeda848f2bc68ce2c5f6aca71b57cb44`. Its current visibility was **public**, not private. No customer material or credentials introduced.
- Hunter A inspected [PermitPlate](https://github.com/P00NSMASHER/permitplate-nyc/pulls) and [CaptureBrief](https://github.com/P00NSMASHER/capturebrief/pulls). Existing narrowly owned draft PRs #152–#158 and #167–#171 respectively are underway, so no competing edits to those features.
- Hunter B inspected x402 PRs #61–#68. None of their changed-file lists overlap `runtime/deployment-preflight.js` or its test. Other Retally/RecoveryOS/FreightRecovery code resides in the accessible [github-value-hunt-ledger recoveryworks/freight](https://github.com/P00NSMASHER/github-value-hunt-ledger), not separately discoverable repositories called `retally`, `recoveryos`, or `freightrecovery`. Do not create unrelated replacements.

## Reproducible defect: rejected SEC identity accepted as deployment-ready
1. On main, `runtime/deployment-preflight.js:validateEnv` only checked whether the configured `SEC_USER_AGENT` string contained an email using `hasContactEmail` from `packages/sources/sec-filings.js`.
2. The downstream SEC adapter sends this value as a real `user-agent` HTTP field. Node's Fetch `Headers` constructor rejects CR, LF, NUL, and characters outside the HTTP ByteString range. An email-containing value with any of these was previously marked **ready**, even though the HTTP client cannot send it. This is an input/configuration mismatch, not evidence of an actual SEC production outage or attacker exploit.
3. Adversarial fixtures: `ops@example.com\rX-Injected: yes`, `ops@example.com\nX-Injected: yes`, `ops@example.com\u0000`, and `ops@example.com🙂`, each prefixed by `x402-product-1.0 `. The pre-change predicate accepts **4/4** because each still contains a syntactically matching email; native `new Headers({"user-agent": value})` rejects **4/4**. This contradiction is reproducible with Node Fetch/Headers, no HTTP requests or secrets.
4. After this change, the same native HTTP-value compatibility check is part of the read-only preflight. It returns `invalid_http_header_value` and blocks both staged SEC products. Valid conventional and tab-delimited declared identities still pass.

## Audited external alternatives and adoption decision
- [nodejs/undici](https://github.com/nodejs/undici): MIT LICENSE, package main version `8.12.3` as inspected 2026-10-31, active pushed 2026-11-01 UTC, Node `>=22.19.0` at the inspected source. A separate dependency/import would be unnecessary; Node's built-in Fetch implementation already exposes `Headers`.
- [node-fetch/node-fetch](https://github.com/node-fetch/node-fetch): MIT LICENSE.md, main package version `3.1.1`, last upstream push 2026-05-12 UTC; transitive runtime packages `data-uri-to-buffer`, `fetch-blob`, `formdata-polyfill`. A second HTTP stack would add migration and dependency/security review risk with no functionality gain.
- Decision: **no source copied or third-party dependency added**. Reuse runtime `Headers` validation (zero external imports). No new license/NOTICE obligation. This is a focused original preflight integration informed by HTTP field-value behavior. Existing `actions/checkout` runner is pinned at immutable commit `11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2). Dependency advisories for rejected alternatives do not enter the project; no claim that their full dependency/advisory graphs were audited.

## Exact changes and acceptance commands
- `runtime/deployment-preflight.js`: fail closed on SEC identity values that real Fetch cannot serialize.
- `runtime/deployment-preflight.test.js`: four invalid control/Unicode adversarial inputs, both SEC-product readiness flags, and valid-input compatibility regression.
- `.github/workflows/hunter-sec-header-preflight-ci.yml`: read-only, path-targeted PR gate, pinned checkout, native tests, all factory tests, and no-network candidate preflight with synthetic test-only SEC identity.
- Reproduce: `node --test runtime/deployment-preflight.test.js`; `node scripts/run-all-tests.js`; `SEC_USER_AGENT='x402-product-factory-ci/1.0 ci@example.com' PUBLIC_API_BASE='https://candidate.example' node runtime/validate-deploy-candidate.js`.
- True after-change validation must be taken from **exact-head GitHub CI**, not assumed from this ledger. No actual SEC API calls, x402 settlements, payments or deployments included.
- Rollback: revert the isolated PR; no data migration, API response or payment behavior changes. The explicit readiness gate does **not** by itself guarantee every direct caller first invokes the preflight.

## Effort, outcomes and next priority
- Prevented class: false-positive deployment readiness leading to SEC HTTP header serialization failure. **0 incidents, 0 sales and 0 revenue changes measured**. Planned 0.5–1.5 engineering hours saved per prevented incident (low-confidence estimate based on reproducing/triaging configuration failure and rerunning readiness tests, not observed time savings). Do not extrapolate to days/weeks.
- After exact-head CI, prioritize coordinating existing main-bound x402 PRs for genuine release authorization; resolve production source parity before any deployment. Next Hunter A pass should choose a nonoverlapping real PermitPlate/CaptureBrief browser/customer defect only after the current PR backlog is reconciled.
