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
