# Product 018 — private cost-evidence gate

No real source provider invoice, facilitator receipt, hosting charge, retry/refund ledger, or independent customer proof has been connected to the Product Factory.

- Current status: **HOLD_UNVERIFIED_OPERATING_COSTS_AND_BUYER_EVIDENCE**.
- Required private evidence fields still missing: **14**.
- Verified external buyers: **not established**.
- Verified operating contribution margin: **unknown**.

Populate the private template on an authorized local machine using true financial records and SHA-256 **references**, not pasted customer or transaction secrets. Then run:

    node quality/benchmarks/cost-evidence-gate.js --assess /private/018-costs.json

This only computes **unattested input arithmetic** and does not authenticate source invoices or turn a hold into an approval. Keep raw records outside the repository; independently verify the hashes and source documents.

Passing the Product 018 historical fee-only scenario is not current fee verification. No price, wallet, payment, customer data, deployment or Product 025+ action is authorized.
