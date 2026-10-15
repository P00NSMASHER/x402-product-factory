# Production path — integrated App Factory (draft-only)

## Current blocker

The latest accepted application factory is not on the repository's default `main` branch. It is the cumulative head of a **33-PR canonical application branch chain** culminating in draft PR #56. This does not mean 33 standalone apps: it is a long *source-code dependency chain*. The separate existing Product 018/paid-route upstream source gate covers earlier PRs.

At the October 15, 2026 preflight, GitHub's compare endpoint reported **311 commits ahead and 60 commits behind** between current `main` and cumulative draft PR #56. That is a **diverged history**, not a safe fast-forward. Two upstream app PRs have changed after the next child branch was created (PR #37 to #38 and PR #43 to #44). Separate draft changes #27 and #46 have not been explicitly incorporated/discarded. All work must be reconciled against today's GitHub state; these figures can change and are not authoritative for later runs.

The factory may pass 9/9 CI tests and still be **blocked from production**. Every passing PR CI is an engineering result on that specific source tree, not consent, payment readiness, hosted availability or proof of working customer deployments.

## What the new release preflight does

Run `node scripts/audit-app-production-integration.js --audit-live --output /absolute/private/new-readonly-status.json` with an existing **read-only** GitHub token supplied in `GITHUB_TOKEN`. No project secrets are accepted as CLI arguments and none are printed. The private output must be outside this Git repository, in an existing 0700 owner-only directory, and must not preexist. The command verifies:

1. Live PR numbers, branch targets and exact source identities for all 33 app-factory canonical draft branches; missing/closed/conflicting drafts hold integration.
2. Whether each child PR's current base SHA still matches the parent's current source HEAD. Changed parents are classified through bounded GitHub compare calls, not silently assumed integrated.
3. Whether the candidate HEAD still equals the approved review pin and **all nine** required exact-HEAD CI workflows are completed successfully, not merely that an older SHA passed. A newer failed run overrides an older passing run.
4. How current `main` compares with the cumulative app candidate: commits ahead/behind, missing protections and unavoidable source reconciliation.
5. The explicit disposition needed for two independent side drafts, #27 and #46.
6. Commercial blockers: independently verified buyer demand, privacy/security testing, actual consent and data custody/migrations, safe hosted ingress, reconciled real payment settlement, hosting unit economics and distinct owner production-release approval are still unproven/held.

A bounded GET-only GitHub API collector performs at most 90 read requests and produces a SHA-256 **checksum**, not a third-party signature, over a source-minimized redacted report. It never reads email, issues/PR bodies, customer information, token values, commerce data or user credentials. It never merges branches, opens external URLs for hosting, posts to an endpoint, contacts anyone, sends orders, or configures billing. The GitHub workflow is deliberately named **read-only preflight**, has only `contents:read`, `actions:read` and `pull-requests:read`, and publishes an expiring 7-day private CI artifact. A green read-only audit job means *inspection succeeded*, not that deployment is allowed. A report of `BLOCK_*` is expected until the actual source drift is reconciled.

Optional strict command: `node scripts/audit-app-production-integration.js --audit-live --output /absolute/private/new-strict.json --require-integrated`. This returns nonzero if the source branch graph is not ready for controlled integration. Even a clean strict result does **not** authorize production hosting or payments.

## Stepwise path toward autonomous production

**Engineering-ready branch integration.** Resolve the 60 newer main-line commits and stale parent refs with conflict-aware review; explicitly determine whether #27 and #46 belong in the canonical release. Do this as a new private, heavily tested candidate. Do not force-push protected branches or erase independent source-safety changes. Keep the rest of the stacked PRs reviewable until safe.

**Persistent governed staging.** Create a provider-neutral staging target and owner-approved network perimeter, with authenticated roles, secrets management, encrypted durable SQLite backups, schema migration rehearsal, restore proof, remote TLS and operational health/alerts. The current local crash recovery does not prove reboot or hosted fault recovery.

**Independent release confidence.** Obtain independent security/privacy assessment, buyer consent and validated workflows, operational support/incident policy, legal/commercial acceptance, controlled financial custody and unit-economics evidence. Production traffic must be gated on these facts, not simulated buyers or hardcoded demo estimates.

**Automated production operations after approval.** Only then may a separately authorized release lane publish reviewed artifacts, perform reversible canary cutover, monitor health, and roll back on measured errors. No manual promption should be necessary for routine recovery *inside an already owner-approved deployment perimeter*. Releases outside the authorized perimeter and all person-to-person outreach require separate consent.

**Preserved rule:** no contacting people without owner approval. No emails, texts, DMs, supplier/customer requests, business formation, purchases, new external account privileges, public deployments, real payments or Product 025+ unlock are authorized by this document or preflight code. The existing ChatGPT six-hour coordinator remains unchanged; a cron declared in unmerged draft code is not active on default main.
