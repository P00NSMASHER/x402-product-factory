# Connected application workspaces

Owner objective: keep upgrading the approved application factory without asking for another execution prompt. Connect the three existing recipe editions to PR #26's durable runtime, with a browser-independent worker and a usable authenticated interface. Local development only; no deployment, spend, messaging, billing, or product-number unlock.

## Selected increment
Serve one shared, responsive `/app` interface from the loopback runtime. Populate its workspaces/checklists from the existing authenticated API and recipe data. Reuse the existing kernel and database schema unchanged. The older downloadable synthetic prototypes remain unchanged and explicitly separate.

Exchange the operator-provisioned credential for a random opaque HttpOnly, SameSite=Strict browser cookie scoped to `/app`. Keep session credentials only in bounded server memory, never browser storage, URLs, generated HTML, or logs. Recheck revocation/rotation on each request. Thirty-minute absolute expiry, logout, and process shutdown invalidate access; the database remains persistent. Login is credential-based access, not customer signup or a claim of production identity management. HTTP lacks Secure-cookie/TLS because this server must bind only to loopback. Public hosting remains prohibited.

Serve a strict static allowlist, no filesystem traversal. Require exact Host, same-origin POST and a session-bound CSRF header for every authenticated browser mutation. Existing `/v1` machine-credential rules remain unchanged. Keep content-size, strict field and safe-error controls. No wildcard CORS or remote content.

The UI supports selecting any provisioned recipe workspace, adding intake, recording document-receipt metadata and renewal dates, archiving with confirmation, pausing/resuming automation, reading the durable inbox and activity history, and server-side snapshot download. Background refresh reads the database; it must never call a simulation timer or mutate the business clock. A lost/uncertain command reply preserves its exact idempotency key until retry. Disable new writes while a response is unresolved. Logout/session expiry clears all private screen data. Delayed responses must not repopulate another session or workspace. No local-data fallback.

## Acceptance
Test first: login/logout/expiry, CSRF and origin/host enforcement, revocation, cross-customer IDs, reload persistence, safe errors, output encoding, bounded sessions/login attempts, strict asset routes, duplicate response retries, and preserved machine-API restrictions. Exercise all three recipes against real SQLite/HTTP, close the browser, observe the server worker's saved inbox, reconnect, then reopen the database. Full repository CI must pass; focused tests do not replace it.

## Limits
Document receipts are metadata, not secure uploads or document verification. No MFA, signup, cloud hosting, automatic installation, external email/SMS, or new commercial activation. Sessions are deliberately lost after server restart; work is not. No tests or synthetic users count as customers or revenue.
