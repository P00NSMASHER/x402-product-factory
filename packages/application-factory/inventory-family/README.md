# Inventory Readiness — third independently executable SaaS family

This family is a genuinely different application domain from document-intake workflow tracking and quote-to-order. It tracks **physical stock, reservations, internal consumption, shortages, internally proposed replenishment, separate reviewer approval, and simulated receipt**. The three complete example apps are MRO Parts Replenishment, Rental Consumables Control, and Hospitality Supply Desk. Each uses a different source-defined catalog of SKUs, reorder points, target levels, sample unit costs and review expiration policies.

## What actually runs

All three independently packaged apps contain their own Node.js 22.13+ SQLite stock ledger, opaque operator/reviewer credentials, idempotency receipts, deterministic integer unit counts and integer-cent cost estimates, local-only HTTP API, responsive browser UI, internal periodic background worker, source-hashed manifest and no-runtime-npm source. App state is private and outside the package. Mobile and desktop acceptance runs against the actual SQLite data and browser route with separate synthetic operator and reviewer identities.

- **Operator** records synthetic receipts, stock reservations, releases and consumption. The app calculates target-minus-position suggestions, never negative stock.
- **Background worker** creates at most one internally pending replenishment proposal per low-stock item. A browser need not stay open.
- **Independent reviewer** can approve or reject internal plans; the operator cannot approve their own proposed replenishment.
- **Approved internally** adds a simulated on-order quantity, not an actual vendor order or spending commitment. Operator later marks a fictional arrival, subtracts internal on-order and increments stock.
- **Sample unit costs are NOT quotations, negotiated rates, financial forecasts or commitments.** Sample totals use integer cents. The app does not choose a supplier, send a purchase order, call ecommerce APIs, send email/SMS, move money, or track a real vendor/customer.

## Manufacture

    node --test packages/application-factory/inventory-family/*.test.js
    node scripts/manufacture-inventory-apps.js --output /absolute/private/inventory-output

Each output package is named id plus source SHA-256 digest. A genuine package acceptance runs in a clean subprocess from the assembled bytes with private synthetic SQLite state, two tenants and two roles, HTTP Host/Origin guards, exact stock balances, manual + automatic nonbinding replenishment, concurrency/idempotence, and restart persistence. A quarantined/modified package is not silently overwritten. The manufacturing report and independent acceptance receipts are saved with the artifacts.

## Run one assembled app privately

    node run.js provision --state-dir /absolute/private/inventory-state --tenant synthetic-team
    node run.js serve --state-dir /absolute/private/inventory-state --port 8791

Open http://127.0.0.1:8791/app and enter either the separately stored operator/reviewer key. Tokens are NOT printed, saved in browser storage or transmitted to external hosts. The server binds loopback only and uses CSP/Host/Origin checks. A separate corporate identity/TLS/MFA, offsite recovery, malware scanning, privacy/security review and real customer permissions would be required for commercial service.

These are **technically validated synthetic SaaS candidates**, not three proven markets, customers, purchases or profitable stores. Real customers and collected revenue are **null**; commercial release is **false**. The original document and quote families and the factory's existing six-hour task remain unchanged. GitHub Actions on draft PRs run QA but the six-hour GitHub cron is inactive until separately reviewed default-branch merge. No supplier communications, paid APIs, public hosting, bank actions, Product 025+ unlock, live customer data or changes to account schedules are authorized.

The next autonomy upgrade should promote buyer-verified differentiators, source checks and measurable completed outcomes rather than inventing dozens of cosmetically renamed inventory apps. Accepted test receipts are software QA, not market fit or production compliance.
