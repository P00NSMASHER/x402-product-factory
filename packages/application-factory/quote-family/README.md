# Quote-to-Order — a genuinely different, independently working application family

The existing factory has mostly manufactured document-intake SaaS apps. This implementation adds a separate **quote-to-order** family with its own domain kernel, pricing calculations, durable persistence, tenant identity, two-role approval, browser user experience, acceptance harness and three verified packaged editions: Print Estimate Desk, Rental Estimate Desk, and Field Service Estimate Desk. Unlike the document-family recipes, these apps contain item-level quotes, unit quantities, integer-cent pricing, quote lifecycle transitions, separated reviewer approval, internal audit stream, and approved work-order handoff.

## What really works

- Independent self-contained Node.js 22.13+ package for each buyer workflow. Zero runtime npm dependencies and zero external network dependencies.
- Responsive desktop/mobile HTML/CSS/JavaScript; no third-party images, fonts, or scripts. Session is a bearer key in volatile JS memory only; it is cleared on sign-out. No localStorage/sessionStorage/browser cookies.
- One server-local SQLite database per app under an operator-private data directory **outside** its package. Each synthetic tenant has distinct operator and reviewer credentials. Tenant A cannot list, mutate or export Tenant B's quotes. The reviewer cannot edit prices or submit orders; the operator cannot self-approve.
- Itemized price math uses **integer USD cents** (no binary floating-point rounding in the authoritative server). Prices are explicitly entered as examples, not invented supplier rate tables. Validation guards maximum quantities, line counts, total cents and expiry windows.
- Status: Draft → Pending independent review → Approved or Rejected → (if approved) a **non-billing order handoff**. Rejected quotes can be reopened. Expired quotes cannot be approved or converted. The background worker records expired-quote events internally, even with the browser closed.
- Idempotency keys and optimistic revisions prevent duplicate quote creation or order conversion following uncertain network delivery. Replay returns the original saved result without repeating events. No automatic email, customer signing, invoicing, payment processor or external accounting integration.
- Full package acceptance independently executes HTTP, SQLite, two-role review, tenant separation, quote-to-order conversion, retry behavior, restart persistence and internal expiry from the **assembled package bytes**. Native Chromium acceptance then navigates full desktop/mobile journeys across three editions.
- Every manufactured app has a signed-by-source SHA-256 inventory and a `releaseApproved:false` manifest. A changed or added file invalidates the artifact; quarantined failures cannot automatically overwrite pre-existing packages.

## Factory generation

```
node --test packages/application-factory/quote-family/*.test.js
node scripts/manufacture-quote-apps.js --output /absolute/private/quote-family-apps
```

Each candidate directory is named `id-sha256` and includes complete runtime files, recipe, package metadata, launch script, and local documentation. The factory generates three apps without human per-app prompts. On GitHub, `.github/workflows/factory-quote-family-ci.yml` validates them and uploads a seven-day candidate artifact; the inherited `factory-manufacturing-ci.yml` also builds them and exercises native Chromium acceptance, and the six-hour autonomy workflow can build them as a second lane on each run once that workflow is authorized on the default branch.

Run an assembled app **locally**, never on a public interface:

```
node run.js provision --state-dir /absolute/private/quote-state --tenant synthetic-team
node run.js serve --state-dir /absolute/private/quote-state --port 8788
```

Provisioning writes private operator and reviewer key JSONs within the private state directory. The CLI does not print credentials. The operator must distribute the reviewer key privately only to a designated evaluator. Browse `http://127.0.0.1:8788/app`; HTTP intentionally binds to loopback only, with Host/Origin and CSP guards. No production SSO, TLS, MFA, security certification, customer payment system or offsite disaster recovery is implied.

## Distinguish technical output from business value

These are **three functional prototype SaaS apps**, not three paying businesses. They have never been used with actual customers, nor has market demand or unit economics been independently verified. They are not production-ready to accept real customer names, files, financial records or commerce. The **commercial HOLD** still applies: no live deployment, automatic purchasing or billing, customer contact, price changes, spending, paid APIs or numbered x402 Product 025+ unlock. A high-quality quote calculator is not a guaranteed profitable product.

Adding further quote industries requires substantive distinct unit types, workflow stages or buyer mechanisms, not cosmetic title replacements. Future autonomous research can propose additions with explicit source references and separate test and release gates. The original document-workflow lane and its autonomous 6-hour recurrence remain unchanged.
