# Hunter Network 2.0: source-bound payment boundary checkpoint (2026-10-31)

## Ownership and scope

- Canonical existing repo: [P00NSMASHER/x402-product-factory](https://github.com/P00NSMASHER/x402-product-factory), default branch `main`, inspected parent commit `27293158aeda848f2bc68ce2c5f6aca71b57cb44`. Existing application-factory PRs [#59](https://github.com/P00NSMASHER/x402-product-factory/pull/59) and [#60](https://github.com/P00NSMASHER/x402-product-factory/pull/60) do **not** touch `packages/x402/payment.js` (per changed-file listings). This fix uses an isolated branch and does not merge or deploy.
- Hunter A checked the canonical owner repositories [PermitPlate](https://github.com/P00NSMASHER/permitplate-nyc) and [CaptureBrief](https://github.com/P00NSMASHER/capturebrief). Their sales-surface changes are actively owned by draft [PermitPlate #152](https://github.com/P00NSMASHER/permitplate-nyc/pull/152) and draft [CaptureBrief #167](https://github.com/P00NSMASHER/capturebrief/pull/167); no conflicting edits were made.
- No distinct accessible owner repositories named RETALLY, FreightRecovery, or RecoveryOS appeared in the authenticated owner-repository listing; do not invent canonical locations or alter an unrelated project.

## Confirmed source defect and bounded before/after test

- Before patch, exact `main` blob `68f0e20c6147a2cf9279b5f406feae61f8e33f94` interpreted a facilitator's HTTP **503** response with JSON `{"isValid":true}` as **valid**, and another HTTP **503** with `{"success":true}` as **settled**. Reproduced by executing that exact file's exported functions against local deterministic mocked facilitator responses (no real payments). The code did not inspect HTTP success before accepting either boolean.
- Shared module repair requires an HTTP **2xx** response for success in both verify and settle. Negative verification remains terminal only for explicit invalid responses on HTTP 2xx, 400 or 422; transport/rate-limit/server failures remain unresolved. On settlement HTTP 429/5xx take priority over contradictory response-body reason strings. Existing bounded retry behavior and successful 2xx receipts are preserved.
- Exact repaired branch blob `4b887b85215e8b12c7decebfa6e067fa5eb0ccfc`: **16/16** isolated V8 mocked-response checks passed across status 200/201/202/400/401/422/429/503; **0/10** failure-status success flags accepted. This is a controlled local verification, **not** hosted Node CI or proof of a live exploit. Five additional Node tests cover adversarial verification, settlement, retries and the Product 012 paid endpoint. Hosted CI must confirm the full suite.
- Buyer impact is **preventing mistaken paid fulfillment in the presence of contradictory facilitator responses**. No claim is made that any historical customer was incorrectly billed or fulfilled. Revenue, conversion, and customers remain unverified.

## External source candidates and license decision

1. [x402-foundation/x402](https://github.com/x402-foundation/x402/tree/e208bd39030be35a0f807eb3bf4f043354273866): actively updated official reference, inspected 2026-10-31 head `e208bd39030be35a0f807eb3bf4f043354273866`, Apache-2.0 exact LICENSE blob `b09cd7856d58590578ee1a4f3ad45d1310a97f87`. **Rejected wholesale SDK integration**: broad transport/payment API change and new dependency graph for a two-condition boundary defect.
2. [coinbase/x402](https://github.com/coinbase/x402/tree/0e6e8c55d86b4f14234fb6e49a4052074fb93e57): original/reference SDK, inspected head `0e6e8c55d86b4f14234fb6e49a4052074fb93e57`, Apache-2.0 exact LICENSE blob `b09cd7856d58590578ee1a4f3ad45d1310a97f87`. **Rejected wholesale adoption** for the same scope and dependency reasons.
3. [ajv-validator/ajv](https://github.com/ajv-validator/ajv/tree/f177fe323420ccb23e1a79445fd470cbf80aee7c): MIT exact LICENSE blob `139162ad2c389a18d3d66e159a2821b2e40087fc`. Strong JSON schema engine but no need to add validator dependency for a HTTP status assertion. Last observed commit 2026-04-24.
4. [colinhacks/zod](https://github.com/colinhacks/zod/tree/2554b70c3d4a80273381e61d527d820720626440): MIT LICENSE blob `c06579627b432d09779094cd0166b7f37fe51db8`. Active in October 2026, but TypeScript schema layer would be unnecessary here.

**Decision:** original small local patch; **zero imported source code, zero added application dependencies, no lockfile changes**, so no new transitive licenses or advisories. External project advisories and full dependency trees were not individually audited; do not claim they were. No NOTICE obligations introduced by a no-copy fix. Dedicated read-only CI pins [actions/checkout v4.2.2](https://github.com/actions/checkout/tree/11bd71901bbe5b1630ceea73d27597364c9af683) to immutable SHA.

## Engineering value, limits and next checkpoint

- Source-level defect reproductions: **2**. Code and tests: one shared module, shared module regression suite, Product 012 paid-route regression, targeted + full test workflow.
- Estimated **2–5 engineer-hours saved**, low confidence. Method: central fix and re-usable 5 regression tests avoid manually verifying equivalent HTTP failure paths across 20+ product handlers at an assumed 6–15 minutes per handler; this is a forecast, not timed engineering labor.
- Pending: review native CI results and repair only verified failures; confirm no pre-existing PR overlaps; merge only with protected checks, explicit owner/release authorization and safe rollout. This code remains unmerged; no production change, trade, spending, customer contact, or customer payment was made.
- Rollback is a normal PR revert; no migrations, schemas, billing terms or credentials change. Next priority: ensure malformed 2xx facilitator JSON cannot settle, independently confirm facilitator real HTTP behavior with read-only documentation, and re-check upstream versions before any dependency adoption.
