# Product Quality Lab v1

## Purpose

The factory already generates product specifications, x402 handlers, discovery, and contract parity for the 22 registered staging products **003–024**. Manufacturing more endpoints does not establish usefulness, accuracy, willingness to pay, or profitability.

Quality Lab adds an **independent, read-only product-improvement loop** that asks whether a real buyer would benefit compared with the direct/free authoritative sources. Product quality improves only after **blinded measurements**, disagreement analysis and human review—not by inventing a 0–100 "AI quality" score.

## Implemented capabilities

1. **Economic and usefulness backlog, all 22 products:** [generated/PRODUCT_QUALITY.md](generated/PRODUCT_QUALITY.md) records strictly historical fee-only categories, source IDs, remaining objective evidence, and next design experiment. Report values are computed from the existing specs; no product price or current provider invoice is inferred.
2. **Adversarial query harness:** [generated/ADVERSARIAL_COVERAGE.json](generated/ADVERSARIAL_COVERAGE.json) lists the deterministic boundary/malformed query variants executed on *both handwritten and generated paid handlers*. Every intentionally invalid query must fail as HTTP 400 **before** payment verification, source access, or settlement. The test uses synthetic specifications and injected non-network fetch mocks only.
3. **Buyer-value experiments:** [opportunities.json](opportunities.json) contains bounded hypotheses for Product 018 (reviewer-ready, multi-source evidence), Product 024 (auditable straight-line geocoding boundaries), and Product 007 (incorporating a negative-fee standalone signal into an existing composite workflow). [generated/OPPORTUNITY_QUEUE.md](generated/OPPORTUNITY_QUEUE.md) records comparator, quantitative *hypothesis targets*, blind fixture plan, negative cases, and independent-review prerequisites. Targets are **not results**.

## Reproduce locally (no payments or provider calls)

From the repository root:

```bash
node quality/product-quality-lab.js --check
node quality/opportunity-lab.js --check
node quality/adversarial-contracts.js --check
node quality/prototypes/018-counterparty-brief.js --check
node quality/benchmarks/cost-frontier.js --check
node quality/benchmarks/018-masked-pilot.js --check
node quality/benchmarks/cost-evidence-gate.js --check
node --test quality/product-quality-lab.test.js quality/opportunity-lab.test.js quality/adversarial-contracts.test.js
```

For a consciously revised spec or experiment, regenerate deterministic reports using the corresponding `--write` argument, inspect the diff, run CI, and request review. CI fails closed on stale reports, missing registered products, inaccurate fee arithmetic, unreviewed commercial assertions, spoofed evidence, invalid buyer-value proposals, and successful/charged hostile requests.

4. **Concrete product-improvement prototype:** [Product 018 reviewer brief](generated/018_REVIEWER_BRIEF_PROTOTYPE.md) converts bounded existing reason codes and source-check status into a conservative human review action. Eight synthetic golden cases cover ambiguous registry, OFAC candidate, RDAP failure, mismatched/recent domain, and inconsistent \`proceed\`. It cannot claim buyer benefit or change the live handler, and refuses to echo raw source/customer/payment data.

## Product Validation Engine (stacked draft)

5. **Full-product cost frontier:** [COST_FRONTIER.md](generated/COST_FRONTIER.md) calculates historical per-transaction cost headroom for **all 22** existing product specs. Only Product 018 has positive headroom at the 70% target: **$0.000690** under the existing pinned settlement-fee assumption. [COST_FRONTIER.json](generated/COST_FRONTIER.json) includes explicitly hypothetical cost sensitivity; it makes no current fee or actual profitability claims.
6. **Masked reviewer pilot:** [018_MASKED_PILOT_PROTOCOL.md](generated/018_MASKED_PILOT_PROTOCOL.md) and the [masked task packet](generated/018_MASKED_PILOT_PACKET.json) prepare **16 synthetic assignments** for two reviewer slots across **eight existing golden cases**. The packet does not publish ground-truth fields or comparator/candidate arm labels. It is *not a genuine 40-case independent blinded buyer study*: reviewers can still infer arms from presentation differences, and fixtures are publicly readable.
7. **Private operating-cost intake:** [COST_EVIDENCE_GATE.md](generated/COST_EVIDENCE_GATE.md) remains **HOLD** because no independently reconciled settlement receipts, source invoices, hosting charges, refunds, or external purchases have been supplied. A strict offline [template](benchmarks/018-private-cost-evidence.template.json) can calculate *unattested* operator-input arithmetic but cannot self-certify its evidence or grant commercial approval.

Detailed replication, reviewer packet use, adversarial observation guards, and independent release requirements: [benchmarks/README.md](benchmarks/README.md).

## How an improved product graduates

**Design hypothesis** → select a buyer and a purchase trigger → document the **free/manual baseline** → build a read-only prototype retaining existing payment/source decision boundaries → blind-test representative correct/incorrect/ambiguous cases → compare **time, correctness, false proceeds and actual resource costs** → independently verify customer uptake and invoices → human privacy/integration/security review → **explicit separate release decision**.

This Quality Lab does not authenticate a claim merely because an operator writes it in a file. In the initial lab, all external buyer, billing, measured-quality, and market-demand evidence remains null/unmeasured and all commercial advancement is HOLD. Private customer prompts, wallets, authentication headers, invoices and source-provider secrets must never be committed in fixtures.

## Economic interpretation

Historical per-product spec fees use the pinned **$0.002310 paid Base x402 settlement-cost assumption**. Those numbers are *not* refreshed live facilitator quotes or complete hosting/source/refund/support costs:

- 6 products are negative after that **fee-only** assumption.
- 15 produce a positive fee-only contribution below the 70% target.
- Product 018 alone passes the 70% **fee-only** arithmetic (76.9%). That is not permission to launch.

No automatic price increase, account change, wallet change, payment settlement, purchase, new product numbering, or Product 025+ unlock. Pre-existing PR #2 remains draft until its separate review and deployment approvals.
