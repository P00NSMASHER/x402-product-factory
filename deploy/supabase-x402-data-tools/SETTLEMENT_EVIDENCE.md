# Supabase x402 settlement evidence contract

This document applies to the read-only structured event emitted by
`deploy/supabase-x402-data-tools/index.ts` **only after** a successful
facilitator `/settle` response. The event is observability evidence, not a
verified payment ledger or a revenue counter.

## Event v2

| Field | Meaning |
| --- | --- |
| `event` | `x402_settlement_succeeded` (facilitator-reported success) |
| `schema_version` | `2` |
| `product_id`, `route` | Canonical route attribution from the seller route |
| `listed_price_usdc` | Configured price; **not confirmed on-chain funds received** |
| `expected_amount_atomic_usdc` | Expected atomic USDC amount; **not measured received amount** |
| `network` | `eip155:8453` only if the facilitator receipt matches; otherwise null |
| `transaction` | Lowercase, syntactically valid EVM transaction hash, if supplied; otherwise null |
| `payer` | Lowercase, syntactically valid payer address, if supplied; otherwise null |
| `evidence_source` | `facilitator_settle_response` |
| `onchain_verified` | Always false in this event |
| `external_buyer_verified` | Always false in this event |
| `eligible_for_revenue_scoreboard` | Always false in this event |
| `settled_at` | Application observation timestamp; **not on-chain block time** |

The `transaction` and `payer` fields are parsed from the facilitator's
settlement receipt, not decoded from client-supplied payment authorization.
Only fields needed for route and transaction attribution are retained.
Do **not** log signed payloads, payment headers, input queries, secrets,
full upstream API responses, or customer identity details. Handle wallet
addresses as pseudonymous user data with appropriate access/retention rules.

Logging is best effort: successful payment and receipt delivery must not
fail because an observability service is unavailable. Failed verification,
source work, and terminal or unresolved settlements must not generate a
success event. Deterministic tests cover these cases without real payments.

## Required evidence before counting a real sale

Downstream reports must default to **zero newly verified external revenue**
until independently corroborated observations exist. Before upgrading an
event from observation to verified settlement:

1. Resolve the transaction hash on Base mainnet (`eip155:8453`) through an
   independent RPC/indexer and confirm the transaction succeeded. Missing
   or malformed `transaction` or mismatched receipt `network` is an
   unresolved record, not a countable settlement.
2. Independently inspect the USDC token transfer from the confirmed
   transaction receipt, checking token contract
   `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, receiver
   `0x708f7b52b56eafd7fc1de65fc7752ed732914021`, amount, and the
   attributed payer. Do not infer an actual amount from
   `listed_price_usdc` or `expected_amount_atomic_usdc`.
3. Deduplicate using the verified network and transfer identity/transaction
   reference. Multiple application logs or retries are not multiple
   sales. Ambiguous multi-transfer transactions require manual review,
   not automatic duplicate counting.
4. Establish **independent external-buyer provenance** and exclude
   operator-controlled wallets, developer/test transactions, synthetic
   payments, marketplace crawler checks, and manufactured demand. Distinct
   wallets are not automatically distinct genuine people or organizations.
5. Record a dated, auditable reconciliation decision and the underlying
   evidence before reflecting it in revenue, unique buyers, repeat-buyer
   counts, Agent402 targets, or the Product 025+ demand-unlock rule.

A facilitator `success:true` response is a valid application-level
signal; it is **not** independent proof of receipt, external ownership,
final amount, or net unit economics. Even a verified on-chain transfer is
not sufficient by itself to classify a buyer as external.

Do not overwrite or edit raw observation records to mark them verified.
A separate reconciliation ledger should reference the original event
and immutable transaction evidence, with explicit verification status,
reviewer/provenance, amount, currency, and exclusion reason. No reconciliation ledger or live reconciliation service has been deployed as part of this PR. A separate, read-only CLI verifier is available for operator-supplied observations, but it cannot certify outside buyers or automatically count sales.

## Operational scope

- No customer charges, purchases, refunds, or automatic reconciliation.
- No changes to facilitator selection, receiver wallet, Base USDC rail,
  prices, route dispatch, or product decision logic.
- No automatic revenue or buyer claims based on raw logs.
- Read-only test: `node --test deploy/supabase-x402-data-tools/settlement-telemetry.test.js`.

References: [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md);
[PayAI facilitator developer reference](https://payai.network/developers).

## Read-only Base transaction check (operator run only)

The optional `reconcile-settlements.js` command reads a **local JSON array** of
the sanitized v2 settlement events. It uses the operator's separately chosen
Base HTTPS JSON-RPC endpoint only for `eth_chainId`, `eth_blockNumber`,
`eth_getTransactionReceipt`, and `eth_getBlockByNumber`. It never signs or broadcasts a transaction.

```bash
BASE_RPC_URL='https://YOUR_TRUSTED_BASE_RPC_ENDPOINT' \
  node deploy/supabase-x402-data-tools/reconcile-settlements.js \
  path/to/private-settlement-observations.json \
  > private-reconciliation-results.json
```

Do not commit actual receipt logs or wallet lists to GitHub. Keep the input and
output files outside the repository and protect them as pseudonymous customer
information. The endpoint URL may contain a provider token; keep it in the
environment, never in source or logs.

Validation is intentionally conservative: canonical Supabase route and price,
exact reported network, expected amount, a non-null transaction and payer,
RPC chain ID 8453, a successful receipt, at least 12 observed block
confirmations, a canonical block-by-number lookup whose hash matches the
receipt block hash, and exactly one matching USDC `Transfer` log with the correct
payer, canonical receiver and 5,000 atomic USDC. Duplicates **within the input
batch** are rejected. Missing receipts, provider errors, invalid RPC evidence,
insufficient confirmations, conflicting transfers and mismatched amounts
remain unverified. Every apparent Base USDC transfer from the supplied payer
to the canonical receiver is counted **before** individual log validation:
two such candidates remain ambiguous even when one is malformed, and a
single malformed candidate cannot be promoted to evidence. Oversized
receipt log arrays (more than 2,500 entries) fail closed rather than
consuming unbounded reconciliation work.

This is independent RPC **corroboration**, not a cryptographic light-client
proof; data authenticity depends on the chosen RPC provider. Batch
deduplication is not a persistent global payment ledger. The report always
returns `external_buyer_verified=false` and
`eligible_for_revenue_scoreboard=false` even when a transfer matches.
A human-reviewed, persistent cross-batch ledger, independent buyer provenance,
and operator-wallet exclusions are still necessary before booking revenue
or satisfying demand-unlock thresholds.

No live chain verification is executed by CI. Tests use deterministic mocked
RPC receipts. This tool does not change the deployed Supabase Edge Function,
live wallet, payment facilitator, pricing or authorized spending.


## Private append-only settlement evidence ledger

The optional `settlement-ledger.js` can reconcile a batch and persist
**independently RPC-corroborated Base USDC transfer evidence** to an operator-
controlled local JSONL journal. It is not part of the deployed Supabase
Edge Function and must not be run automatically against production
transactions without a separately reviewed operational procedure.

Create a private directory **outside the checkout** on a trusted local system:

```bash
mkdir -m 700 -p "$HOME/.private-x402-settlements"
BASE_RPC_URL='https://YOUR_TRUSTED_BASE_RPC' \
  node deploy/supabase-x402-data-tools/settlement-ledger.js \
  "$HOME/.private-x402-settlements/observations.json" \
  "$HOME/.private-x402-settlements/journal.jsonl"
```

The observations argument must be an absolute path to a local JSON array of
v2 `x402_settlement_succeeded` events, **not** a previously generated
reconciliation report. The operator ledger CLI requires this input file
to reside outside the checkout, inside a genuine (non-symlink) owner-only
(0700) directory, with owner-only file permissions (0600) and one hardlink.
The input may contain at most 250 events and 1 MB of JSON. Use a restrictive
`umask 077` when preparing the file and verify its permissions before use.
A symlinked, public-readable, hard-linked, malformed or oversized input
is rejected *before* an RPC call or journal modification.

The ledger path must also be absolute, outside the repository, in a real
(non-symlink) owner-only (0700) directory; an existing ledger must be
owner-only (0600).

The tool recalculates the chain evidence from scratch using a trusted HTTPS
JSON-RPC endpoint, validates canonical Supabase route, payer, exact price,
token, receiver, confirmed transfer amount, 12+ confirmations, and a single
unambiguous matching transfer. New journal records use schema version 2 and
preserve the corroborated canonical block hash alongside the transaction.
It writes only minimal evidence fields.
It **never** persists signed payment data, source query strings, or user-supplied
"verified" claims.

For an **offline integrity check** that requires no RPC access, payment
authorization, or input event file, run:

```bash
node deploy/supabase-x402-data-tools/settlement-ledger.js \
  --audit "$HOME/.private-x402-settlements/journal.jsonl"
```

The audit reports the record count and final hash without printing payer
addresses; missing or noncanonical files fail rather than reporting a
misleading empty ledger. Store the final hash and record count **outside**
the writable journal, in a separately controlled audit record. A hash
retrieved from the same potentially compromised journal is not independent.

For **rollback-aware verification**, supply the previously preserved,
trusted checkpoint values verbatim (the shown hash is illustrative only):

```bash
node deploy/supabase-x402-data-tools/settlement-ledger.js \
  --audit "$HOME/.private-x402-settlements/journal.jsonl" \
  --expect-head YOUR_PREVIOUSLY_PRESERVED_64_LOWERCASE_HEX_HASH \
  --expect-records 12
```

Both the journal head and exact count must match. Missing, rewritten,
rolled-back or truncated histories fail closed. The CLI prints
`checkpoint_verified=true` only for a match to the **caller-supplied**
checkpoint; it does not prove that checkpoint originated from an external
trusted witness.

To require the same gate **before an append**, add
`--expect-head HASH --expect-records COUNT` after the normal two file
arguments:

```bash
BASE_RPC_URL='https://YOUR_TRUSTED_BASE_RPC' \
  node deploy/supabase-x402-data-tools/settlement-ledger.js \
  "$HOME/.private-x402-settlements/observations.json" \
  "$HOME/.private-x402-settlements/journal.jsonl" \
  --expect-head YOUR_PRIOR_TRUSTED_HEAD \
  --expect-records 12
```

Before any RPC request, the command briefly acquires its exclusive
writer lock and verifies that the prior journal is readable, non-legacy,
internally consistent, and, when specified, matches the externally pinned
checkpoint. It releases the lock during RPC reads, then locks again and
**rejects any intervening change to the journal head or record count**.
A stale checkpoint, another active writer, incomplete record or corrupted
prior journal is rejected before external RPC calls. A concurrent append
during RPC is also rejected without rewriting the other writer's entries.

Capture and externally preserve the resulting
`head_hash` and updated record count before the next append. For a new
journal, the checkpoint is 64 lowercase zero characters (genesis) and
count 0. If the append succeeds but the external checkpoint update fails,
investigate and preserve the existing journal: do not silently rewind,
force the previous checkpoint, or reset the ledger. Optionally add the same
four checkpoint arguments to `--audit-chain` to gate RPC rechecks.

This is an optional high-assurance mode; runs omitting a checkpoint still
verify the internal chain but report `checkpoint_verified=false` (or
`prior_checkpoint_verified=false` for writes) and cannot detect a
self-consistent full-journal rewrite. Never embed the expected head in the
same mutable JSONL file.

For a **later read-only canonical-chain recheck** of previously saved V2
records (no journal writes and no new payment attempts), run:

```bash
BASE_RPC_URL='https://YOUR_TRUSTED_BASE_RPC' \
  node deploy/supabase-x402-data-tools/settlement-ledger.js \
  --audit-chain "$HOME/.private-x402-settlements/journal.jsonl"
```

The chain recheck validates chain ID, current height, at least 12
confirmations, and the saved block hash against the provider's canonical
block at the recorded height. A mismatch, unavailable block, or insufficient
confirmations prevents an all-canonical result. It does **not** prove payer
independence, verify a customer's real-world identity, or establish finality
outside the chosen RPC provider's trust boundary.

**Backward compatibility:** Legacy V1 journal records without a saved
canonical block hash remain independently readable and hash-chain auditable,
but they are classified as `legacy_records_requiring_review`. Do not
automatically upgrade them or append new V2 records to any journal containing
V1 rows. Preserve original bytes and trusted head checkpoints; use a
separately reviewed migration/reconciliation process instead.

The journal uses exclusive `.lock` acquisition, 0600 file creation,
append-and-fsync writes, a strictly validated sequential SHA-256 hash chain,
and **transaction-level deduplication across all prior batches in that
journal**. A corrupted, truncated, non-private, conflicting, or locked
journal fails closed. The append path also preserves the exact audited
file identity (device/inode) and journal-content SHA-256 across its read-only
RPC phase, reopens the existing ledger without following symlinks, checks
that the *opened file descriptor* still matches the audited bytes, and
replays the resulting hash chain after fsync. A journal appearing at genesis,
being replaced with identical bytes, or receiving an in-place same-size
mutation between checks is rejected instead of silently adopted. This
protects against specific path-swap and accidental uncoordinated-writer
races; it is **not** a guarantee against an adversary with unrestricted
filesystem access. Never treat this as a replacement for ownership,
externally preserved checkpoints, or backup/restore controls.

If a process dies while holding the lock, do not automatically delete the
lock or truncate data: investigate and preserve original bytes before
manual recovery. Records are immutable; corrections must be separately
documented, never silently overwritten.

**Trust boundaries:** The hash chain can detect local corruption but is
**not tamper-proof against a party capable of rewriting the entire journal**.
Store an external, read-only copy of the journal's latest hash and maintain
secure encrypted backups. JSON-RPC verification relies on the provider's
honesty and chain availability; 12 confirmations are not absolute finality.
A journal is local to one operator: it does not prevent collisions across
other devices, copied ledgers, or alternate operator environments. The ledger
does not establish buyer identity or outside ownership, and it intentionally
reports zero verified external buyers and zero eligible revenue regardless
of transfer count. Before commercial revenue recognition, add a separately
reviewed, protected, globally unique provenance ledger and cross-check
genuine buyer classification with independent evidence.

CI only uses deterministic mock RPC fixtures and private temporary
directories; it creates no wallet transactions, customer records, database
tables, or live production writes. Run the tests with:

```bash
node --test deploy/supabase-x402-data-tools/settlement-telemetry.test.js \
  deploy/supabase-x402-data-tools/reconcile-settlements.test.js \
  deploy/supabase-x402-data-tools/settlement-ledger.test.js \
  deploy/supabase-x402-data-tools/buyer-review-queue.test.js
```


## Offline buyer-review queue (no revenue recognition)

The optional `buyer-review-queue.js` reads **only** the operator's existing
private, hash-chain-verified settlement journal. It groups transfer evidence
by payer wallet to help an operator identify wallets that require follow-up,
without asserting wallet ownership or upgrading payment evidence to a sale.

It does **not** connect to GitHub, Supabase, CRM systems, wallets, or a
public data service; it makes **zero RPC calls**. It never books revenue,
changes the journal, approves an external buyer, or unlocks Product 025+.

Prepare a stable, random 32-byte HMAC key **outside the repository**. Set it
as exactly 64 hexadecimal characters in `X402_REVIEW_HMAC_KEY` using an
operator-controlled secret manager. Never write this key to the journal,
an exclusion file, GitHub Actions, a public source tree, or shared logs.
Changing or losing the key changes case identifiers and prevents stable
comparison across reports.

Example invocation (replace placeholders with trusted private values):

```bash
umask 077
X402_REVIEW_HMAC_KEY="$YOUR_PRIVATE_64_HEX_KEY" \
  node deploy/supabase-x402-data-tools/buyer-review-queue.js \
  "$HOME/.private-x402-settlements/journal.jsonl" \
  > "$HOME/.private-x402-settlements/buyer-review.json"
```

To mark wallet *exclusions* for operator-controlled, test/synthetic, or
marketplace-probe wallets, prepare an optional **private** JSON file in an
owner-only (0700) directory with 0600 permissions:

```json
{
  "schema_version": 1,
  "excluded_wallets": [
    {
      "address": "0xREPLACE_WITH_YOUR_ACTUAL_40_HEX_CHARACTER_ADDRESS",
      "reason": "operator_controlled",
      "evidence_reference": "private-operator-wallet-inventory-20261010"
    }
  ]
}
```

The example address is intentionally a placeholder, not a usable address.
Valid `reason` values are `operator_controlled`, `test_or_synthetic`, and
`marketplace_probe`. An evidence reference is required for each exclusion,
but the tool does **not** independently verify it; exclusion classifications
are visibly labeled **operator-declared** and can only reduce the review
queue, never make a wallet eligible for revenue.

Pass the exclusion file as the second positional argument. Optionally
require exact previously preserved journal head/count using
`--expect-head HASH --expect-records COUNT` at the end, as in the journal
audit. Keep the checkpoint in a separately controlled location.

**Output safety:** Each wallet receives a deterministic, keyed HMAC-SHA256
case ID and local journal sequence references. The report does not contain
raw wallet addresses, transaction hashes, private exclusion evidence
references, HMAC keys, or source queries. It reports possible wallet reuse
as a **repeat-wallet signal**, not a repeat customer. Distinct wallets are
**not** unique people, organizations, or verified independent buyers.

The report also contains a `route_evidence` section covering all five
canonical Supabase seller routes, including those with zero recorded
transfers. Per-route counters report historical transfer evidence,
distinct payer wallets (not buyers), repeat-wallet signals on that route,
and operator-declared excluded activity. Route totals must reconcile
exactly with the private journal record count. This helps prioritize
which **existing** x402 tools merit manual demand research; it does not
establish transactions as paid API purchases or genuine customer demand.

Every report explicitly sets:

- `independently_verified_external_buyers: 0`
- `eligible_external_revenue_atomic_usdc: "0"`
- `product_025_unlock_evidence: false`
- `current_chain_reverified: false`

The last flag is important: the queue replays stored evidence but does not
recheck the current chain. Run the separate read-only `--audit-chain` before
relying on chain history for manual review. Independently corroborate buyer
identity, economic independence, transaction-to-service attribution, refunds
or reversal risk, test-wallet exclusions, and demand provenance through a
separately reviewed procedure. Until then, this is **triage**, not a sales
ledger, customer count, or evidence satisfying a growth-unlock target.

Treat queue files and stable HMAC identifiers as potentially identifying
pseudonymous data; keep them private and remove them according to your
retention policy. No actual customer observations are shipped with the
repository or used in CI.


## Offline multi-journal reconciliation (not a sales ledger)

**Why:** The append-only ledger already detects duplicate transactions across
batches on the *same* device. It does not know whether another operator has
recorded the same transaction in a separate journal. The optional
**cross-journal-audit.js** compares **2–12 private V2 journals** offline and
detects repeated transaction references across those journals. It flags
conflicting payer, route, receipt-log or canonical block evidence for manual
review rather than silently choosing an attribution.

Each source journal must first pass its existing strict hash-chain validation
and match **both** the externally preserved head hash and exact record count.
Legacy V1 records, a stale checkpoint, extra or missing manifest fields,
duplicated file paths, unsafe permissions and malformed journals fail closed.
Journals are read again after the comparison to catch changes during the
multi-file scan. This is a point-in-time read; it is not a global shared
database, live RPC recheck, concurrency lock across machines, or guarantee
against malicious filesystem administrators.

Prepare an operator-only (0700) directory **outside this checkout**, with
actual journals and a 0600 manifest file. Do **not** store this manifest or
real customer evidence in GitHub:

```json
{
  "schema_version": 1,
  "journals": [
    {
      "journal_path": "/ABSOLUTE/PRIVATE/operator-one.jsonl",
      "expected_head": "REPLACE_WITH_PREVIOUSLY_PRESERVED_64_LOWERCASE_HEX_HEAD",
      "expected_records": 12
    },
    {
      "journal_path": "/ABSOLUTE/PRIVATE/operator-two.jsonl",
      "expected_head": "REPLACE_WITH_PREVIOUSLY_PRESERVED_64_LOWERCASE_HEX_HEAD",
      "expected_records": 8
    }
  ]
}
```


Replace all placeholders and counts with genuine trusted checkpoint evidence.
Use a single stable, private 32-byte HMAC key in a secret manager (the same
X402_REVIEW_HMAC_KEY used by the buyer-review queue is supported):

```bash
umask 077
X402_REVIEW_HMAC_KEY="$YOUR_PRIVATE_64_HEX_KEY" \
  node deploy/supabase-x402-data-tools/cross-journal-audit.js \
  "$HOME/.private-x402-settlements/cross-journal-manifest.json" \
  > "$HOME/.private-x402-settlements/cross-journal-report.json"
```

**Optional negative-only wallet exclusions:** Supply the *same private 0600*
exclusion JSON format described under "Offline buyer-review queue" as a second
argument (after the manifest). This applies operator-controlled, test/synthetic,
or marketplace-probe exclusions consistently across all supplied journals:

```bash
umask 077
X402_REVIEW_HMAC_KEY="$YOUR_PRIVATE_64_HEX_KEY" \
  node deploy/supabase-x402-data-tools/cross-journal-audit.js \
  "$HOME/.private-x402-settlements/cross-journal-manifest.json" \
  "$HOME/.private-x402-settlements/operator-wallet-exclusions.json" \
  > "$HOME/.private-x402-settlements/cross-journal-report.json"
```

The tool reuses the existing strict exclusion validation, including required
private evidence references, but those references remain operator assertions;
they are not proof of independent wallet ownership. Exclusions can only mark
evidence non-external and decrease review candidates. Unknown exclusion wallets
are permitted but do not create buyer activity. An invalid or unsafe exclusion
file fails closed without emitting wallet identities.


**Output contract:** The report includes total journal evidence rows, unique
transaction references, cross-journal duplicate references, overlapping
pseudonymous case IDs, conflicting cases, and non-conflicting per-route
**transfer-evidence** counts. The new `global_wallet_review` section groups
only **unique, uncontested transaction evidence** by payer wallet across all
supplied journals. Multiple journals containing one transaction count once,
not as repeated buyer activity. Conflicted transactions are quarantined from
*all* wallet and route review totals, irrespective of which payer was recorded.
A separate `conflicting_transactions_quarantined` total keeps them visible.

The wallet cases contain stable, keyed HMAC IDs compatible with the existing
single-journal buyer queue, distinct-wallet counts (not customer counts),
cross-route and cross-journal signals, repeat-wallet signals based on different
unique transactions, and operator-declared exclusions. Per-route review counts
also include excluded evidence and wallets still awaiting independent review.
Transaction case IDs use a separate HMAC namespace. Neither case IDs disclose
raw transaction hashes or payer addresses when the private HMAC key remains
secret. Journal indices refer only to manifest ordering; no raw addresses,
transaction hashes, exclusion evidence references, source file paths or HMAC
keys appear in output. Protect the output anyway because stable pseudonyms,
routes, dates and activity metadata remain potentially sensitive.

All cross-journal uniqueness and wallet-review findings are **limited to the
complete set of journals actually supplied**. Missing or unenumerated journals
cannot be checked by this tool; this is not an automatic global buyer registry.

**Revenue remains locked at zero.** All reports set
independently_verified_external_buyers to 0,
eligible_external_revenue_atomic_usdc to "0",
current_chain_reverified to false, and
product_025_unlock_evidence to false. A duplicate-free set of past RPC
receipts does **not** prove independent buyers, actual paid API usage,
unrefunded sales, customer identity, or current canonical-chain status.
Run the separate --audit-chain and human provenance review before any
commercial interpretation. If a journal was omitted, no cross-journal
uniqueness is claimed for that missing scope.

CI uses synthetic local journals and deterministic fixtures only; it makes
no external RPC call, payment, deployment, wallet change or revenue write.

```bash
node --test deploy/supabase-x402-data-tools/cross-journal-audit.test.js
```

## Private buyer-provenance evidence reference preflight

The optional **buyer-provenance-preflight.js** implements read-only, offline
evidence-reference intake for manual buyer provenance review. It DOES NOT open
the referenced evidence, authenticate an independent reviewer, resolve wallet
owners, check refunds, recheck Base, or declare actual external buyers or sales.
All supplied reference metadata is an *operator assertion*, not independent
proof. The tool sends no network requests and never modifies the seller.

It uses the existing checkpoint-verified cross-journal audit, deduplicates
transactions across the supplied private V2 ledgers, respects negative-only
wallet exclusions, and quarantines conflicts before producing review cases.
Its scope is limited to the journals actually supplied. A missing journal
cannot be accounted for by this audit.

### Step 1 — Generate the private review inventory

Store the journal manifest, optional exclusion file and results outside the
repository inside an owner-only (0700) directory. Source files must be regular,
non-symlinked, single-hardlink, owner-only 0600 files. Use the SAME stable,
secret 32-byte HMAC key used for the existing buyer-review tools.

```bash
umask 077
X402_REVIEW_HMAC_KEY="$YOUR_PRIVATE_64_HEX_KEY" \
  node deploy/supabase-x402-data-tools/buyer-provenance-preflight.js \
  --inventory \
  "$HOME/.private-x402-settlements/cross-journal-manifest.json" \
  "$HOME/.private-x402-settlements/operator-wallet-exclusions.json" \
  > "$HOME/.private-x402-settlements/provenance-inventory.json"
```


Omit the optional exclusion file if none exists. The inventory provides a
checkpoint-bound journal_scope_id, stable HMAC wallet case IDs, HMAC transaction
case IDs for unique uncontested transactions, and required evidence categories.
Excluded wallets are NOT given transaction case IDs. Keep this inventory
private: stable pseudonyms and activity metadata may still be identifying.

### Step 2 — Create a private JSON dossier (not a verification result)

Create a separate private 0600 JSON file with exactly:
- schema_version: 1
- journal_scope_id: the 64-character value from the inventory
- cases: an array of up to 500 case packets

Each case packet must contain exactly case_id, operator_reference,
reviewer_reference, and evidence. Use the wallet case_id from the inventory,
a distinct opaque operator reference, and a distinct opaque reviewer reference.
The tool checks different reference values but cannot verify actual human
independence. The evidence array may have up to 2,000 items per case, subject
to a 512-KiB total JSON size limit.

Each evidence entry has exactly type, subject_case_id, source_kind, and
private_reference. Each reference must be an opaque 8–128-character token
using letters, digits, periods, underscores and hyphens only. Store the actual
files securely elsewhere; never include names, contact details, private keys,
wallet credentials, full file paths, signed payment payloads or raw evidence
in this metadata file.

**Wallet-level categories** use the wallet's HMAC case ID as subject_case_id.

| type | required source_kind |
| --- | --- |
| buyer_independence | independent_third_party |
| wallet_control | independent_third_party |
| operator_inventory_screen | internal_control |
| independent_human_review | reviewer_attestation |

**Transaction-level categories** use the individual HMAC transaction case ID
as subject_case_id, repeated for each unique uncontested transaction.

| type | required source_kind |
| --- | --- |
| service_delivery | internal_service_log |
| chain_recheck | independent_chain_provider |
| refund_reversal_check | financial_reconciliation |

An illustrative, deliberately incomplete example follows. Replace every
placeholder with actual HMAC IDs from the private inventory.

```json
{
  "schema_version": 1,
  "journal_scope_id": "REPLACE_WITH_PRIVATE_INVENTORY_SCOPE_ID",
  "cases": [
    {
      "case_id": "REPLACE_WITH_PRIVATE_WALLET_CASE_ID",
      "operator_reference": "operator_record_0001",
      "reviewer_reference": "separate_reviewer_0001",
      "evidence": [
        {
          "type": "buyer_independence",
          "subject_case_id": "REPLACE_WITH_PRIVATE_WALLET_CASE_ID",
          "source_kind": "independent_third_party",
          "private_reference": "private_buyer_record_0001"
        },
        {
          "type": "service_delivery",
          "subject_case_id": "REPLACE_WITH_PRIVATE_TRANSACTION_CASE_ID",
          "source_kind": "internal_service_log",
          "private_reference": "private_service_log_0001"
        }
      ]
    }
  ]
}
```


A complete *reference catalog* needs every wallet-level category and all
three transaction categories for every unique uncontested transaction.
Missing references are listed as blockers. Unknown wallet case IDs, evidence
linked to another wallet's transaction, duplicate type/subject references,
unknown fields (including approval or revenue fields), stale checkpoint scopes
and dossiers for operator-excluded wallets all fail closed.

### Step 3 — Run the private preflight

```bash
umask 077
X402_REVIEW_HMAC_KEY="$YOUR_PRIVATE_64_HEX_KEY" \
  node deploy/supabase-x402-data-tools/buyer-provenance-preflight.js \
  "$HOME/.private-x402-settlements/cross-journal-manifest.json" \
  "$HOME/.private-x402-settlements/provenance-dossiers.json" \
  "$HOME/.private-x402-settlements/operator-wallet-exclusions.json" \
  > "$HOME/.private-x402-settlements/provenance-preflight-result.json"
```


Omit the optional exclusion-file argument if there are no exclusions.
Statuses are no_private_dossier_supplied, evidence_references_incomplete,
reference_catalog_complete_independent_validation_required, and
operator_declared_non_external. Missing evidence types are shown for each
pseudonymous wallet and transaction, with no private source references or
wallet addresses, raw transaction hashes, HMAC keys, names or paths.

**Critical trust boundary:** Even if every required category is present,
the tool has NOT independently checked whether any underlying evidence is
genuine, current, attributable, conflict-free or from an independent buyer.
Its output always sets independently_verified_external_buyers to 0,
eligible_external_revenue_atomic_usdc to "0", current_chain_reverified to
false, and product_025_unlock_evidence to false. Independently establish
wallet ownership, independence from the operator, payment-to-API-delivery
linkage, refund/reversal status, and current chain state in a separately
reviewed process before implementing any future commercial revenue gate.

CI uses only synthetic local journals, wallet pseudonyms and private reference
handles; it makes no real payments, deployments or production writes.

```bash
node --test deploy/supabase-x402-data-tools/buyer-provenance-preflight.test.js
```

## Offline signed service-response claim verification

The optional signed-delivery-audit.js checks whether an Ed25519-signed
**server response-stream completion claim** matches a transaction, payer,
and canonical route in checkpoint-verified settlement journals. It verifies
signatures under an explicitly pinned public key, rejects duplicate
transaction claims and reused request IDs, and quarantines conflicts
using the existing cross-journal evidence gate.

**Current production limitation (October 10, 2026):** The known Supabase
v6 handler calculates its result, settles payment, logs a
facilitator-reported settlement event, and then constructs an HTTP 200
response. It does **not** produce independently signed post-response
completion attestations. Settlement logs alone cannot establish that the
response stream completed, that the buyer received the data, or that
a legitimate outside buyer exists. Do not fabricate signed claims from
settlement logs or synthetic test fixtures.

For meaningful real-world evidence, an independently controlled and vetted
response-observability system must be implemented in a **separate reviewed
change**, observe a server response stream actually finish, and securely
sign that observation after linking it to the original transaction,
payer, route, request identifier and response digest. No production
logging or signing infrastructure is changed by this PR. Even a genuine
server-side completion observation does not prove client receipt.

### Input trust contract

A private signer metadata file contains exactly schema_version (1),
issuer_id and spki_der_base64, which is a canonical base64 encoding of the
issuer's DER-encoded Ed25519 SubjectPublicKeyInfo public key. The verifier
also requires the environment variable X402_DELIVERY_KEY_SHA256, containing
the lowercase 64-hex SHA-256 fingerprint of the SPKI DER **verified out of
band through an independently trusted channel**. Merely copying the
fingerprint from the same submitted key file does not establish issuer
trust. The tool checks cryptographic signatures, not actual operational
independence of the signing key holder.

A separate private JSON document contains schema_version (1), the exact
checkpoint-derived journal_scope_id obtained from the provenance inventory,
and an array of zero to 250 signed_claims entries. Each entry has exactly
claim and signature_base64 fields; signature_base64 is canonical base64 of
a 64-byte Ed25519 signature.

The claim contains exactly the following fields in canonical signing order:

| Field | Required content |
| --- | --- |
| schema_version | Integer 1 |
| issuer_id | Exact approved signer ID |
| network | eip155:8453 |
| transaction | Lowercase 0x-prefixed 64-hex Base transaction hash |
| payer | Lowercase 0x-prefixed 40-hex payer wallet address |
| route | One of the canonical Supabase x402 route paths |
| request_id | Lowercase 32-hex transport request ID |
| response_status | 200 |
| response_body_sha256 | Nonzero lowercase 64-hex response digest |
| response_stream_completed_at | Canonical ISO 8601 UTC with milliseconds |
| transport_observation | server_response_stream_completed |

Ed25519 signs the exact UTF-8 bytes consisting of the domain tag and
compact JSON of these canonical fields, using exactly one separating
newline:

```text
x402-service-response-claim:v1
<compact JSON of claim in canonical field order>
```

The domain tag is not a receipt or a claim that clients acknowledged a
response. The verifier rebuilds the canonical byte representation regardless
of input JSON key order; signing the outer JSON wrapper or payment
authorization will not pass this contract. The response SHA-256 digest is
covered by the signature, but the verifier does not independently compare
it with original bytes actually observed by the client. Completion time
is asserted by the signer, not independently authenticated.

### Private operator procedure

Keep the journal manifest, signed completion claims, public-key metadata and
optional operator exclusions in an owner-only 0700 directory **outside the
repository**, with regular owner-only 0600 files, each with one hardlink.
Symlinks, oversized inputs, and public-readable inputs are rejected. Raw
transaction hashes, payer addresses, source metadata and signatures belong
only in the private files. No payment secrets or signer private keys should
be stored in the verifier or source repository.

With a genuine externally approved key fingerprint, run:

```bash
umask 077
X402_REVIEW_HMAC_KEY="$YOUR_PRIVATE_64_HEX_HMAC_KEY" \
X402_DELIVERY_KEY_SHA256="$YOUR_EXTERNALLY_APPROVED_SPKI_SHA256" \
  node deploy/supabase-x402-data-tools/signed-delivery-audit.js \
  "$HOME/.private-x402-settlements/cross-journal-manifest.json" \
  "$HOME/.private-x402-settlements/signed-delivery-claims.json" \
  "$HOME/.private-x402-settlements/trusted-signer.json" \
  "$HOME/.private-x402-settlements/operator-wallet-exclusions.json" \
  > "$HOME/.private-x402-settlements/signed-delivery-report.json"
```

The fourth positional file, operator-wallet exclusions, is optional but
should be supplied whenever known operator/test/marketplace wallets exist.
No live network requests or signing operations are performed.

A stale checkpoint, changed scope, invalid issuer/key algorithm/fingerprint,
invalid signature, malformed or not-fully-completed HTTP response claim,
unknown or conflicting transaction, payer/route mismatch, duplicate
transaction claim, reused request ID, or unsafe input file blocks the
entire run. The CLI does not print private fields on failure.

The privacy-preserving report contains only HMAC wallet/transaction IDs,
canonical route names, and review status. It never prints raw wallets,
transaction hashes, private request IDs, body digests, file paths, signer
public keys or HMAC keys. Keep the report private nevertheless: stable
HMAC identifiers and route metadata may be identifying.

The status signed_server_delivery_claim_independent_review_required means
only that a matching cryptographic signature and settlement evidence were
found. Missing claims are explicitly identified; operator-excluded wallets
remain operator_declared_non_external; overlapping journals count a
transaction once; any conflicting transaction is quarantined from
successful matching.

**Critical trust boundary:** The verifier does not itself prove that the
signer was operationally independent, that the source actually completed
a response, that a client acknowledged or received it, that body bytes
were independently compared to the signed digest, that an external
customer exists, or that refunds/reversals were ruled out. Even a fully
signed set of records is not verified commercial sales.

All reports explicitly retain:

- signer_control_independently_authenticated: false
- actual_response_body_independently_compared: false
- actual_client_receipt_independently_confirmed: false
- current_chain_reverified: false
- independently_verified_external_buyers: 0
- eligible_external_revenue_atomic_usdc: "0"
- product_025_unlock_evidence: false

All automated tests generate temporary **synthetic** Ed25519 key pairs,
fake wallets and journal rows. Passing tests are not proof that any live
independent signing service has been deployed or that any real sales exist.

```bash
node --test deploy/supabase-x402-data-tools/signed-delivery-audit.test.js
```

## Production v6 source parity and release-preflight gate

**Observed on October 10, 2026 (read-only):** Supabase project
`bvjtimsalbzkmulyinpg` reported the canonical `x402-data-tools` Edge
Function as **ACTIVE version 6**, with reported deployment bundle digest
`28d4c24a123538e6cfa437723899784275576d1467e98a836a340a986f674d9f`.
The **independently computed source-file SHA-256** was
`d5c5457cc8d6bbafa041528bcc15323a7e8b47093e55dc61296641914819d508`.
These are different artifacts: the bundle digest is not the source hash.

The authoritative pinned metadata lives in
`production-baseline-20261010.json`. No second baseline manifest or copied
Edge Function source should be maintained. The existing
`verify-production-baseline.js` checker runs during the protected PR CI:

```bash
node deploy/supabase-x402-data-tools/verify-production-baseline.js --check
```

It removes exactly the reviewed 36-line post-settlement telemetry insertion
from the staged `index.ts` and compares the **entire remaining source**
byte-for-byte via SHA-256 to the observed live v6 source. It also checks
canonical payment constants, five route identifiers and live agent-discovery
descriptions, and rejects absent/duplicate telemetry or unsafe evidence
classification. A pass proves **historical source parity only**. It does
not establish that Supabase is *still* running v6.

Immediately before any separately authorized release, acquire a **fresh,
read-only, directly retrieved** Edge Function source file and provider metadata
(version, slug, status, bundle digest) from the authorized Supabase project.
Protect the temporary files in a directory with permissions 0700, with
owner-only 0600 files, outside GitHub and the working checkout. Run:

```bash
node deploy/supabase-x402-data-tools/verify-production-baseline.js \
  --preflight /ABSOLUTE/PRIVATE/live-index.ts \
  /ABSOLUTE/PRIVATE/live-metadata.json \
  2026-10-10T06:30:00.000Z
```

**Use the actual UTC time the provider snapshot was fetched**, not the
example timestamp. The gate rejects a future timestamp or any snapshot
over 15 minutes old, a new source hash, a changed function version/status,
or a changed deployment bundle digest. Never fabricate a fresh timestamp.
The CLI cannot cryptographically authenticate an operator-supplied file or
timestamp: the operator must ensure the snapshot truly came from Supabase.
The response deliberately marks independent provider authentication and
deployment authorization **false**, even on a passing comparison.

If production advances to v7 or changes its source, **do not deploy the
old candidate, rewrite the baseline opportunistically, or merge solely
because CI passed**. First compare the newly fetched live version, reconcile
its features into the one canonical repository source, re-review the payment
invariants and regression suite, and generate a new explicit acceptance
baseline after independent approval.

The live-only buyer-task descriptions discovered in Supabase v6 are now
preserved by PR #4; `main` still contains five older descriptions. This
parity gate prevents accidental regression to those older descriptions.
Supabase's runtime build string may remain `supabase-x402-v5` inside the
source while the provider-reported **deployment version** is v6; neither
value should be silently rewritten.

No step above sends payments, deploys code, changes secrets, grants production
access, books revenue, or unlocks Product 025+. The PR remains a draft until
independent integration/security review and a separately approved deployment.
