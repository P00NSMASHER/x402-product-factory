# Durable application-family runtime

## Owner outcome
Continue the approved application-factory upgrade: the existing three recipe editions must perform routine work without a browser, retain state after process restart, and isolate workspaces belonging to different customers. This is an internal implementation increment, not commercial release permission.

## Selected implementation
Reuse the exact PR #25 workflow kernel. Add a local Node.js 22.13+ runtime backed by SQLite (the built-in API remains experimental in Node 22). A supervisor polls due workspaces; SQLite transactions and fenced leases prevent concurrent workers from committing stale work. State and an internal notification inbox commit together. Repeated client actions use an idempotency key and expected-version checking.

Tenant identity is obtained from a high-entropy, operator-provisioned bearer credential. Only its SHA-256 digest is stored. The HTTP API never accepts a tenant identity from the payload. This is machine-credential authorization, not full customer signup, passwords, MFA or SSO. Credentials can be rotated or revoked. A local CLI provisions credentials into a new private file without logging them.

A worker can catch up after downtime, retry failed work with bounded exponential backoff, quarantine repeatedly failing workspaces, and continue processing healthy workspaces. Pause/resume fences outstanding leases. Kernel-generated reminder intentions become internal inbox notifications; no email/SMS/webhook provider is implemented or called. The existing static prototypes stay unchanged; this increment provides the backend API and executable supervisor.

## Acceptance
1. State survives a real database close/reopen and an independent child-process run.
2. Customer A cannot read or mutate customer B's workspace, even when local workspace IDs match.
3. A mutation retry does not duplicate intake; conflicting reuse of its key is rejected.
4. Two connections cannot claim the same active job; expired or paused leases cannot commit.
5. Work after downtime completes without opening the application UI; repeating a sweep creates no duplicate inbox row.
6. Snapshot, inbox, version and schedule changes are one transaction; a corrupted snapshot leaves no partial notifications.
7. Failures back off and quarantine after three attempts, do not expose raw errors, and do not stop unrelated workspaces.
8. Completion/archive suppresses obsolete internal notifications. Time advances from the trusted runtime clock, not customer input.
9. Loopback-only HTTP enforces credentials, body/route limits, strict fields, and rejects browser-origin requests. API errors are sanitized.
10. Batch acceptance provisions 100 synthetic workspaces from the existing recipes and runs their real persisted workflows through restart and repeated sweeps.

## Bounds and non-goals
Default worker interval: 60 seconds; up to 25 workspaces per sweep; lease 30 seconds. Retry at 60 seconds and 120 seconds, then quarantine. Maximum 1,000 total workspaces and 1,000 retained command receipts per workspace. Existing kernel record/history limits remain in force. No historical reminder flood: one current action after catch-up. No external side effects or exactly-once external-delivery claims.

Only use an operator-private local directory; reject symbolic-link state directories/files and unsupported database schema versions. SQLite is not encrypted at rest. Single-host durable storage, not a distributed cloud service, backup service, high-availability database or production certification. Hosted deployment, billing, secure binary uploads, live messaging, marketing, new commercial product numbers and spending remain disabled. Do not change account automations, prices, wallets or existing release gates.
