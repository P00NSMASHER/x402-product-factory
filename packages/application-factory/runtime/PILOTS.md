# Private self-service evaluations

An operator issues private codes; each code automatically activates **one isolated, persisted workspace** in its assigned application edition. This connects local pilot previews to a usable evaluation without manually provisioning every participant's tenant. It is invitation-only, loopback-only, and **synthetic-data-only**—not public signup or a sales system.

## Run

Requires the existing Node 22.13+ local runtime. Use a private absolute state directory outside the source/application package. Issue a bounded batch into a NEW private JSON file inside that directory:

```sh
node scripts/application-pilots.js issue --state-dir /absolute/private/state --recipe-id supplier-desk --count 3 --output /absolute/private/state/invitations.json
node scripts/run-application-runtime.js serve --state-dir /absolute/private/state --port 8789
```

In the running loopback service, open `/app/pilots/supplier-desk`. Its private evaluation link opens the existing app's invitation form. Enter an issued code and acknowledge synthetic data plus local evaluation measurements. The code resumes the same trial after browser or service restart; it is never put in a URL, browser storage or response body. Keep the private code file out of Git, logs and published packages. This implementation does not send it to anyone.

Default invitation activation deadline: seven days after issuance. Default evaluation access: seven days from activation. `--invite-days` permits 1–28 days and `--duration-days` 1–14. At most 100 invitations per runtime database are retained, including expired/revoked grants; the CLI `--count` is bounded by that total. No pruning, self-renewal, payment or trial upgrade is automatic.

```sh
node scripts/application-pilots.js report --state-dir /absolute/private/state
node scripts/application-pilots.js revoke --state-dir /absolute/private/state --invite-id <non-secret-invitation-id>
```

The report contains per-recipe synthetic operational counts, not raw invitation codes, tenant identifiers, buyer names, emails, user-entered record text or source documents. It remains local and is not sent to third-party analytics.

## Guarantees tested

Invitation activation inserts the tenant, selected workspace and activation event in **one SQLite transaction**. Re-entering the same code resumes the original tenant. The raw code and derived application credential are not stored in plaintext; only hashes are persisted. Expiry/revocation is checked on credential-backed reads, writes, browser sessions and worker commit, not merely by hiding a UI button. Archived/expired records are not deleted automatically. Existing operator accounts keep their original behavior.

The runtime lazily migrates v1 to v2 at first invitation issuance; existing v1 state remains v1 when this feature is unused. A selected pilot cannot provision extra workspaces or select a different recipe. A clock earlier than activation cannot authorize the trial. Recovery accepts v1 and v2; restoring v2 permanently disables both activated and unused invitation grants while retaining saved work and observation history. Reissuing an operator credential does not re-enable an old trial; review restored data and issue a new explicitly authorized evaluation instead. Never reopen an old code just to restore access.

## What the measurements mean

Only newly committed `add`/`receive`/`archive` commands produce active-day observations. Duplicate request receipts return their original result without adding events. The first intake per record, first received metadata per requirement, and first complete checklist per record are counted once. `firstOutcomeMs` measures time from activation to first completed checklist. A receipt is not file authenticity or successful customer delivery.

Every report carries `mode: synthetic-evaluation-only`, `qualifiesAsDemandEvidence: false`, `realCustomers: null`, `collectedRevenue: null` and `releaseApproved: false`. This is deliberately separate from the Growth Lab's operator-attested buyer/payment evidence. **Six synthetic browser trials are not six prospects, customers or sales.** Operator-controlled clocks/state are not independently certified analytics.

## Boundaries

No hosted installation, public HTTPS identity, email verification, MFA, live invitations, telemetry provider, checkout, charge, real customer document use or commercial release. Existing evidence-upload and recovery limitations still apply. The consent checkbox cannot technically identify whether a user types real information: do not use real customer data. Invitation codes act as bearer secrets during their valid period; anyone with the code can resume that trial. Use this only in the existing trusted local-development environment. Independent security/privacy review, real buyer validation and explicit release approval remain pending.

The CLI does not overwrite code files. If issuance fails after partially generating a batch, issued grants are revoked and the incomplete output removed; those revoked grants still consume the bounded issuance quota. Runtime state and observations survive service restart; in-memory browser sessions do not. No operating-system or account schedule is installed.

Technical foundations: SQLite explicit transactions (`https://www.sqlite.org/lang_transaction.html`) and Node's built-in `node:crypto` / `node:sqlite`. The cryptographic primitives do not establish production security approval or buyer demand.
