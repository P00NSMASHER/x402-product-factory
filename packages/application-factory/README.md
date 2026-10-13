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

## Controlled tenant service (offline development only)

An **optional loopback HTTP service** reuses the same three recipes and server-side
workflow kernel. Provisioned credentials bind a request to exactly one tenant
and edition. Browser demos remain local-only: they do not connect to this new
service, and their localStorage data does not become protected by this addition.

Requires Node 22+, no packages, no paid infrastructure. Example:

    node packages/application-factory/tenant-service.js init /tmp/factory-synthetic-tenants
    node packages/application-factory/tenant-service.js provision /tmp/factory-synthetic-tenants tenant-alpha supplier-desk editor
    node packages/application-factory/tenant-service.js provision /tmp/factory-synthetic-tenants tenant-bravo supplier-desk viewer
    node packages/application-factory/tenant-service.js serve /tmp/factory-synthetic-tenants 8765

Provisioning prints a **one-time bearer token** in the administrator's terminal.
Do not place tokens in source control, browser storage, tickets, or logs. The
registry stores only SHA-256 hashes of randomly generated 256-bit tokens.
The administrator may revoke using the credential ID returned from provision:

    node packages/application-factory/tenant-service.js revoke /tmp/factory-synthetic-tenants cred-EXAMPLE

Editor credentials can read, write and restore their own edition. Viewer
credentials can read/export only. Provision each tenant/edition separately;
identity is never accepted from a request-provided tenant header or field.

Example authenticated requests (use fictional data only):

    export FACTORY_TOKEN='ONE_TIME_TOKEN_FROM_PRIVATE_PROVISION'
    curl -fsS -H "Authorization: Bearer $FACTORY_TOKEN" http://127.0.0.1:8765/v1/workspaces/supplier-desk
    curl -fsS -X POST -H "Authorization: Bearer $FACTORY_TOKEN" -H "Content-Type: application/json" --data '{"expectedVersion":0,"command":{"type":"addRecord","name":"Synthetic Supplier","dueOn":"2026-10-20"}}' http://127.0.0.1:8765/v1/workspaces/supplier-desk/commands

Available routes: GET /health; GET /v1/workspaces/{edition};
POST /v1/workspaces/{edition}/commands; GET /v1/workspaces/{edition}/export;
POST /v1/workspaces/{edition}/restore. The editor's command JSON contains
expectedVersion and a command. Supported command types are addRecord,
receive, archive, advanceDay and runAutomation (matching the shared kernel).
An export is signed with an installation HMAC key and tied to its tenant and
edition. Restore accepts only that signed export and the current version.
Stale writes return 409. File uploads always return 415 and multipart/binary
payloads are rejected; only document *receipt metadata* is stored. Reminder
outbox entries remain simulated or cancelled and are never delivered.

State files use hashed tenant/edition filenames, restrictive permissions
(0600), HMAC integrity checks, fsynced temp writes and atomic rename.
The preceding valid state is retained as a signed backup. Corrupted primary
state falls back to that backup, potentially losing the latest acknowledged
write. If both are corrupt, reads fail closed. The installation key is essential
for integrity verification and must be protected. One server per data
directory is enforced by a lock file; a stale lock after a crash requires
administrator investigation before manual removal.

**Not suitable for customer data:** loopback HTTP bearer credentials are
long-lived and lack production login, expiry, user sessions, TLS, and CSRF
protections; the store is single-process, not a transactional managed database
with replicated backups, PITR, immutable audits or zero-data-loss recovery.
Someone with filesystem administrator access or a leaked token can access
data. Do not reverse-proxy or expose this API on public networks, accept real
documents, or enable outbound messaging, uploads, payments or commercial
activation. The existing browser gallery still uses insecure localStorage.

Independent checks:

    node --test packages/application-factory/tenant-service.test.js
    node --test packages/application-factory/factory.test.js packages/application-factory/acceptance.test.js
    node packages/application-factory/acceptance.js --check

Remaining dependencies: authenticated generated front ends with hardened
sessions, managed identity and TLS, durable transactional storage with tested
restore/PITR, secure object uploads (malware, type, size, retention and access
policies), consent-aware message delivery, and explicit release approval.
