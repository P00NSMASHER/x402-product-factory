# On-demand remote synthetic App Factory preview

**Status:** authenticated remote-preview adapter implemented and locally testable; no remote host, iPhone URL, customer environment, or production SaaS deployed. The original 9-app and research 11-app private fleet gates remain unchanged.

## Security boundary
- Every generated document, quote, and inventory service continues to bind only to `127.0.0.1`. A single selected application is reachable through a **separately operated private HTTPS ingress**, never by binding the factory or adapter publicly.
- The adapter verifies the expected HTTPS Origin, rejects hostile Host/Origin, cross-site API requests and nonallowlisted routes, and requires an independently generated login code stored in `0600` state. The resulting session cookie is Secure, HttpOnly, SameSite=Strict, expires in 30 minutes, and limits failed logins.
- Application-level bearer keys, tenant isolation, operator/reviewer roles, document browser CSRF and session checks remain enforced by the generated application. Document pilot activation, raw bearer routes, uploads and purchases are not exposed.
- CLI runtime is operator-selected, at most 60 minutes. No payment, customer setup, public SaaS approval, DNS, tunnel, commercial outreach, usage telemetry or credential upload.
- No `0.0.0.0` listeners and no network deployment occur from GitHub Actions. Synthetic demonstrations do not establish production readiness.

## Fastest private external-device option: Tailscale Serve

Preconditions: an **owner-controlled computer/VM**, Node.js 24 (verified in GitHub CI; older runtime compatibility not established), Tailscale installed and signed in on both that machine and the iPhone, an explicitly approved tailnet-only access rule, and HTTPS/MagicDNS enabled for the node. None of these devices are currently connected to this agent's environment. **Use Tailscale Serve, never Funnel**.

From a checkout including [PR #48](https://github.com/P00NSMASHER/x402-product-factory/pull/48) and this follow-up branch, on the authorized computer:

```bash
umask 077
ROOT="$(mktemp -d)"
node scripts/manufacture-applications.js --output "$ROOT/documents"
node scripts/manufacture-quote-apps.js --output "$ROOT/quotes"
node scripts/manufacture-inventory-apps.js --output "$ROOT/inventory"

node scripts/run-private-remote-demo.js --serve \
  --document "$ROOT/documents" --quote "$ROOT/quotes" \
  --inventory "$ROOT/inventory" --state-root "$ROOT/session" \
  --family quote --id print-estimate-desk \
  --external-origin 'https://YOUR-MACHINE.YOUR-TAILNET.ts.net' \
  --port 18788 --minutes 30
```

In another terminal on the **same machine**, run `tailscale serve 18788`. Verify its printed HTTPS origin is **exactly** `--external-origin`. The Serve URL is private to authorized devices on the tailnet, not publicly indexed.

From the iPhone in that tailnet, visit that HTTPS URL and sign in with two **distinct credentials**: the gateway code in `$ROOT/session/remote-demo-access-quote-print-estimate-desk.json`, then the real app operator code in `$ROOT/session/quote-print-estimate-desk/credentials.json`. Never publish either file, credential, or the state directory. The launcher prints credential **file paths** only.

For a document or inventory app, rerun in a fresh session using `--family document --id supplier-desk` or `--family inventory --id mro-parts-replenishment`. The same adapter is used for all three families.

To stop or roll back: stop the gateway process; disable the Tailscale Serve route (`tailscale serve off` if applicable); confirm `tailscale serve status` and ensure Funnel is off. Delete stale synthetic state after retention needs pass. Restarting requires a **new** state directory and fresh credentials. This rollback does **not** migrate or restore production customer state.

## Acceptance and limits
Run locally:
```bash
node --test packages/application-factory/deploy/remote-gateway.test.js \
  packages/application-factory/deploy/remote-gateway.integration.test.js \
  scripts/run-private-remote-demo.test.js
```

GitHub CI separately runs a **real manufactured quote application's browser UI** behind disposable local TLS at iPhone (390px) and desktop (1440px) widths, checking authentication and unauthorized access, without exposing key files or making external requests. This is evidence of the proxy code path, **not** an actual remote-device test or an independently approved security review.

Cloudflare account inspection found **zero tunnels** and **Access not enabled**. The existing RETALLY DNS zone is unrelated: do not attach a public preview hostname or create an unsecured tunnel. A Cloudflare Access+Tunnel alternative requires configuring Access policies, a protected domain and a reliable connector host, plus explicit deployment approval. Vercel's existing unrelated projects do not supply a stateful always-on Node/SQLite fleet by themselves.

**Release boundary:** synthetic demonstration only; no paid services, public commercial availability, real customers, payments, or production launch.
