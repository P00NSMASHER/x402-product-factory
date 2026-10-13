# Application Factory: document-workflow family

A first working increment of the approved full-application factory direction.
It generates actual interactive browser workspaces from one shared engine,
instead of adding another single-purpose paid API.

## Build and run

Requires Node 22 or later, with no package installation.

```sh
node --test packages/application-factory/factory.test.js
node packages/application-factory/acceptance.js --check
node scripts/build-application-factory.js --check
node scripts/build-application-factory.js /tmp/new-application-prototypes
```

Use a new output directory whose parent already exists. Existing output paths are
never overwritten. Windows example: `C:\Users\YOUR_NAME\AppData\Local\Temp\application-prototypes`.
Open the generated `index.html` gallery and choose an edition. A local static
server gives consistent browser-storage semantics; file URLs also render but
browser persistence may be unavailable. No external service or API key is needed.

## Working functionality

One recipe generates a standalone application, recipe JSON, artifact manifest,
and clearly unvalidated offer hypothesis. Three example recipes have different
requirements, renewal behavior and reminder intervals: supplier intake,
contractor renewals, and agency client intake.

Inside each workspace: create synthetic intake records; filter/search; record
required-document receipt metadata; track expiry; run or advance deterministic
reminder simulations; archive; inspect activity; export a snapshot. Browser
state is optionally persisted. A restored snapshot must match the exact recipe
and workspace and pass validation. Reminder cycles also run every minute while
the tab is open; they do not advance the synthetic scenario clock automatically.
Repeated cycles are deduplicated within each record's configured interval.

## Boundaries

- Prototype only. No production authentication, authorization, server-side
  tenant isolation, actual document uploads, delivery worker, billing, or sales.
- Local browser namespacing is NOT a security boundary. Use synthetic data only;
  the user or same-origin scripts can inspect or alter localStorage.
- A receipt marks checklist completeness, not document authenticity, vendor
  safety, legal compliance, or approval to transact.
- Outbox entries are `simulated` or `cancelled`, never sent. Generated CSP denies
  outbound connections and permits only content-hashed scripts/styles.
- Customer/revenue fields remain null. 100 generated synthetic editions do not
  mean 100 launched products or buyers. No new product numbers are registered.
- Existing x402 catalog, routes, wallets, prices, source policies, scheduled
  tasks, release approval and Product 025+ freeze are unchanged.

## Next implementation slices

1. Authenticated tenant service and storage with cross-tenant tests, not client
   identity assertions. Secure upload policy, expiry and permission model.
2. Durable consent-aware delivery outbox, retries, provider receipts, opt-outs,
   spending boundaries and tested rollback. Background execution needs hosting.
3. Approved normal checkout, lifecycle entitlements and self-service account
   management; preserve existing x402 rails rather than silently replacing them.
4. Real acquisition, activation, repeat use and contribution measurement. A
   generated UI is not demand evidence; scale only on real observed outcomes.

Full design: `docs/superpowers/specs/2026-10-13-application-factory.md`.
