# Demand-driven full-application growth loop

## Goal and context
The existing factory generates and verifies runnable document-workflow applications but has no repeatable path to proven sales. Add a buyer-facing, noncommercial test asset to each manufactured product, plus a private evidence-based growth decision tool. This must prevent synthetic manufacturing acceptance from being interpreted as sales or external demand.

## Chosen implementation
A deterministic pure offer renderer receives an already-validated recipe and emits a responsive static preview with real workflow requirements, no invented testimonials, money/savings metrics, public collection forms, external requests or checkout. Its content becomes part of the application's hashed manifest and is tested by the existing packaged-code acceptance. A read-only native Chromium check visits all 3 draft pages at desktop/mobile viewports.

An independent local Proof Book accepts hashed (not raw) buyer and provenance references, strictly bounded event types and cents fields, and an origin field distinguishing synthetic from external claims. Records start unverified. A separate reviewer key is needed for operator attestation. The state file is HMAC-authenticated, owner-private, atomically written and cannot be stored inside the repository. The report computes conservative evidence counts and offers a manual next-action recommendation; no decision enables live product changes or treats operator attestations as accounting confirmations.

A CLI supports initialization, recording, attesting and reporting with owner-private key files; no web/network, email, billing or other external provider connectors are used.

## Test gates
- 100 configured recipes produce distinct, deterministic draft offers that never claim customers or have working signup/checkout.
- Injection-like titles/labels cannot become HTML elements or external resources. Content Security Policy blocks scripts/connections.
- Manufacturing artifact digests include the offer files; modified offers fail verification; packaged acceptance checks the selected recipe's exact offer.
- Synthetic and unreviewed market records count as zero real demand, even if a counter or payment amount is supplied.
- Duplicate buyers/references, unsupported events, false payment source types, negative/out-of-range monetary values and raw personal information are rejected.
- Operator keys are separate; wrong reviewer key and changed proof JSON fail closed. No real buyers are invented.
- Ten qualified distinct conversations + three paid pilots + delivered outcomes + two repeat buyers + full positive cost coverage can suggest a **human scale review only**; refunds and missing costs block this stage.
- Existing full Factory CI and native-browser manufacturing and connected app acceptance remain unchanged and must pass on the exact head.

## Boundaries
No public launch, outbound marketing, opt-in customer form, provider-verified sales, live customer records, payment authorization, offsite backups, domain setup, legal filing or product-number unlock. A reviewer can lie; no cryptographic primitive can independently establish customer truth. Reporting labels must say *operator-attested*, never audited. All actions are operator-local and hypothetical until external commercial verification and approval.
