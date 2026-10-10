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
reviewer/provenance, amount, currency, and exclusion reason. No such ledger
or live on-chain verification has been deployed as part of this PR.

## Operational scope

- No customer charges, purchases, refunds, or automatic reconciliation.
- No changes to facilitator selection, receiver wallet, Base USDC rail,
  prices, route dispatch, or product decision logic.
- No automatic revenue or buyer claims based on raw logs.
- Read-only test: `node --test deploy/supabase-x402-data-tools/settlement-telemetry.test.js`.

References: [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md);
[PayAI facilitator developer reference](https://payai.network/developers).
