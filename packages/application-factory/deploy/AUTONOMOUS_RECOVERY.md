# Autonomous private fleet repair (no external contact)

**Objective:** Preserve a working private fleet without user intervention after a local service crash. This does not authorize a public deployment, contacting a person or changing a scheduled task.

Each `--serve` preview session starts an in-process, **five-second, loopback-only** health supervisor. It validates `GET /health` for each of the source-hashed package apps. If one local listener fails, recovery first rechecks the immutable package bytes and acceptance identity, opens the same owner-private SQLite database under the same validated recipe, and reuses the original `0600` operator/reviewer credential file. It **never provisions a new tenant or resets a customer**, never inserts external data and never contacts an external endpoint. The portal refreshes links to the restarted local port automatically.

Each app may be restarted at most **two times per supervisor lifetime**. On repeated failed recovery, the app is quarantined and stays down; other apps remain available. Package tampering, unsafe file permissions, changed credentials, foreign roles or invalid tenant state cause explicit hold, **not** replacement with a clean database. The supervisor never deletes a failed service's private SQLite state, changes source code, routes traffic off-loopback, changes a git branch, sends email/SMS/DMs, buys products, publishes a website, or unfreezes x402 Product 025+.

Machine-readable report: `private-watchdog-report.json` in the owner-private *session root* (0600). It includes restart budgets, per-service sanitized states, counts, source digests and a SHA-256 integrity checksum. It has no raw credentials, cookies, user messages or buyer records. The file **is not an independently authenticated signature**. It should **not** be used as commercial/security release proof.

Exact independent Linux acceptance includes real manufactured document/quote/inventory app instances, artificial listener loss, retained SQLite business records and idempotency receipts, unchanged credential SHA hashes, dynamically updated portal links, recovered `/health` and authenticated reads; adversarial package tampering consumes the bounded budget and quarantines the affected app. The GitHub CI one-shot command also exercises recovery on the full 9- and 11-app private fleets and uploads only its sanitized report, **not** any state directory or credentials.

Run a private fleet as described in `FLEET_PREVIEW.md`. The watchdog runs only while that **local process** remains running; it is not an always-on cloud daemon and cannot recover a crashed host, power loss, failed network or deleted operator state. Remote-preview adapters introduced separately still require a separate owner-approved network ingress and are not automatically rebound after local recovery. Production operations require independent security, consent, privacy, legal and deployment review.

## Full launcher process crash recovery (still local-only)

The in-process watchdog cannot recover after its own launcher process dies. The new `scripts/supervise-private-fleet.js` stays outside the private launcher and automatically restarts it after an abnormal exit (two bounded restarts), preserving the original source-verified packages and synthetic SQLite tenants/credentials. It never creates a new workspace after a crash, loses the existing data, sends an external message, or changes scheduled tasks.

Start a newly manufactured synthetic fleet under the process-level watchdog:

    node scripts/supervise-private-fleet.js --watch --document /absolute/private/docs --quote /absolute/private/quotes --inventory /absolute/private/inventory --state-root /absolute/NEW/private/session

If the containing computer or watchdog process restarts, resume a previously stopped/crashed private session with:

    node scripts/supervise-private-fleet.js --resume-watch --document /absolute/private/docs --quote /absolute/private/quotes --inventory /absolute/private/inventory --state-root /absolute/existing/private/session

The source, accepted package digests, read-only receipt checksum, existing synthetic role credentials, file ownership/permissions, SQLite files and single-process lease are checked before creating new listeners. A second concurrent launcher refuses the active lease; a dead process lease is reclaimed only after the PID is no longer alive. The resume path never cleans/replaces the existing state on failure. After recovery, internal `127.0.0.1` ports may change and the private portal announces the new address. This is not a stable public URL or true external hosted uptime.

Unattended CI kills an actual child process with SIGKILL, then independently resumes it, reads back committed synthetic document, quote and stock records, checks original credential SHA-256 fingerprints and unauthenticated API denial, and produces secret-free proof for both 9-app and 11-app fleets. The full private session, role secrets, SQLite/WAL, lock file and remote-preview keys are never uploaded. SHA-256 receipts are untrusted local checksums, not external signatures.

**Limits:** The supervisor must itself be running. Host shutdown, disk failures, credentials deletion, application source drift, exhausted restart budget or unsafe database state remain explicit hold conditions. No startup service, cron, Tailscale exposure, Cloudflare hosting, paid resource, real customer session, outreach, purchase or public deployment is configured. The independent remote-preview gateway must be separately reviewed and reconfigured after a port change. No contact with any person is permitted without explicit prior user approval.
