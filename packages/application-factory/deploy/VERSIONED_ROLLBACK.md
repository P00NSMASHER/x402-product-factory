# Distinct-version deployment rehearsal (not public)

The factory manufactures three additional real local application versions, changing substantive workflow parameters while retaining the same application identity: document default due window, quote expiration window, and inventory review window. These are **independently accepted** with their own source hashes and tenant-isolation/SQLite/HTTP lifecycle proof.

A bounded local subprocess boots the original verified package and its behaviorally different verified candidate from independent private SQLite paths, routes health/browser requests to baseline and candidate, deliberately closes candidate, and checks the routing layer falls back to the original version. With *both* versions stopped, HTTP must return **503**, not a fake success. The original restarts against its retained private test database. Identity, source-file integrity, acceptance receipts, no-production-release flags, Host and Origin isolation, and clear rollback state are enforced.

### Rehearsal

```sh
node scripts/rehearse-versioned-rollout.js --document /absolute/private/assembled-docs --quote /absolute/private/assembled-quotes --inventory /absolute/private/assembled-inventory --output /absolute/private/versioned-rehearsal
```

The output is a source-hashed private JSON proof plus an explicit release HOLD. CI runs this after primary manufacturing and retains it for seven days. **This proves only local cross-version routing fallback, not production rollback.** The versions use separate synthetic SQLite state. There is no live customer-state migration, version compatibility guarantee, hosted TLS, public endpoint, shared database cutover, external traffic switch, restore of actual production backups or independently reviewed commercial/security release. Existing x402 paid routes and the six-hour task schedule are unchanged.

## Persisted synthetic state upgrade barrier

A second clean subprocess pins a SQLite WAL reader before writing, seeds actual private state for two synthetic tenants, and commits document/quote/inventory activity plus an idempotency receipt. Before copying state, it verifies a valid nonempty WAL with a committed frame and confirms that **the bare main database file does not contain that receipt**, although the WAL-aware source does. It then uses SQLite `VACUUM INTO` to copy the committed state and independently verifies the receipt survived in the snapshot before trying an alternate package version. It verifies unchanged business-table digests, tenant separation, old-version recovery, and fail-closed behavior for unknown schema versions and foreign SQLite application IDs. Results intentionally **do not authorize migration**: the document runtime can read the old workspace but remains bound to its old recipe, quote receipts can be replayed under the candidate validity window in this bounded test, and inventory explicitly rejects modified recipe state. Neither a safe shared-state migration plan nor full future/production compatibility has been established. Rehearsal reports list the family-specific result rather than silently claiming a safe upgrade.
