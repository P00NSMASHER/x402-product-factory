# Growth Lab v1 — demand-first application factory

This is the **commercial-validation preflight** for the runnable local document-workflow applications. It manufactures buyer-specific pilot-page previews and holds a private operator-attested evidence ledger. It does not market, deploy, email, charge, receive customer documents, or operate a commercial checkout.

## Why this exists

The application factory can build 3 fully runnable local editions and manufacture up to 100 configurations, but software generated is **not evidence of demand or revenue**. Growth Lab changes which edition should be prioritized based on recorded buyer results. Every app carries an attractive, static draft page at `growth/index.html` and a machine-readable, noncommercial offer at `growth/offer.json`. The page uses actual recipe inputs, makes no unsupported customer/savings claims, does not contact external servers, and offers no purchase or signup form.

## Real demand workflow

All outputs begin at `research`; neither packaged app acceptance nor synthetic buyer records can change that. The private ledger records pseudonymous hashed buyer IDs and hashed provenance reference IDs. Raw names, email addresses, invoices, conversation notes, phone numbers, files, or payment tokens are rejected. No sensitive original evidence should be put in Git or chat; keep the originals in a separate authorized secure provider.

Evidence starts **unattested**. A separate operator reviewer secret is required to mark an *external* entry as **operator-attested**. These labels are **not independent payment confirmation**: even operator-attested records are not independently audited or guaranteed truthful. Synthetic entries can never be attested. Repeated references are rejected, and unique buyer hashes prevent multiple buyer counts for the same identifier. The state file is HMAC-protected for accidental/unauthorized modification detection; it is **not encrypted**. The secrets must remain outside the repository. Losing the chain key prevents access to the private ledger. Operators controlling both keys can falsify their own attestations; no business should self-certify commercial validation from this tool.

Stages are **recommendations only**:

1. `research`: fewer than 10 distinct operator-attested qualified buyer conversations.
2. `pilot_review`: 10 conversations; seek 3 paid pilots from distinct buyers.
3. `delivery_review`: 3 distinct paid pilot buyers; confirm completed customer outcomes.
4. `economics_review`: completed work but not yet sufficient repeat purchasing, total observed delivery costs, and positive operator-reported contribution.
5. `scale_review`: at least 10 qualified conversations, 3 paid pilot buyers with completed outcomes, 2 distinct repeat buyers, no recorded refunds, and positive contribution with cost coverage. **Still manual review only.** No stage authorizes deployment, billing, pricing changes, outreach or a new product number.

`operatorsReportedGrossCents` and `contributionCents` summarize operator-entered attestations, **not accounting-verified revenue or profitability**. Actual `collectedRevenue` and `realCustomers` remain `null`; an external processor/accounting reconciliation must establish those separately. `unit_cost` inputs represent the cumulative observed variable delivery costs for the buyer, including repeat work, not arbitrary estimates. Missing observed cost blocks scale review.

## Operator CLI (private/local only)

Requires Node 22.13+. Generate and securely store **separate random 32-byte chain and reviewer keys** outside the repository, written as hex to owner-private key files. Keep them out of shell history, logs, email and Git. Obtain the review-key SHA-256 fingerprint locally; the example below uses placeholders, not actual keys.

```sh
node scripts/growth-lab.js init --ledger /absolute/private/growth/evidence.json --chain-key-file /absolute/private/chain.hex --reviewer-key-hash <sha256-of-private-reviewer-key>
node scripts/growth-lab.js record --ledger /absolute/private/growth/evidence.json --chain-key-file /absolute/private/chain.hex --reviewer-key-hash <sha256-of-private-reviewer-key> --event-file /absolute/private/event.json
node scripts/growth-lab.js attest --ledger /absolute/private/growth/evidence.json --chain-key-file /absolute/private/chain.hex --reviewer-key-hash <sha256-of-private-reviewer-key> --seq 1 --reviewer-key-file /absolute/private/review.hex
node scripts/growth-lab.js report --ledger /absolute/private/growth/evidence.json --chain-key-file /absolute/private/chain.hex --reviewer-key-hash <sha256-of-private-reviewer-key>
```

Accepted event schema has exactly these fields: `{ "recipeId":"supplier-desk", "kind":"qualified_conversation", "origin":"external", "buyerHash":"<sha256>", "referenceHash":"<sha256>", "source":"interview_record", "cents":null }`. Other kinds: `pilot_paid`, `repeat_paid`, and `refund` use `source="payment_record"` and a positive integer cents; `outcome_delivered` uses `delivery_record` and null cents; `unit_cost` uses `cost_record` and nonnegative integer cents. Never put real buyer identities or raw source documents inside these JSON events.

No automatic imports from Stripe, email, CRM, or financial accounts are present. Attestation is deliberate and separate from data entry. The CLI never prints keys or raw buyer information, never contacts external services, and never writes into the source repository.

## Release boundary

Draft, unmerged and undeployed. All product manufacture receipts continue to mean **implementation accepted**, not market validated. All live sales, public pages, outbound offers, cost commitments, paid deployments, customer records, commercial claims, and Product 025+ unlock remain on hold pending explicit review and approval. The Growth Lab is not an independent financial auditor or customer demand guarantee.
