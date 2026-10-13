# Durable application runtime — local development candidate

This extends the three existing application recipes with a real persistent backend and a browser-independent worker. It reuses the exact existing workflow kernel; it does not create new numbered products or replace the static prototype interfaces.

## Implemented

- SQLite-backed workspaces, command receipts, scheduling state, and internal notification inbox. State and notifications commit together, or neither commits.
- Operator-provisioned 256-bit bearer credentials; only digests are stored. HTTP derives the tenant from the credential, never from a submitted tenant ID. Rotation and revocation are available through the local runtime API.
- Idempotent intake commands and optional version checks. Repeated requests cannot silently create duplicate records; conflicting reuse of a key fails.
- Transactional job claims with expiring, fenced leases. Restarted workers recover unfinished work without allowing a stale worker to overwrite a new claim.
- Automatic catch-up, bounded retries and quarantine after three failures. One failed workspace does not halt the other workspaces. Pause/resume invalidates in-flight claims.
- One provisioning command creates all three existing recipe workspaces for a tenant. The authenticated HTTP API supports intake, document-receipt metadata, archive, automation control, state and inbox reads.

Internal inbox records are real local application output. They are not delivered email/SMS, and the existing kernel's `simulated` reminder intention remains distinguishable from external delivery. No external message provider, webhook, payment or marketing action is called.

## Run locally

Requires Node.js 22.13+ with `node:sqlite`; tested here with Node 22.16.0. The SQLite API is experimental in Node 22. Use only an operator-private directory outside the source repository; on POSIX it must be owned by the process user and inaccessible to group/others. Windows ACL verification is outside this candidate.

```sh
node scripts/run-application-runtime.js provision --state-dir /absolute/private/factory-state --tenant example-team --credential-file /absolute/private/factory-state/example-team.json
node scripts/run-application-runtime.js serve --state-dir /absolute/private/factory-state --port 8789
```

The credential file is newly created, never overwritten, and contains the tenant's bearer token. Its contents are not printed. Keep it private and out of Git. The server binds only to `127.0.0.1`; the worker runs while this process runs. Closing a browser does not stop it. Stopping the service or the host does stop processing; the next start catches up. This is not a service installed on the owner's computer or a cloud deployment.

A single bounded sweep is also available:

```sh
node scripts/run-application-runtime.js sweep --state-dir /absolute/private/factory-state
```

## HTTP contract

All `/v1` routes require `Authorization: Bearer <token>`. Browser-origin requests and unexpected Host headers are rejected; this API-only candidate does not yet connect the static prototype UI. There is no cookie login, signup, password reset, MFA or SSO.

| Route | Operation |
|---|---|
| `GET /v1/recipes` | Read the three supported recipes |
| `GET /v1/workspaces` | List only the authenticated tenant's workspaces |
| `POST /v1/workspaces` | Create `{id, recipeId}`; same-ID/same-recipe retry is idempotent |
| `GET /v1/workspaces/:id` | Read records, snapshot and automation status |
| `GET /v1/workspaces/:id/inbox` | Read scoped internal notifications |
| `POST /v1/workspaces/:id/commands` | Send `{command, expectedVersion?}` with an `Idempotency-Key` header |

Commands: `add` with name/dueOn, `receive` with recordId/requirementId/optional expiresOn, `archive` with recordId, or `automation` with enabled. No arbitrary code, caller-controlled clock, snapshot replacement, tenant switch, billing change or messaging destination is accepted. Bodies are limited to 16 KiB. The unauthenticated `/health` route exposes no tenant data.

## Verification

```sh
node --test packages/application-factory/runtime/*.test.js
node packages/application-factory/runtime/acceptance.js
```

The acceptance runs 100 synthetic workspaces across all three editions, closes the creating connection, processes work in four independent child processes, reopens state and checks each inbox. It emits actual counts and null customer/revenue fields. Further tests cover two concurrent connections, lease takeover, mid-commit rollback, malformed and foreign databases, authentication, command retries, HTTP limits, credential-file non-overwrite and the automatic supervisor.

## Limits and release state

Single-host SQLite, not a distributed database or hosted service. No encrypted storage, binary uploads, backups, customer signup, production UI integration, live email/SMS, billing or acquisition. Metadata is plaintext in the private SQLite file. No production security certification or independent reviewer approval is claimed.

Defaults: 60-second workspace cadence, 30-second leases, 25 workspaces per sweep, retries after 60/120 seconds then quarantine. At most 1,000 tenants/workspaces and 1,000 command receipts per workspace; the kernel's 500-record/5,000-history bounds still apply. Capacity exhaustion fails closed; archival/retention migrations are future work. Downtime generates current reminders only, not a flood for missed intervals. Internal database idempotency is not an exactly-once external delivery guarantee.

Draft, unmerged and undeployed. Product 025+ restrictions, existing prices, wallets, payment boundaries, account schedules and commercial HOLD remain unchanged. Human/security review and approved hosting configuration are required before real customer use.

Technical references: Node SQLite documentation https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html and SQLite transaction semantics https://www.sqlite.org/lang_transaction.html .
