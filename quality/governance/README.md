# Product Factory — release-chain integrity gate

## Why this exists

The factory currently has **nine dependent draft PRs** between specification-driven Products 003–024 and scheduled Product 018 public-source monitoring. Each individually passing CI does **not** establish that the branches remain correctly stacked, have green checks on their current exact head, or are commercially ready. The release-chain gate is a read-only structural verification layer over the entire dependency graph.

## What the gate verifies

1. **Immutable review pins:** [release-chain.json](release-chain.json) lists PRs #2, #5, #6, #7, #8, #9, #11, #13 and #14 in required order, with branch names, parent-base relationships and exact reviewed head SHAs. Unexpected edits block the gate until independently reviewed and repinned.
2. **Actual GitHub PR state:** The GitHub API must show the same head, correct base ref **and base SHA**, open/draft/unmerged state, and no reported merge conflict or unresolved mergeability status.
3. **Commit ancestry:** For each child, the pinned parent commit must be an actual ancestor of the child commit (GitHub compare says `ahead` with `behind_by=0`). A changed base label without commit ancestry is not enough.
4. **Same-revision CI:** Every PR requires a `Factory product CI` **pull_request** workflow run with the exact pinned SHA, correct branch and workflow path, and a successful latest run. Source PRs #13–14 additionally require the exact-head `Factory 018 public source compatibility` workflow. A later failure supersedes an earlier success.
5. **Nontechnical evidence remains separate:** Independent external buyer value, independently held-out Product 018 decision accuracy, actual reconciled settlement, full source/hosting/refund costs, security/privacy signoff and a human deployment approval are all **unknown**. This gate cannot declare them proven and never sets `ready_for_production:true`.

## Reproduce

```bash
node --test quality/governance/release-chain.test.js
```

On a supported GitHub Actions runner, the [draft-only read-only workflow](../../.github/workflows/factory-release-chain-audit.yml) checks actual GitHub metadata:

```bash
GITHUB_TOKEN=<read-only GitHub Actions token> node quality/governance/release-chain.js --audit-live
```

Only GitHub `GET` endpoints for this repository's specified PRs, exact-head workflow runs and commit ancestry comparisons are permitted. No PR bodies, account identifiers, API response payloads, authentication headers, raw logs or arbitrary project data are printed. The output is a bounded set of predefined hold/error codes with a Markdown GitHub Actions summary.

## Result interpretation

- `stack_integrity_verified:true`: the *pinned draft dependency structure and specified checks* match actual GitHub metadata. **This is NOT a commercial release approval.**
- `BLOCK_REVIEW_RELEASE_CHAIN_INTEGRITY`: one or more upstream pins, ancestry links, PR states, mergeability statuses or exact-head checks require investigation. Do not bypass by accepting an older passing run.
- `HOLD_MANUAL_RELEASE_AND_INDEPENDENT_EVIDENCE`: structural audit passed, but release still requires **separate** human/privacy/security, real-source and invoice, paid settlement/reconciliation, customer-demand and product-quality evidence.
- The daily source-drift `schedule` in draft PR #14 **is not active** on the repository default branch while the PR stack is unmerged. Passing its existing PR-triggered observations does not activate the schedule.

## Safe change process

Inspect the upstream GitHub PR, verify its new exact SHA, review the change against the source/product economics, re-run the corresponding CI and source smoke, then explicitly update the manifest pin in a reviewed separate commit. Never auto-merge a PR, change wallets/prices, lift Product 025+, post customer evidence, run a transaction, or deploy from this gate.

The gate itself is stacked on the unmerged public-source monitor draft PR #14. Its Github Actions **success** reports only integrity of upstream drafts at the moment checked. All production and commercial blockers remain active.
