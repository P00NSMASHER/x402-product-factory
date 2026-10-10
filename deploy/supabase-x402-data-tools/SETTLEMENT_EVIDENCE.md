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
