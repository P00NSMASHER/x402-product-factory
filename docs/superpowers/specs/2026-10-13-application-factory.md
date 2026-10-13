# Full-application factory: first working increment

## Owner direction

Build larger, useful, self-service applications from reusable product families.
Automate generation, quality checks, operation and eventual commercial learning.
Do not substitute more single-purpose APIs or invented customer results for this goal.
The preceding architecture was approved in conversation; this first implementation
is an isolated, reviewable prototype, not approval to launch or charge customers.

## First family: document collection and renewal

Build three working browser workspaces from one versioned recipe contract:
1. Supplier intake: business profile, insurance evidence, supplier terms;
2. Contractor renewals: insurance, trade qualification, safety acknowledgement;
3. Agency client intake: project brief, brand assets, client sign-off.
These are synthetic demonstration editions, not additions to product-registry.json.
Their requirements, due windows and renewal rules differ; not just their names.

A generated application includes an intake form, searchable work queue, per-record
checklist, document metadata receipt, expiry tracking, local reminder simulation,
audit history, snapshot export and an explicit capability/readiness panel.
A gallery links generated editions. No document bytes, credentials, real people,
private data, customer messaging or payment information are accepted or required.

## Architecture

- `kernel.js`: shared pure workflow engine and validated snapshot format. Date
  math is UTC-day-based; commands validate before mutation; reminders are
  idempotent within the configured interval and expire when their source changes.
- `recipes.json`: small, explicit, strictly validated family configurations.
- `generator.js`: deterministic compilation to standalone HTML, typed manifest,
  commercial offer hypothesis and content hashes. Batch validation is atomic;
  duplicate IDs, unsafe paths, unknown fields and production flags are rejected.
- `client.js` / `styles.css`: one responsive interface reused by all editions.
  All dynamic values are escaped or assigned as text; no external dependencies.
- `acceptance.js`: headless end-to-end execution through the same generated
  kernel, plus 100-edition manufacturing test. Synthetic results stay labeled.
- CLI: generates a fresh local output directory; refuses overwriting existing
  directories. Builds emit artifacts outside the repository.

No code is copied from competitors. Existing adapters, catalog, revenue, prices,
wallets, release freezes, monitors and production routes are untouched.

## Acceptance requirements

1. One command produces three runnable, different configured workspaces.
2. 100 unique synthetic recipes compile deterministically and execute the same
   intake -> reminder -> receipt -> completion/renewal -> export journey.
3. Repeated reminder runs do not duplicate an interval's queue items. Completing
   or archiving a record suppresses stale reminders. No sends occur.
4. Snapshot restoration rejects mismatched recipe/workspace IDs and corruption.
   Namespacing is not authentication or certified multi-tenant isolation.
5. All file outputs are reproducible; generated HTML executes with a hash-based
   content security policy and no outbound network permissions.
6. Desktop and mobile browser checks exercise forms, editing, reminders, state
   restoration, empty/error states and exports without external network calls.
7. Existing repository-wide tests and CI remain blocking. Preserve original
   production configuration and the Product 025+ freeze.

## Explicit limits and next slices

This increment is a browser-only prototype with local optional storage. It does
not implement production login, secure document uploads, durable multi-user
storage, delivery workers, subscriptions, acquisition, or guaranteed sales.
Do not use localStorage namespacing as a security boundary. It has no background
execution when closed and no external delivery connectors to accidentally enable.

Next slices: authenticated tenant/storage service with cross-tenant tests;
permissioned delivery outbox and retry worker; approved billing/account lifecycle;
then real customer acquisition and retained-revenue evidence. Customer task
completion, paid retention, costs and human interventions are the eventual business
metrics; generated editions and synthetic tasks are manufacturing metrics only.

## Technical references

Node test runner: https://nodejs.org/api/test.html
Browser storage semantics: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
Multi-tenant design: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
