# Product Validation Engine — evidence-ready, not product-market-fit proof

## Scope

A stacked **draft-only** upgrade of the existing Product Quality Lab on top of specification PR #2 and Quality Lab PR #5. This subsystem does not register a new product, change money movement, modify live handlers, contact buyers, or deploy.

### Cost frontier — all 22 products

Run from repo root:

```bash
node quality/benchmarks/cost-frontier.js --check
```

The generated [cost frontier](../generated/COST_FRONTIER.md) separates historically assumed settlement fees from **unmeasured** present-day provider bills, hosting, retries/refunds, support and actual margin. The Product 018 historical $0.010 price leaves a total *hypothetical* $0.000690 headroom per sale at 70% under the pinned $0.002310 fee assumption. Six products are fee-negative; fifteen more miss the 70% fee-only screen. Mathematical hypothetical repricing boundaries are **not price recommendations or authorizations**.

### Masked synthetic Product 018 reviewer pilot

Run:

```bash
node quality/benchmarks/018-masked-pilot.js --check
node --test quality/benchmarks/018-masked-pilot.test.js
```

The publicly committed [task packet](../generated/018_MASKED_PILOT_PACKET.json) has **16 synthetic tasks**, assigned to R1 and R2. For every one of eight existing golden fixtures, each reviewer slot receives one masked arm. The arms are counterbalanced, four original and four prototype per slot, with no ground-truth or arm labels in the exported packet. This is a **training and smoke-test packet**, not actual independent blinding: the source fixtures remain public, and presentation differences can disclose the arm.

The static safety replay catches two deliberately contradictory raw `proceed` examples and zero in the conservative prototype. These fixtures and golden labels were authored for the prototype, not independently held out. **Do not report those counts as measured real-world false-proceed rates.**

For an optional independent pilot, use an authorized coordinator to distribute only the task packets, recruit reviewers independently, time the tasks outside the application, and retain responses outside the repository. A private response JSON array contains only:

```json
{
  "assignment_id": "P018_R1_001",
  "reviewer_slot": "R1",
  "selected_decision": "human_review",
  "selected_next_action": "MANUAL_REVIEW_UNCLASSIFIED",
  "elapsed_seconds": 15
}
```

Run privately: `node quality/benchmarks/018-masked-pilot.js --score /private/018-observations.json`. The scorer requires exact assignment IDs, nonduplicated response records, known action/decision codes, strictly bounded timing, and **no names, emails, or other extra fields**. It prints only aggregates. An incomplete pilot reports no performance metric. Even a full pilot stays **HOLD** because it is only eight synthetic cases and has no externally verified buyer identities or independent real-world gold labels. The originally planned buyer-value test needs **40+** representative independent cases and **2+** independently recruited reviewers, and independent measurement of task time, accuracy and reviewer actions.

### Operating-cost evidence intake

Run:

```bash
node quality/benchmarks/cost-evidence-gate.js --check
```

The generated [cost evidence gate](../generated/COST_EVIDENCE_GATE.md) is **HOLD** with all real financial evidence null. Copy the [private template](018-private-cost-evidence.template.json) to a **private machine outside this repository**, populate it only from actual reconciled evidence, and run:

```bash
node quality/benchmarks/cost-evidence-gate.js --assess /private/018-costs.json
```

The engine accepts fixed-point money, a bounded date window, reconciled settlement counts, and four external document-reference digests but does **not** verify the source documents from the supplied hash strings. Even a mathematically viable operator-entered result remains `HOLD_PENDING_INDEPENDENT_INVOICE_AND_BUYER_AUDIT`; documents and independently corroborated customer purchases must be reviewed out of band. Never commit invoices, settlement details, raw buyer responses, names, payment signatures, tokens or documents.

### Product 018 evidence-contradiction oracle (offline proposed fix)

Run from the repository root:

```bash
node quality/benchmarks/018-decision-oracle.js --check
node --test quality/benchmarks/018-source-contract-v2.test.js quality/benchmarks/018-source-adapter-v2.test.js quality/benchmarks/018-hardened-decision.test.js quality/benchmarks/018-decision-oracle.test.js quality/benchmarks/018-source-contract-replay.test.js
```

[Read the synthetic benchmark report](../generated/018_DECISION_ORACLE.md). Its **40 source-audited synthetic cases** cover identity cardinality contradictions, inconsistent/missing OFAC candidate tallies, source failures, invalid/future domain registration dates and inclusive age thresholds. The current unmodified Product 018 decision returns `proceed` on **18** scenarios labeled human-review by the expanded 40-case oracle; the corrected **offline-only** prototype matches all 40 expected labels. The preceding 30-case audit overstated registry cardinality concerns: multiple *ranked* results can be legitimate if exactly one match is strong. The [provider source-contract audit](018-SOURCE_CONTRACT_AUDIT.md) documents that correction. Counts from different synthetic test sets should not be interpreted as comparable error rates. These fixtures are neither externally verified ground truth nor actual buyer observations; **no production error rate, customer improvement, sanctions determination or independent review is established**.

The generated report and the benchmark suite are gated in CI. The existing product/source/payment/runtime implementations remain unchanged. Before integrating a candidate fix, independently validate the now code-audited registry/OFAC contract semantics against real source data and held-out examples, review legal/identity claim boundaries, use additional blind held-out adversarial cases, and obtain explicit product/security approval. The Product 025+ freeze and commercial-economics HOLD remain intact.

### Staging service integration — settlement-safe evidence gate

[Product 018 evidence gate](../../products/pa-vendor-counterparty-review/EVIDENCE_GATE.md) applies the source-contract checks to the actual staging service, without changing authoritative data adapters or the core decision helper. Failed required source contracts are non-chargeable, with both generated and handwritten paid handlers prevented from settling the payment. Completed valid human-review findings remain eligible for the existing paid result. **Not merged or deployed.** Independent source and payment reviews remain mandatory.

### Product 018 complete staging/AppDeploy-route canary

[Read the staging shadow-canary protocol](018_RUNTIME_ACCEPTANCE.md). The executable `018-runtime-canary.js` instantiates the **actual** `createFactoryRuntime` and `createAppDeployRouteMap` for all 22 factory products, then probes the real Product 018 GET/OPTIONS route with **strictly injected fake provider and x402 facilitator functions**. It verifies:

- A real unpaid `402` challenge in the simulated route with the existing payment network, asset, receiver and **10000 atomic USDC** amount, without making any facilitator request.
- Invalid inputs, malformed signatures, rejected/unknown verifications, no source calls, and no mock settlement.
- Both chargeable `proceed` and completed `human_review`, including a legitimate multi-ranked/one-strong PA match.
- Contradictory registry/OFAC/RDAP evidence and transport exceptions returning `502 chargeable:false` with **zero mock settlement**. Source errors are normalized to fixed codes rather than echoing private upstream error messages or arbitrary `error.code`.
- A terminal settlement result does not fabricate a `PAYMENT-RESPONSE`, and the route preserves its previous price, CORS and x402 identity.

Run `node quality/benchmarks/018-runtime-canary.js --check` for a machine-readable **observed synthetic** readiness report. This is a deterministic CI test of the assembled *draft runtime*, not an independent live source probe, real payment, actual facilitator receipt or release approval. All real-money/user-evidence gates remain HOLD.

### Product 018 read-only live-provider compatibility check

The [public source contract probe](018_LIVE_SOURCE_READINESS.md) uses the exact Pennsylvania business-registry, OFAC SDN and IANA/Verisign RDAP **adapters** from the repository. Its query is pinned to one previously public Pennsylvania company test identity and IANA's reserved `example.com` domain. It cannot be directed to private buyer names, vendor data, payment URLs or arbitrary hosts, and blocks POST, credentials and all redirects except the exact-file signed public OFAC GovCloud publication redirect with a strict host/path/TTL policy.

A separate [GitHub Actions source smoke](../../.github/workflows/factory-018-live-source-smoke.yml) runs a **real, non-payment, read-only** compatibility check when these probe files change in a PR. The probe prints only status, timestamps, fixed public host labels and request counts. Any unavailable/mismatching official source produces a **HOLD** status rather than silently implying launch readiness. Provider-reported Last-Modified (when available) is just metadata, not cryptographic freshness proof.

Run `node --test quality/benchmarks/018-live-source-probe.test.js` for deterministic injected-source regression checks. Use `node quality/benchmarks/018-live-source-probe.js --probe-live` only in an authorized network environment; this command performs bounded **public GETs only**, never any payment or external buyer operation. A passing source smoke still leaves real payment reconciliation, customer demand and current costs unverified.

### Test and release barriers

The unchanged Factory product CI continues to run every existing staging release gate and all discovered tests, plus deterministic `--check` gates for these artifacts. Tests include tampered artifacts, unauthorized Product 025+ assertions, partial/private evidence input, inconsistent price arithmetic, duplicate trial entries, and fake approvals.

**No automated conclusion about demand, price viability, product-market fit, buyer benefit, source legality, audit results, or launch approval is possible from these synthetic tools.** Human privacy/security/integration and *current independently verified* financial/customer evidence are mandatory for any release decision.
