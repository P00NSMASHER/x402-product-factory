# Product Factory — integrated release graph and source-history integrity

## Why this gate exists

The 22 standardized Product Factory staging products are represented by a **14-PR main draft branch chain** from PR #2 through PR #21, with distinct source-history recovery work in **PR #18** copied into the integration candidate PR #20 and retained through PR #21. The original read-only release gate in PR #15 only covered the first nine PRs. A green CI run on a downstream branch does not prove that its source-history protections, parent commits or exact-head upstream checks remain intact.

This combined candidate **reuses PR #15's existing GitHub read-only release-chain auditor**, extending the pinned chain to PRs **#2 → #5 → #6 → #7 → #8 → #9 → #11 → #13 → #14 → #16 → #17 → #19 → #20 → #21**. The sibling PR #18 is **not falsely claimed to be a Git ancestor**; its critical implementation and tests are separately verified by exact Git blob hashes.

## What is independently checked

- [release-chain.json](release-chain.json) pins all 14 current main PR head SHAs, branch names, parent/base branches, and required **16 exact-head workflow results** (the baseline Factory CI on all 14; separate public GET-only source compatibility on PRs #13/#14). The live auditor checks actual GitHub PR state, base SHA, HEAD, ancestry comparison, mergeability and latest qualifying successful checks.
- [integrated-history.json](integrated-history.json) pins **PR #18's reviewed source branch/head and four critical file blob SHAs**. [integrated-history.js](integrated-history.js) computes Git blob hashes from the current integrated source-history implementation and test files to prove byte equality with the independently reviewed PR #18 branch. Its full live mode separately checks PR #18 is still an unmerged draft with the exact reviewed head, unchanged base SHA and **both** successful exact-head Factory and public-source workflows.
- The integrated Product 018 public-source workflow's redacted run-history recovery and fail-closed `--restore` / `--verify` controls must remain wired, but its workflow YAML may legitimately differ in reviewed integration-specific testing. No claim of byte-exact YAML equality is made.
- The candidate's **own** deterministic Factory CI must pass all existing 22-product source evidence, paid settlement, OFAC cache freshness, staging release and source-drift continuity tests, plus these local integrity tests.

## Reproduce without external calls

```bash
node --test quality/governance/release-chain.test.js quality/governance/integrated-history.test.js
node quality/governance/integrated-history.js --check
```

On a GitHub Actions runner with read-only permissions and a token, use the new [integrated release graph audit](../../.github/workflows/factory-release-chain-audit.yml). It reads GitHub **GET metadata only**, no PR bodies or private customer, provider or payment records:

```bash
node quality/governance/release-chain.js --audit-live
node quality/governance/integrated-history.js --audit-live
```

The workflow is **read-only** (`contents:read`, `pull-requests:read`, `actions:read`), pins `actions/checkout` to its reviewed commit, and does not merge, deploy, schedule anything, change wallets or prices, or submit transactions.

## Release decision and remaining limits

A green ancestry/code-provenance gate means only that the **reviewed main PR graph is intact at the observation time** and PR #18's core history protections are still present. It is **not a commercial launch certification**, independent source/legal review, real-money settlement/reconciliation proof, actual per-product profit validation or evidence of distinct external buyers. The Product 018 daily public-source `schedule` is still **not active** on the repository default branch because upstream PRs are drafts.

**Release status: HOLD.** The full source/cache/privacy/security review and independent verified buyer, cost and seller-payment evidence remain separate, and Product 025+ remains frozen.
