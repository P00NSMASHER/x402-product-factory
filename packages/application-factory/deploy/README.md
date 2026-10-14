# Real loopback deployment rehearsals (NO public launch)

`node scripts/rehearse-private-deployments.js --document /absolute/private/document-apps --quote /absolute/private/quote-apps --inventory /absolute/private/inventory-apps --output /absolute/private/deployment-rehearsal`

The command checks EVERY accepted package in the three manufacturing families (up to nine), validates the exact code files and complete independent lifecycle acceptance receipts, then boots the **actual assembled packages** in fresh isolated subprocesses. It checks two startup/stop/restart sequences against the same private SQLite state, 127.0.0.1-only health, authenticated route denial, strict Host and Origin boundaries, HTML and browser CSP. It rechecks source hashes after exercising, then atomically emits an immutable no-secret source-hashed report.

CI rehearsals are linked only to successfully manufactured packages; the artifact expires after seven days. No replacement, hard-coded credentials, remote port, hosting cost or checkout is introduced. If any package proof is wrong or its HTTP behavior fails, the whole deployment-ready report is withheld, and no external operation is attempted.

**This materially improves local deployment repeatability, not production deployment.** Existing apps intentionally bind loopback and have no public TLS, external key custody, production privacy approval, business onboarding, actual buyer consent, uptime SLA, remote backup or external health routing. `rollbackExecuted:false` and `approvedDeploymentTarget:null` are explicit. A separately authorized hosting architecture and release review must precede any public deployment.

## Source-backed cross-family research and failover checks

The factory additionally derives four quote-to-internal-order and four inventory applications from bounded research hypotheses, verifies their actual assembled HTTP+SQLite lifecycles and creates a separate **11-application research rehearsal** (three original document apps plus eight new candidates). Existing default applications are unchanged. Both the original and research rehearsals verify an actual loopback-only same-hash canary lane switch, inject an outage, and observe recovery to a healthy private baseline. This is **not** tested cross-version database migration, remote TLS, uptime assurance, commercial validation, a public deployment or production rollback. These remain explicitly unapproved. The GitHub CI artifacts expire after seven days.

## Distinct-version local traffic rollback

CI now also assembles meaningful alternative versions of the original document, quote and inventory apps, revalidates the original and candidate source-hashed packages/acceptance receipts, and tests local routing and fallback on a forced canary outage. With both versions stopped, the proxy must return 503. The stable version restarts with its original isolated synthetic SQLite state. The private, source-hashed report is retained for seven days. This is not a production version migration or live rollback; customer-state transfer, public hosting, financial activation and independent security review remain blocked. See [VERSIONED_ROLLBACK.md](VERSIONED_ROLLBACK.md).
