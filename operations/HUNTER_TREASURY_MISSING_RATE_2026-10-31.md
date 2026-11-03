# Source Hunter checkpoint | 2026-10-31 | x402 Treasury trend

## Repo, ownership and scope
- Repository: `P00NSMASHER/x402-product-factory`, isolated branch `hunter/x402-treasury-missing-rate-20261031-r3`, base `main` at `27293158aeda848f2bc68ce2c5f6aca71b57cb44`.
- Existing PRs #17 and #19 modify Treasury **service** contracts, not `products/treasury-average-rate-trend/decision.js` or its `decision.test.js`. No merge/deploy or payments made here.
- Related Hunter A product PRs inspected: PermitPlate #152/#155/#156; CaptureBrief #167 (base `gh-pages`). Their in-flight feature files are left untouched.
- The connected owner-repo listing did **not** expose a canonical RETALLY/FreightRecovery/RecoveryOS repo. No disconnected substitute was created.

## Reproduced defect and customer consequence
- Previous `finiteRate(value)` used `Number(value)`; JavaScript converts `null`, empty string, whitespace-only string, `false` and `[]` to zero.
- Treasury source `packages/sources/treasury-average-rates.js` deliberately normalizes absent/invalid upstream rate values to `null`.
- Therefore a missing monthly rate could produce a decision `rising` or `falling` using a fabricated zero baseline rather than `human_review`/ `TREASURY_HISTORY_INVALID`. This is a **source-code verified risk**, not an observed customer incident.
- Standalone baseline reproduction: `Number(null) === 0`, `Number("") === 0`, `Number(false) === 0`. A missing previous rate opposite 3.4% could incorrectly be reported as a 340-basis-point rise.

## Smallest safe implementation
- Reject missing, blank, boolean, object, array, nondecimal, infinite and malformed rate input before arithmetic; still accept genuine numeric zero and ordinary decimal-string values.
- Cover 10 adversarial missing/invalid values x 2 (latest/previous) = 20 regression cases, plus legitimate-zero and decimal-string positive controls.
- Existing decision shape, pricing, source adapter, production environment and API remain unchanged.
- Add a read-only PR workflow running JavaScript syntax, focused tests and all discovered factory tests. No new dependencies or runtime network calls.

## External source scan, adoption choice and license
1. Zod `v4.6.7` (published 2026-10-12): https://github.com/colinhacks/zod/releases/tag/v4.6.7 ; MIT: https://github.com/colinhacks/zod/blob/main/LICENSE . Candidate for type validation, but unnecessary for a single scalar guard.
2. validator.js `13.15.35` (published 2026-04-02): https://github.com/validatorjs/validator.js/releases/tag/13.15.35 ; MIT: https://github.com/validatorjs/validator.js/blob/master/LICENSE . Candidate for numeric validation; unnecessary added dependency/runtime size.
- Both active upstreams had releases verified; detailed advisory and transitive-dependency status were **not independently established** in this run (GitHub advisory endpoint inaccessible). **Neither package was imported.** No attribution, lockfile update or pinned external binary is required; local implementation is original.
- Rank: zero-dependency guard > introducing Zod > introducing validator.js, based on minimal surface and existing native JavaScript tests.

## Verification and calibrated engineering savings
- Baseline numeric coercion reproduced with Node 22 before the change. This alone does not prove downstream behavior occurred in production.
- Re-run: `node --test products/treasury-average-rate-trend/decision.test.js`; `node scripts/validate-js-syntax.js`; `node scripts/run-all-tests.js`. Full GitHub CI result must be linked on the PR after completion.
- Expected manual check avoided: 20 cases at 2-4 minutes apiece = 40-80 minutes of repetitive re-test each significant change, **estimate**, not logged labor saving.
- No confirmed buyers, sales, profit impact, exploitation or time savings.
- Rollback by reverting the isolated PR commit(s); no schema/data migration.
- Next: independently confirm required checks and review; check optional source-date validation and explicit rate-null handling in other products without duplicating PR #19; resume safe Hunter A fixes after in-flight PR ownership is resolved.
