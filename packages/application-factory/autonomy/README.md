# Autonomous Candidate Factory

The factory now supports bounded unattended application generation from a curated set of 24 document-workflow buyer problems, in three distinct modes (intake, renewals, handoff): 72 prototype editions. One app is selected every six-hour UTC cycle without a new prompt, built from the existing full-stack compiler, independently exercised by the packaged acceptance harness, and published as a private GitHub Actions artifact after tests pass. Builds use synthetic data only.

This is automatic ENGINEERING, not automatic commercial success. The ideas are curated, not independent market evidence; the generated software is one workflow family and not 72 proof-of-demand businesses. Product pricing, external email, hosted deployments, actual buyers, payments, launch and Product 025+ remain gated. No new LLM API, research crawler, database provider or other paid external action is used.

## Run without prompts

Node.js 22.13+ required. The real packaged recovery acceptance is Linux-only in this version because the inherited Windows recovery implementation cannot fsync a directory without EPERM. Use a PRIVATE absolute output directory outside the source tree:

    node scripts/run-autonomous-factory.js --plan-only
    node scripts/run-autonomous-factory.js --output /absolute/private/auto-apps

For reproducible testing:

    node scripts/run-autonomous-factory.js --output /absolute/private/candidate-tests --at 2026-10-13T00:00:00Z

The generator uses the current six-hour UTC slot. Repeating the same slot verifies and reuses existing content-addressed apps; changed or corrupt source/artifacts fail closed. Failure retries are bounded to two attempts and then quarantine. The default is one app per cycle and the absolute cap is two. Each accepted candidate is a real offline-verified packaged service, not a title-only stub.

Each cycle produces a private autonomy/cycle-N.json receipt, application directory, and manufacturing acceptance receipts. Neither local nor scheduled runs send messages, deploy, contact buyers, charge, install daemons, or change account schedules. CI artifacts expire after seven days.

## Scheduled CI: activation caveat

.github/workflows/factory-autonomy-ci.yml declares cron 23 minutes past each six-hour UTC boundary, a read-only workflow_dispatch trigger, and pull-request checks. Job maximum is nine minutes; there are no extra paid API calls but hosted CI minutes could count against the account's plan.

IMPORTANT: GitHub scheduled Actions run ONLY on the DEFAULT BRANCH. The initial implementation is in a stacked DRAFT PR; its cron does not run until the reviewed workflow is merged into the default branch. Do not call it an active unattended schedule before that happens. A separately authorized ChatGPT automation can provide a bounded interim workflow while the draft remains unmerged.

After 72 cycles (18 days at one every six hours) all curated editions are exhausted. Instead of recycling clones and falsely claiming more value, the runner produces catalog_refresh_required and accepts no new app. This is deliberate; enduring novelty requires actual customer problems and separately reviewed new blueprints, not a perpetual rename loop.

## Acceptance and limits

    node --test packages/application-factory/autonomy/*.test.js

Linux CI exercises genuine assembled services including scoped APIs, synthetic encrypted documents, browser-independent workers, persistence and recovery. Windows unit tests use strictly labeled injected-test-only acceptance after hash-verifying package files because the inherited recovery fsync fails on Windows. Never call those Windows fixtures actual packed-service acceptance.

Market fit unvalidated, real customers null, collected revenue null, release approval false. Independent security, privacy, payment and business approval are still required for real customer use, public delivery or automatic money handling.
