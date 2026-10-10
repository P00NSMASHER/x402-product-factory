# x402 Factory — Base facilitator fee sensitivity, 2026-10-10

## Decision and scope

**Prioritize commercial viability of existing Products 001–024, not catalog
expansion or automatic price changes.** The original October 2 economics
baseline is historical evidence and must not be silently overwritten when the
facilitator's published settlement rate changes.

Authoritative public pricing read on 2026-10-10:
- Endpoint: https://facilitator.payai.network/pricing (public GET only).
- Provider `asOf`: **2026-10-10T11:56:30.014Z**.
- Selected network/scheme/method: `eip155:8453 / exact / eip3009`.
- Published paid-settlement fee: **2.18 credits = $0.00218 USDC-equivalent**.
- Rate ID: `ddbd079f-72ce-467d-bde8-859151d83999`, effective
  **2026-10-07T12:00:00.003Z**.
- Previous pinned snapshot (2026-10-02): **$0.00231**, not current.
- Price source and selection are archived in
  `economics/payai-base-rate-2026-10-10.json`.
- PayAI documents an ordinary exact-payment default allowance of **1,000
  lifetime credits per receiving wallet**, with shared-pool and legacy-wallet
  qualifications: https://docs.payai.network/x402/facilitators/pricing.

This is a **fee-only sensitivity calculation**, not net unit economics or
evidence that any product sold. Registered status and pricing do not imply
that a route is live. The seller's credit balance and specific entitlement,
live hosting, retries, source fees and customer provenance have not been
independently measured by this report.

## Results (after exhaustion of any applicable free credits)

All dollar figures are exact integer-micro-USDC arithmetic, using one
successful Base exact/EIP-3009 settlement per purchase at the observed fee.

| Measure | Value |
|---|---:|
| Registered products screened | **24** |
| Registered prices below the published paid fee | **7** |
| Products that can reach 70% *before other costs* | **2** |
| Products that cannot reach that fee-only planning target | **22** |
| Minimum hypothetical price for 70% fee-only margin | **$0.007267** |
| Product prices modified | **0** |
| Independently verified profitable products | **0** |

Products **001, 007, 010, 011, 012, 021 and 022** each have a registered
price below the paid facilitator fee. This is a structural **post-free-tier
settlement-cost risk**. It does not prove a currently incurred loss while
the account-specific free-credit balance is unknown.

Only **002** ($0.020, fee-only margin ceiling 89.1%) and **018** ($0.010,
fee-only margin ceiling 78.2%) can mathematically reach the proposed 70%
fee-only margin at this rate. They are **not certified profitable**, since
other costs have not been subtracted.

A hypothetical untouched standard lifetime allowance of 1,000 credits
could cover at most **458 complete Base EIP-3009 settlements** at a constant
2.18 credits each. That is a model ceiling, not the actual seller's
remaining entitlement. Shared credit pools, legacy terms, earlier purchases
and future rate changes may reduce or alter it.

**Important accounting correction:** The October 2 report calls
`price - facilitator fee - configured cash source fees` a
"lower-bound contribution." When incremental hosting, retries, refunds,
noncash operating costs or source fees are unknown and not included,
this is actually an **optimistic contribution ceiling before those costs**.
No prior numeric record is silently rewritten here; downstream decisions
should use this corrected interpretation.

## Reproducible tooling

The factory now includes:

- `economics/live-fee-economics.js`: read-only calculator over
  the **existing** 24 registry entries, with no service or payment changes.
- `economics/live-fee-economics.test.js`: amount precision,
  margin threshold, registry integrity/freeze, rate selection, freshness and
  HTTP-failure tests.
- `.github/workflows/factory-economics-ci.yml`: offline
  deterministic PR/main CI, including preserved historical five-product
  economics checks.

Commands from the repository root:

```bash
# Validate archived pricing and all 24 current branch registry entries,
# without any network requests.
node economics/live-fee-economics.js --check

# Full 24-product archived fee-only sensitivity JSON.
node economics/live-fee-economics.js --snapshot

# Opt-in read-only GET of currently published PayAI rates:
# requires a fresh provider snapshot; does not charge or purchase anything.
node economics/live-fee-economics.js --live
```

The live option fetches only `GET https://facilitator.payai.network/pricing`
with a bounded timeout, redirect rejection, body-size limit, exact
network/scheme/method selection, credits-to-USD reconciliation, effective
timestamps and a **48-hour provider-as-of freshness check**. Missing,
duplicate, unpublished, stale, inconsistent, future-effective or malformed
Base/EIP-3009 fee data fails closed. The live command writes **no files** and
never edits prices, paid routes, wallets, credentials or production config.

The archived snapshot option is intentionally labeled historical; it is
suitable for deterministic CI but **not sufficient for live pricing decisions**.
A future real-world pricing decision must use a current live-rate check plus
measured hosting, source, retry/refund, distribution and demand evidence.

## Commercial decision gates

1. Treat fee-only margin screens as a prioritization and risk input, never
   as automatic launch authorization, verified profit or outside-buyer proof.
2. Keep Products **025+ frozen** until independent external buyer or revenue
   evidence satisfies the existing genuine-demand rule.
3. Continue validating **real customer demand** for existing products and
   record only independently proven outside buyers; wallet counts alone do
   not establish distinct buyers.
4. Before any pricing or deployment change, get explicit commercial release
   review, current facilitator rates, account-specific credit availability
   where possible, and product-specific measured marginal costs.

No spend, purchase, settlement, automatic price adjustment, production
deployment or merge is authorized by this document.
