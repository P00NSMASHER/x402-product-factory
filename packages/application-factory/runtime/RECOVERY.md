# Automatically verified encrypted recovery — local candidate

The existing applications can now maintain encrypted recovery points without an open browser. This is a **local-development, opt-in feature**, not an installed cloud service, off-site backup, or approval for real customers.

## Capture and verification

The runtime and optional evidence vault are captured as one bundle. A coordinating `BEGIN IMMEDIATE` transaction reserves writes on both sources; separate read connections execute SQLite `VACUUM INTO`, including committed WAL content. The snapshot operation is synchronous and bounded; it may briefly delay the local API. It never copies only the main database while ignoring its journal.

The bundle encrypts both database bytes and their metadata using AES-256-GCM and a fresh nonce. Backup encryption requires a separate operator-provided 32-byte key. No key or plaintext login credential is included. The existing vault key is also required whenever a vault exists, to verify every encrypted attachment.

Before a recovery point is published, verification decrypts the written bundle into a private temporary directory, checks database IDs/v1 columns/integrity/foreign keys, validates each workspace with the existing workflow kernel, verifies evidence references, and decrypts every attachment to compare its length and checksum. Publication uses an exclusive hard link and filesystem synchronization. Incomplete staging areas are not treated as recovery points.

Defaults: capture on first start, then every **six hours** while `serve` runs; retain **seven authenticated snapshots** for that source. After restart the supervisor verifies the latest saved snapshot and resumes its cadence. Failures produce sanitized status events and back off from one minute to at most one hour. A corrupt newest snapshot on startup is an error, not permission to silently call an older snapshot current. Corrupt, unrelated, and unrecognized files are never pruned automatically.

Maximum supported size: **32 MiB per database**, **96 MiB per encrypted envelope**, and at most 100 matching recovery files before manual storage maintenance. These are protective bounds, not measured production scale. Runtime metadata remains plaintext in the live database and in private temporary verification directories; the final recovery bundle is encrypted. Abnormal process termination can leave private staging directories for operator cleanup.

## Operator configuration

Supply private environment values `FACTORY_BACKUP_KEY_HEX` (64 hexadecimal characters) and `FACTORY_BACKUP_DIR` (an absolute private path outside the live state tree and repository). Preserve `FACTORY_VAULT_KEY_HEX` if document storage is used. Start the existing `scripts/run-application-runtime.js serve` command normally. Without either backup setting, no backup supervisor is started; partial configuration is rejected. The startup `automaticRecoveryConfigured` flag indicates configuration only, not successful verification. Subsequent `recovery-status` records expose actual verification/error state and capture age without keys or tenant contents.

Manual commands, using the same private key environment:

```sh
node scripts/application-recovery.js capture --state-dir /private/live --backup-dir /private/recovery
node scripts/application-recovery.js verify --file /private/recovery/SELECTED-BUNDLE.fbr
node scripts/application-recovery.js restore --file /private/recovery/SELECTED-BUNDLE.fbr --destination /private/new-restored-state
node scripts/application-recovery.js reissue --state-dir /private/new-restored-state --tenant EXISTING-TENANT --credential-file /private/NEW-KEY-FILE.json
```

Paths and names above are placeholders, not configured services. Keep keys in private operator key management, never Git or public logs. There is no automated key escrow/rotation; losing either necessary key can make a recovery point unusable. Copies on the same disk do not protect against losing that disk; independently managed off-host replication is still required for disaster protection.

## Non-destructive recovery

Restore is explicit and **refuses every existing destination**, including an empty directory. It verifies the bundle first, stages and validates both databases, and publishes a new state directory. All restored tenant credential digests are randomized, every worker lease is cleared, and all workspace automation is paused. This prevents old revoked credentials or stale jobs from returning after rollback. Browser sessions are never backed up. Reissue fresh keys to existing active tenants, review the restored state, and explicitly resume workspaces. A revoked tenant remains revoked. Reissue does not automatically resume automation.

The original live databases are never replaced or modified by restore. Recovery is not zero-loss: changes after the selected snapshot are absent. There is no independent anti-rollback witness, signed publication history, multi-host coordination, managed backup service, or production security certification. Directory and file privacy are verified on POSIX; Windows ACL validation remains outside this candidate. A malicious process running as the same OS user is not isolated by this design.

## Evidence and references

`node --test packages/application-factory/runtime/recovery.test.js` covers 26 contracts, including paired WAL state, encryption/key failures, corruption and orphans, schema/lock limits, restore safety, scoped retention, restart-aware scheduling, timers and child-process operator commands. `recovery-runtime.test.js` additionally tests all three actual editions, attachment recovery, credential invalidation, no duplicate notifications after resume, and automatic capture by the real `serve` process. Full exact-head repository CI and inherited browser acceptance remain required.

Primary technical references: SQLite VACUUM INTO https://www.sqlite.org/lang_vacuum.html ; SQLite transactions https://www.sqlite.org/lang_transaction.html ; Node 22.16 crypto https://nodejs.org/download/release/v22.16.0/docs/api/crypto.html .

**Draft, unmerged, undeployed.** No customer data, spending, payment changes, public messaging, product-number unlock, account schedule modification, or commercial launch. Independent security, retention, key-management and hosting review remain outstanding.
