# Product 018 — masked reviewer pilot protocol

This is a **synthetic eight-case pilot**, not an independently blinded real-buyer efficacy study. The planned buyer experiment needs at least **40 properly sampled cases** and **two independently recruited reviewers**; neither requirement is met by these fixtures.

## How to run a controlled pilot

1. A coordinator privately distributes each slot's eight tasks from `018_MASKED_PILOT_PACKET.json`; do **not** distribute the original golden fixture file to reviewers.
2. The task records are masked as to which arm is the original raw product and which is the prototype. Differences in presentation can still reveal the arm; masking is **not cryptographic blinding** or protection from repository readers.
3. Reviewers choose a decision and action code from the packet and record their own task time in seconds. Record no customer names, account information, payment signatures, emails, or addresses in submissions.
4. The coordinator stores reviewer responses **outside the Git repository** and may run `node quality/benchmarks/018-masked-pilot.js --score /private/018-observations.json` to obtain aggregate diagnostics. This command prints no raw observations or personally identifying information.
5. Compare safely against the documented original/manual workflow using independent held-out ground truth. Do not equate a scorer's synthetic labels with externally validated accuracy, time savings, real demand, revenue, or profitability.

## Current synthetic regression

The deliberately contradictory baseline fixtures contain **2 raw proceed decisions** that their synthetic expected review labels mark as requiring review. The prototype flags both. This is regression coverage only; no real failure rate is estimated.

## Mandatory gates

- Any incorrect proceed requires escalation and blocks automatic advancement.
- No measured reviewer-time or conversion gain is claimed without genuine private observations and independent provenance.
- Product 018's historical $0.000690 per-call headroom is not an actual cost allowance; current hosting, source fees, refunds and settlement pricing must be independently verified.
- Release remains HOLD with no price, payment, wallet or production changes and no Product 025+ unlock.
