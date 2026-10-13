# Connected browser workspaces

The local runtime now serves an authenticated, server-backed interface for all three existing recipe editions. Start the existing runtime CLI, then open `http://127.0.0.1:8789/app`. Enter the operator-provisioned tenant access key from the private credential file. No signup or external identity provider is introduced.

## What is connected

One shared screen renders each workspace's recipe, intake queue, checklists, document-receipt dates, internal inbox, and activity. Add intake, record receipt metadata/renewal dates, archive records, pause or resume that workspace's automation, and export its persisted snapshot. The prior downloadable browser-only prototypes remain unchanged; this interface is explicitly backed by the PR #26 SQLite runtime instead.

The browser refreshes saved status every four seconds, not the business clock. Closing the page does not stop the running server worker. A service restart discards browser sessions but retains workspaces, command receipts and notifications. A failed request never falls back to a browser-only record. If a mutation response is lost, the exact serialized command and idempotency key remain in memory until explicit retry, preventing duplicate intake after reconciliation. Pending writes block other writes. Logout/expiry clears private screen content and pending client actions; late replies cannot restore a prior session's data.

## Local session boundaries

- Thirty-minute absolute session expiry; bounded to 1,000 sessions and five per credential. Twenty failed logins in one minute trigger a local backoff. These are local guardrails, not a distributed abuse-prevention service.
- Random 256-bit session identifiers and CSRF values. Opaque HttpOnly/SameSite=Strict cookie, host-only and scoped to `/app`. Credential is retained only in private server-process memory during a session, never browser storage, URLs, page source, or application logs. The login field clears after success. SQLite continues storing only the credential digest.
- Every browser request revalidates the credential. Rotation/revocation invalidates existing sessions. Mutations reauthorize after asynchronous body parsing, so a concurrent logout cannot leave an already-read session valid for a later commit.
- Exact loopback Host, same-origin POST, session-bound CSRF header, strict body validation, and a static asset allowlist. No wildcard CORS, dynamic HTML interpolation, remote scripts/fonts, service worker or arbitrary paths.
- `/v1` retains its machine-credential rules and rejects browser origins/cookies. Browser routes live under `/app/api`.

The server still binds only to `127.0.0.1`. Its cookie deliberately lacks Secure on this HTTP-only local candidate. Do not expose it to the public network or run untrusted local web services on the same host. A hosted product requires reviewed HTTPS/cookie/identity configuration, and this increment is not that approval. No MFA, password reset, public registration, or production security certification is claimed.

## Evidence and reproduction

```sh
node --test packages/application-factory/runtime/browser.test.js packages/application-factory/runtime/browser-client.test.js
```

The tests use real temporary SQLite databases and loopback HTTP plus focused client-state tests. They cover session expiry/revocation/logout, cross-tenant workspace IDs, CSRF/Host/Origin controls, duplicate writes, service restart, streamed mutations after logout, stale responses and automatic worker processing. Local browser rendering covers all three editions at desktop/mobile sizes against an injected HTTP transport; the container's managed browser policy blocks native navigation, which was not disabled or bypassed.

The separate `Factory connected browser acceptance` CI workflow installs pinned Playwright 1.64.0 outside the source checkout and performs actual Chromium navigation, cookie handling, reloads, document tasks, uncertain-write reconciliation, browser closure with worker continuation, and service/database restart. It checks six full edition/viewport journeys and uploads synthetic screenshots plus the executed report. It is PR/manual verification, not a new scheduled business task. Its actual outcome is recorded in the PR receipt; local UI tests do not stand in for native browser acceptance.

Session/CSRF design references:
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://playwright.dev/docs/ci

## Still not included

Secure binary uploads, encrypted/backup storage, public customer signup, hosted service installation, paid subscriptions, email/SMS, marketing, and business launch. Receipt metadata is not document verification. Existing limits, x402 pricing/wallets, Product 025+ hold and account schedules remain unchanged. Test users are synthetic; revenue/customer counts remain unmeasured. Draft/unmerged/undeployed pending review.
