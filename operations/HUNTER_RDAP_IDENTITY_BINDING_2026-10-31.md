# Hunter Network 2.0 | RDAP identity binding | 2026-10-31

## Repo, owner, scope
Canonical owner: `P00NSMASHER/x402-product-factory`; base `main@27293158aeda848f2bc68ce2c5f6aca71b57cb44`. Other active draft source/payment PR owners #61–65 were inspected. None edits `packages/sources/live-pa-identity.js` or its two established positive-fixture tests. The cumulative App Factory release PRs #56–60 remain separate and are **not** integrated here.

## Defect (controlled reproduction, not a reported live incident)
The authoritative RDAP adapter treated *every* successful 200 response as registered evidence without checking the response object identifies the requested domain. A mismatched, missing or non-domain response could therefore yield `chargeable:true` in downstream age and expiration products. This is a source-contract/billing integrity defect, not proof the authoritative registry has returned wrong data in production.

[Red CI run #41244596683](https://github.com/P00NSMASHER/x402-product-factory/actions/runs/41244596683) executed the new isolated negative controls against unchanged adapter code: 9/28 focused assertions failed (wrong/missing identity and chargeability), 19 passed. No live source or payment calls.

## Bounded repair
After successful authoritative RDAP HTTP 200, require RFC 9083 `objectClassName === "domain"` and string `ldhName` exactly matching the normalized requested ASCII domain case-insensitively. Emit `SOURCE_CONTRACT_INVALID` for absent, contradictory or wrong-class identity. Existing two product composition layers already catch such source failures as `human_review` and `chargeable:false`; no duplicate policy or dependency. An authoritative 404 remains a valid unregistered negative control. Existing honest mock fixtures were updated to identify `example.com`.

Reproduce:
```sh
node --test packages/sources/live-pa-identity.test.js packages/sources/rdap-identity-binding.test.js packages/sources/appdeploy-public.test.js products/domain-registration-age/service.test.js products/domain-expiration-horizon/service.test.js
node scripts/run-all-tests.js
```

## Public GitHub source comparison (read-only, no imports)
1. [rdap-org/validator.rdap.org](https://github.com/rdap-org/validator.rdap.org), pinned reference commit `bc0f59d6b4770a7d7b11c8dafd42d8019e0fdddf` (2026-09-01): permissive notice-based LICENSE; JS `lib/rdap-validator.js` checks domain object, RFC 9083, and related identity fields. Manifest is `{"type":"module"}` without declared direct dependencies. Full generic validator is heavier than a strict 200-response contract check.
2. [gbxyz/jrdap](https://github.com/gbxyz/jrdap), pinned reference commit `a37683d5789b99c47a2175e0019dca2f2436af94` (2025-10-03): BSD-3-Clause LICENSE, documented zero-dependency CLI; inappropriate runtime dependency for our embedded adapter. No package manifest exists at repository root.

License files were read directly at those refs' default branches. No code was copied, no dependency installed and no new transitive license or vulnerability exposure introduced. Full candidate advisory-chain verification is unnecessary for the selected zero-dependency patch and was not asserted. Sources above are reference-only; no NOTICE obligation from copied code. Standards reference: [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083).

## Compatibility, controls, rollout, evidence
- The patch only tightens acceptance of 200 RDAP records without valid domain identity.
- Case-insensitive matching positive, authoritative 404 negative and two downstream payment-boundary controls are included.
- No network, real customer records, trades, payment facilitation, secrets, migrations, server configuration or deployment.
- Rollback: revert PR #66. No persistent data migration.
- Engineering time savings **estimated 1–3 hours, low confidence**: one shared source validation plus paid-service regressions replaces three or more duplicate product checks; *not* observed elapsed engineering time. This is not product revenue.
- Merge deferred pending exact-head fully passing CI and permitted protected review. Draft PR only.

## Forward checkpoint
Hunter A owns the next rotation: review [PermitPlate #158](https://github.com/P00NSMASHER/permitplate-nyc/pull/158) and [CaptureBrief #169](https://github.com/P00NSMASHER/capturebrief/pull/169) plus overlapping #156/#157 and #167; maintain release ownership. Hunter B next: check 200 RDAP redirect origin/HTTPS binding separately, only after this identity contract receives review; avoid simultaneous edit to this file. FreightRecovery / RETALLY canonical repository was not found among the 14 GitHub repositories visible to this installation; do not invent a path or integrate a demo copy.
