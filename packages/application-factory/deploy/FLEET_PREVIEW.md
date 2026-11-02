# One-command private fleet preview

The factory's generated apps previously passed isolated QA, but were awkward to inspect together. This launcher **actually starts every accepted app** from an exact hash-verified manufacturing batch, with a separate 127.0.0.1 HTTP service and isolated SQLite state per app. A responsive, read-only private portal links to each app's real browser UI.

On a machine with Node.js 22.13+, run:

    node scripts/run-private-fleet-preview.js --serve --document /absolute/private/document-apps --quote /absolute/private/quote-apps --inventory /absolute/private/inventory-apps --state-root /absolute/NEW/private/preview-session

All four paths are mandatory. The state directory must **not already exist**: a fresh owner-private 0700 session prevents unsafe app-version reuse. The CLI prints the portal's localhost address plus paths to credential files, **never keys**. Each app gets separate synthetic operator/reviewer credentials, stored as owner-private 0600 files inside its 0700 directory. The document family has a single operator key; quote/inventory have separate operator/reviewer keys. Enter the relevant key into the app login page. No real buyer identity is provisioned.

The portal has a strict CSP: no scripts, remote assets, contact forms, payments, telemetry, tokens, or live actions. The portal is strictly localhost and never proxies application APIs. Each assembled app retains its own authentication, tenant/role isolation and synthetic mode. If any service fails to start, the launcher closes its private servers and discards the freshly created session.

One-shot manufacturing gate:

    node scripts/run-private-fleet-preview.js --exercise --document /absolute/private/document-apps --quote /absolute/private/quote-apps --inventory /absolute/private/inventory-apps --state-root /absolute/NEW/private/preview-session

This runs all services, independently checks real localhost health, app HTML/CSP, unauthenticated API denial and portal Host/Origin controls, then stops. The CLI prints a secret-free acceptance result. The owner-private state directory includes credentials: **never upload it or attach it to a release artifact**. Only the sanitized, source-digested report may be retained by CI.

Boundaries: This is a running **local synthetic demo**, not public SaaS, a paid deployment, a security review or independent buyer validation. No hosting account, TLS, customer-state migration, mail/SMS, payment, purchase, business registration or x402 Product 025+ release is enabled. The existing six-hour ChatGPT coordinator is unchanged; the GitHub workflow cron is not activated until an authorized default-branch review and merge.

## Automatic crash recovery with no human or external contact

With `--serve`, the local watchdog checks all app health endpoints every five seconds and automatically restarts failed services from exact source-verified packages, preserving their existing private SQLite state and the original 0600 role credentials. At most two restart attempts per application are permitted; repeated or tampered failures quarantine the affected service. The portal tracks the new local app port. The `--exercise` CI mode deliberately stops and recovers every locally running application, verifying proof and credential continuity before reporting success. Watchdog activity never sends messages, outreach, emails, social posts, supplier communications, or other external requests. See [AUTONOMOUS_RECOVERY.md](AUTONOMOUS_RECOVERY.md).

## Full launcher process crash recovery (still local-only)

The in-process watchdog cannot recover after its own launcher process dies. The new `scripts/supervise-private-fleet.js` stays outside the private launcher and automatically restarts it after an abnormal exit (two bounded restarts), preserving the original source-verified packages and synthetic SQLite tenants/credentials. It never creates a new workspace after a crash, loses the existing data, sends an external message, or changes scheduled tasks.

Start a newly manufactured synthetic fleet under the process-level watchdog:

    node scripts/supervise-private-fleet.js --watch --document /absolute/private/docs --quote /absolute/private/quotes --inventory /absolute/private/inventory --state-root /absolute/NEW/private/session

If the containing computer or watchdog process restarts, resume a previously stopped/crashed private session with:

    node scripts/supervise-private-fleet.js --resume-watch --document /absolute/private/docs --quote /absolute/private/quotes --inventory /absolute/private/inventory --state-root /absolute/existing/private/session

The source, accepted package digests, read-only receipt checksum, existing synthetic role credentials, file ownership/permissions, SQLite files and single-process lease are checked before creating new listeners. A second concurrent launcher refuses the active lease; a dead process lease is reclaimed only after the PID is no longer alive. The resume path never cleans/replaces the existing state on failure. After recovery, internal `127.0.0.1` ports may change and the private portal announces the new address. This is not a stable public URL or true external hosted uptime.

Unattended CI kills an actual child process with SIGKILL, then independently resumes it, reads back committed synthetic document, quote and stock records, checks original credential SHA-256 fingerprints and unauthenticated API denial, and produces secret-free proof for both 9-app and 17-app fleets. The full private session, role secrets, SQLite/WAL, lock file and remote-preview keys are never uploaded. SHA-256 receipts are untrusted local checksums, not external signatures.

**Limits:** The supervisor must itself be running. Host shutdown, disk failures, credentials deletion, application source drift, exhausted restart budget or unsafe database state remain explicit hold conditions. No startup service, cron, Tailscale exposure, Cloudflare hosting, paid resource, real customer session, outreach, purchase or public deployment is configured. The independent remote-preview gateway must be separately reviewed and reconfigured after a port change. No contact with any person is permitted without explicit prior user approval.
