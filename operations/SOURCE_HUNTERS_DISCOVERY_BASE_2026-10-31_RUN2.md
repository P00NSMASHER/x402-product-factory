# Revenue Source Hunter checkpoint: x402 discovery base URLs
Date: 2026-10-31 (Hunter Network 2.0). Repo: P00NSMASHER/x402-product-factory.

## Ownership, baseline, scope
- Canonical default branch: `main`. Existing open #61 owns `packages/x402/payment.js`; #62 owns OFAC; #59/#60 own integrated release/supervision. This PR changes none of those files or existing deployments.
- Exact baseline source: `packages/discovery/generator.js` at blob `b4871bf8aa9b8de17a4b25b668fbc6fa69e13c16`, and `runtime/create-runtime.js` at blob `be8bf5ae25e54647e9cb8c8dbd36f44fd3aa41a5`. Both only tested the `https://` prefix and removed one terminal slash.
- Locally reproduced by running the original two-line validation semantics with Node 22 on synthetic bases (not a live incident): `https://trusted.example@attacker.example` advertised payment URLs hosted at `attacker.example`; `https://api.example?key=bad` and `https://api.example#fragment` advertised URLs whose parsed pathname was `/`, not the paid route. Root cause: free-form string concatenation and implicit browser URL parsing. No customer payments, exfiltration or attacker control observed.

## Fix and backwards compatibility
- Shared `normalizeBase` rejects invalid HTTPS origins, user-info ambiguity, queries, fragments, whitespace, controls and backslash. Uses built-in WHATWG URL parsing and preserves HTTPS path prefixes.
- All generated x402 catalog, OpenAPI, product-index and llms text use the same validator. Runtime now fails before registering paid routes with a malformed configured base.
- Existing valid HTTPS origins and path prefixes remain valid, with trailing slashes consistently collapsed. No production configuration, payments or routes were changed.
- Added 11 invalid-config fixture classes over four discovery surfaces, two runtime tests, a positive path-prefix compatibility test, and dedicated, SHA-pinned PR CI covering syntax, generated registry, discovery, focused tests and full factory suite.
- Rollback: close draft PR or revert only this patch. Do not apply config change or deploy automatically.

## External-source comparison (no code imported)
1. `sindresorhus/normalize-url` commit [5d0151dd3a702f96becc90241331259d5642b735](https://github.com/sindresorhus/normalize-url/commit/5d0151dd3a702f96becc90241331259d5642b735), `package.json` v10.0.0, [MIT license](https://github.com/sindresorhus/normalize-url/blob/5d0151dd3a702f96becc90241331259d5642b735/license). ESM, Node >=22, general URL normalization may silently rewrite a payment-route prefix. Rejected for this narrow CommonJS runtime invariant.
2. `validatorjs/validator.js` commit [9ff342479591ca5a43cb30000195bcf55c1bbed9](https://github.com/validatorjs/validator.js/commit/9ff342479591ca5a43cb30000195bcf55c1bbed9), `package.json` v13.15.35, [MIT license](https://github.com/validatorjs/validator.js/blob/9ff342479591ca5a43cb30000195bcf55c1bbed9/LICENSE). Broad validation package would add unnecessary transitive/advisory scope for a configuration invariant. Rejected.
- Both project source refs, MIT notices and package versions reviewed 2026-10-31. No package, dependency/lockfile, copied source, or NOTICE obligation added. Security advisories of rejected dependencies not independently cleared; no dependency adoption occurred.

## Measurement and limits
- Deterministic synthetic URL parsing: unsafe authority/query/fragment examples accepted before, fail closed after under focused tests. This is engineering regression evidence, **not** a report of live exploitation.
- Estimated engineering avoidance: **0.5–2 hours per future misconfiguration** (triage + identify corrupted catalog + patch + rerun), an assumption-based per-incident estimate, with unmeasured event frequency. Verified savings = **0 hours observed**; revenue = **unverified**.
- No licensed material copied, secrets, private customer data, outbound calls, payment attempts, live deployments or paid services. This change must remain a draft pending independent full CI and release-owner gate.

## Next actions
- Verify exact-head PR workflow, then independent review of factory reverse-proxy deployment settings; no merge or launch while existing protected candidate integration remains unresolved.
- Separate owner tracks: #61 payment error-state trust, #62 OFAC refresh, #59/#60 integrated App Factory. RETALLY/RecoveryOS canonical code is not in the accessible P00NSMASHER repository listing; do not invent a repo or replace the evidence lab.
