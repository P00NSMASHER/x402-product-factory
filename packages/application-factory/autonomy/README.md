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

## Continuing beyond the first 72 editions

After the original 72 cycles, the factory checks an append-only, machine-validated idea inbox at packages/application-factory/autonomy/ideas. Ideas must describe genuinely different buyer document-workflows with two dated public-source references, at least four document requirements, and an explicit unverified commercial status. Unsafe or cosmetic clones fail. A missing slot reports catalog_refresh_required, but a future slot with a newly researched blueprint can still build normally. Changing a blueprint after a cycle was verified fails the source-integrity gate.

The existing six-hour ChatGPT automation has been updated to research another specific workflow hypothesis and commit it on the draft branch when credible sources and mechanical differentiation are available. Draft-branch GitHub CI then immediately runs real packaged-service acceptance for up to the latest three new blueprints, even while the default-branch cron is inactive.

    node scripts/validate-autonomy-ideas.js --check
    node scripts/validate-autonomy-ideas.js --build-pending --output /absolute/private/blueprint-previews

This is an open-ended input mechanism, not a claim of infinitely many profitable ideas. If credible differentiated opportunities are unavailable, the factory does not invent more buyers, revenue, or title-only products.


## Unattended missed-cycle recovery

The already declared factory workflow validates and builds the **current** six-hour slot first, then automatically inspects up to eight **prior** slots and recovers up to two oldest unbuilt editions per execution. It uses the existing supervisor and genuinely executes each packaged app; replay only reuses independently reverified source-hashed packages and receipts. A corrupt older receipt, artifact or source fails closed. A quarantined candidate stays quarantined pending review; later healthy slots can still proceed. The current slot is never replayed by catch-up.

    node scripts/backfill-autonomous-factory.js --plan-only --output /absolute/private/candidates --at 2026-10-13T18:00:00Z
    node scripts/backfill-autonomous-factory.js --output /absolute/private/candidates --at 2026-10-13T18:00:00Z --max-builds 2 --window-cycles 8

A private JSON report distinguishes verified recovered cycles, unbuilt cycles still due, quarantines, research gaps, and history older than the bounded window. "No due work in bounded window" does not certify older history, customers, security, or revenue. CI preserves no more than the existing seven-day artifact retention. This upgrade adds **no new schedule, runner credentials, network transport, merge authority, payment, outreach or public deployment**, and remains inactive as a GitHub cron while the stacked PRs are drafts.

## Evidence-backed automatic research scout

Future cycle selection also consumes an append-only, source-backed scout queue, automatically assigning independently differentiated workflows to cycles 75 onward. Three NIST/EPA/DOE leads are admitted and independently packaged by CI, without making up paying buyers, source-level demand evidence or external service permissions. Exact reviewed idea files always override matching scout slots; later slots never reorder. See [scout/README.md](scout/README.md).

## Acceptance and limits

    node --test packages/application-factory/autonomy/*.test.js

Linux CI exercises genuine assembled services including scoped APIs, synthetic encrypted documents, browser-independent workers, persistence and recovery. Windows unit tests use strictly labeled injected-test-only acceptance after hash-verifying package files because the inherited recovery fsync fails on Windows. Never call those Windows fixtures actual packed-service acceptance.

Market fit unvalidated, real customers null, collected revenue null, release approval false. Independent security, privacy, payment and business approval are still required for real customer use, public delivery or automatic money handling.

## Checkpointed cross-family unattended director

The original six-hour cycle selects one document app. A **separate fair quote/inventory director** now advances one source-pinned independent candidate per six-hour run, alternating available SaaS families and never claiming a title-only or duplicate business. It reads the existing eight source-referenced *unverified* workflow hypotheses (four quote, four inventory) in the strict, appendable cross-family proposal queue. Each newly researched, source-valid differentiated proposal can be scheduled on a future run; no LLM inference, paid source scraping, buying signal or contact is invented. An exhausted queue reports that new independent research is needed rather than recycling existing prototypes.

Every chosen candidate is actually packaged and independently exercised under the existing same strong role/tenant/SQLite/idempotency tests. The director records an owner-private, source- and package-hashed slot receipt. A repeat cycle verifies and reuses that exact package, not rebuilding duplicates; changed sources, corrupt receipts, missing packages or forged acceptance block selection. After an ephemeral GitHub Actions runner exits, the next successful-run artifact is restored **only after** independent verification of source digests, packaged app bytes and acceptance evidence. Cross-family checkpoints are preserved inside the existing `autonomous-apps` artifact along with document-cycle checkpoints; no new schedules, credentials, runners or paid resources.

To operate offline in a trusted private directory, use:

    node scripts/run-cross-family-director.js --plan --at 2026-10-13T00:00:00Z
    node scripts/run-cross-family-director.js --run --at 2026-10-13T00:00:00Z --output /absolute/private/auto-apps/cross-family
    node scripts/restore-cross-family-checkpoint.js --source /absolute/private/previous-run --output /absolute/private/auto-apps --max-slots 24

This improves autonomous **safe engineering throughput**, not public deployment. All buyer demand, revenue, commercial readiness, registration and permission data remain unknown/held. The GitHub declared cron on this stacked DRAFT remains inactive until an independently reviewed merge; the existing ChatGPT six-hour coordinator has not been rescheduled. No person, supplier, customer or third party is contacted.

## Bounded late-build reconstruction across quote and inventory

After the current six-hour slot finishes independent acceptance, the existing workflow now checks up to **eight older six-hour slots** and manufactures at most **two previously unbuilt slots** per run. It uses the same source-pinned quote/inventory backlog and complete real packaged SQLite/HTTP/role/idempotency acceptance. It runs oldest-first, never replays or overwrites the current accepted slot, and never exceeds the original source queue. The previous runner's accepted files are restored and checked first. This adds **no new cron, ChatGPT task, token scope, third-party request, payments or customer outreach**.

The director formerly refused earlier slots once a later slot had succeeded. Historical reconstruction now passes an explicit internal-only `historicalRepair` switch, while ordinary slot execution still refuses backdating. Every newly constructed past receipt is marked `recoveredLate: true` with an actual local `executedAt` timestamp **after** the slot ended. Such a receipt proves only that an old-numbered slot was manufactured now; it does **not** prove a historical scheduled run, market demand, or any sale.

A private machine-readable report distinguishes **unbuilt slots inside the scanned window**, remaining source queue capacity, backlog still due, and older history **not examined**. If there is no genuinely differentiated source-backed candidate or a corrupt previous receipt/package, the system fails closed or truthfully reports source exhaustion. Later healthy work is not used to erase or forge failed historical evidence. Bounded recovery is a best-effort local engineering queue and is still inactive as a GitHub cron until an authorized default-branch merge.

    node scripts/backfill-cross-family.js --plan --output /absolute/private/auto-apps/cross-family --window-cycles 8 --max-builds 2
    node scripts/backfill-cross-family.js --run --output /absolute/private/auto-apps/cross-family --window-cycles 8 --max-builds 2

The tested draft remains synthetic/private, never publicly hosted, not market validated, and makes no attempt to contact buyers, vendors, collaborators or any other person without approval.
