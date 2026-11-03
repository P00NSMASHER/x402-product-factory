# Supabase x402 usage-evidence readiness — 2026-10-10

## Decision

Understand the **observed** request mix and exposure to Supabase invocation
billing for the existing canonical \`x402-data-tools\` seller, without
mistaking HTTP 402 challenges, discovery visits, or application HTTP 200
responses for verified sales or computing an unsupported per-sale margin.

This is a second, separate source of evidence alongside
\`ECONOMICS_RATE_REFRESH_2026-10-10.md\`. It does **not** measure hosting
costs for factory Products 003–024, which are different routes and have
different deployment status. Product catalog/prices are unchanged.

## Read-only provider facts and interpretation

- Source: connected Supabase project \`bvjtimsalbzkmulyinpg\`, Edge Function
  \`x402-data-tools\`, ACTIVE deployment version **6** observed on October 10.
  This function lives in a project hosting additional, unrelated functions.
- Observability source: \`function_edge_logs\`, filtered to **this function
  ID**. The logs can expose \`request.pathname\`, \`request.method\`,
  \`response.status_code\`, and \`execution_time_ms\`.
- Data collection: **aggregate only**. Do not export payment headers, raw
  URLs with query strings, IP addresses, user agents, account identifiers,
  request bodies, source inputs, wallet addresses, or raw event-message text.
- Only a bounded **one-day window** was inspected. Log ingestion/retention,
  missing events and organizational billing coverage were not independently
  proven; do not describe the window as lifetime traffic or a complete
  monthly billing ledger.
- Supabase provider guidance (retrieved October 10):
  https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations
  counts function invocations regardless of response status code, excluding
  OPTIONS preflight, with plan-specific included quotas and published
  over-quota package pricing of **$2 per 1 million invocations**.
- The connected organization currently reports a **Free** plan, but remaining
  organizational quota, every project's usage, exact billable counters,
  actual invoiced dollars, and any marginal per-sale hosting costs were
  **not established** by these function logs. In particular, a 402 response
  may consume function-invocation quota even though no payment settled.
- The production function has no paid-success settlement telemetry deployed
  from draft PR #4. A function Edge HTTP 200 on a paid route would only be
  an **unverified response candidate**, not receipt/chain/buyer proof.
  Public discovery HTTP 200 is also never a sale.

The dated private aggregate evidence can be reviewed in its authorized
operator location. **It is intentionally not committed to this public
repository.** No actual customer, address, wallet or session data appears
in the public regression fixtures.

## Private aggregate analyzer

\`economics/supabase-usage-readiness.js\` classifies one private JSON
document of route+method+HTTP-status aggregates; it performs **no network
requests**, writes no new files, changes no Supabase resources and does not
use credentials. Its output is a diagnostic with canonical route coverage,
observed x402 challenges, potential paid-route 200 responses, public
discovery responses, and non-OPTIONS invocation counts.

The input contract is:

- \`schema_version=1\`, \`source="function_edge_logs_aggregated"\`,
  \`function_slug="x402-data-tools"\`,
  \`coverage="observed_log_rows_not_invoice"\`.
- \`window_start\` and \`window_end\` are UTC timestamps no more than
  24 hours apart, with end strictly later than start.
- \`rows[]\` contains no more than 250 aggregated records, each with exactly:
  \`pathname\`, \`method\`, \`status\`, \`invocations\`,
  \`mean_execution_ms\`, \`p95_execution_ms\`.
- \`pathname\` is a path (no query string or URL), such as
  \`/functions/v1/x402-data-tools/api/domain-rdap\`. Unknown paths are
  aggregated under \`other\` but not echoed to the output.
- Missing execution-time values are \`null\`; p95 across multiple groups is
  **not reconstructed** from group p95 statistics.
- Duplicate route/method/status groups, unknown object keys (such as raw
  headers), malformed quantities, unsupported origins and invalid inputs
  are rejected rather than silently accepted.

Example with **fully synthetic counts** (not real customer traffic):

\`\`\`json
{
  "schema_version": 1,
  "source": "function_edge_logs_aggregated",
  "function_slug": "x402-data-tools",
  "window_start": "2026-10-09T21:00:00Z",
  "window_end": "2026-10-10T21:00:00Z",
  "coverage": "observed_log_rows_not_invoice",
  "rows": [
    {
      "pathname": "/functions/v1/x402-data-tools/api/domain-rdap",
      "method": "GET",
      "status": 402,
      "invocations": 8,
      "mean_execution_ms": null,
      "p95_execution_ms": null
    }
  ]
}
\`\`\`

Prepare the operator input **outside the repository** in a genuine owner-only
directory (mode 0700), with an owner-only input JSON file (0600). The
analyzer refuses public-readable files, symlinks, hardlinks, repo paths,
unknown fields and raw URL/query/headers. Use \`umask 077\` when creating
files, and never paste private logs into GitHub.

\`\`\`bash
node economics/supabase-usage-readiness.js \
  /ABSOLUTE/PRIVATE/x402-function-edge-aggregates.json
\`\`\`

For a fresh Supabase Logs Explorer extraction, use a bounded time window,
filter \`source='function_edge_logs'\` and the actual x402 Edge Function ID,
group by \`log_attributes['request.pathname']\`,
\`log_attributes['request.method']\` and
\`log_attributes['response.status_code']\`, and derive count/average/p95
from \`log_attributes['execution_time_ms']\`. Inspect query results in a
private environment before constructing the strict JSON above. Do **not**
remove the function-ID restriction or query unrelated tenants and functions.
Use the supported Supabase log tool's explicit ISO time-window arguments.

## October 11 conditional hosting cost model (not actual cost)

A new, entirely read-only economics extension now keeps three **separate**
facts apart:

1. **Observed workload** — function-scoped Edge logs (status/method/path
   aggregates and execution-time observations) from a bounded window, not an
   invoice or complete billing month.
2. **Conditional overage exposure** — exact, whole-package calculation under
   an explicitly *hypothetical* organization-wide starting count, quota and
   number of added non-OPTIONS invocations.
3. **Verified actual cost** — **unavailable** without organization-level
   billed usage, invoiced line items, actual plan/quota/spend-cap status, a
   defensible function-allocation policy, and independently confirmed
   transactions and source-provider expenses.

A read-only connected Supabase query on 2026-10-11 examined a bounded
24-hour log window for the canonical x402 function only; logs from the
project's other Edge Functions were explicitly excluded. This supplies
**observed log records**, not necessarily every function invocation and not
the complete organizational bill. Do not commit the private observation
rows, request paths/headers, IPs, or other customer metadata to GitHub.
A public example count in this document is **synthetic**.

The organization itself was checked **read-only again on
2026-10-11** and reported the **Free** plan. That does not establish the
complete billing-cycle usage or an invoice charge, and it certainly does
not establish the incremental cash cost for Products 003–024. The $2
whole-package scenarios below are deliberately **hypothetical paid-plan
overage cases**, not charges the current Free-plan organization incurred.

The published pricing reference currently says:

- Non-OPTIONS Edge Function invocations count toward billing even when the
  response status is 402 or 404. OPTIONS preflight is excluded.
- The published over-quota rate is **$2 per 1 million invocations**.
- On eligible paid plans with overage enabled, partial overage packages round
  up to the next whole 1-million package.
- Quotas are organization-wide and span projects, not separately available
  to a specific function.

Sources (provider guidance, not an account invoice):
https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations
and https://supabase.com/docs/guides/platform/billing-on-supabase.

The canonical usage report now includes a
`hosting_cost_readiness` section. It identifies the observed
non-OPTIONS workload and explicitly returns **null** for actual function
billed usage, actual organization overage charge, source-provider fees,
incremental hosting per verified sale, retry/refund/maintenance costs and
profit. A paid API HTTP 200 cannot fill any of these fields. Product 025+
and automatic price/deployment decisions remain blocked.

### Reproducible conditional package calculation

The existing module exports `modelConditionalHostingOverage` as
a strict, deterministic mathematical helper using integer arithmetic;
it does not contact Supabase, read an account, or spend anything.

The following numbers are wholly **hypothetical** (not the actual
organization's quota or billed usage):

```javascript
const {modelConditionalHostingOverage} =
  require("./economics/supabase-usage-readiness");

const scenario = modelConditionalHostingOverage({
  organization_prior_non_options_invocations: 500000,
  added_non_options_invocations: 10,
  organization_included_quota_invocations: 500000
});
// conditional_incremental_packages: 1
// conditional_package_step_usd: "2.00"
// actual_hosting_cost_usd: null
// actual_per_sale_hosting_cost_usd: null

```

The model permits only the three numeric assumptions above and rejects
additional fields claiming verified invoices, buyers, profits or approval.
Its result is always labeled hypothetical, even when conditional package
cost equals "$0.00". A reported zero *hypothetical* increment is **not**
evidence that this function incurred zero real hosting cost.

**Important billing discontinuity:** At a hypothetical organization count
exactly on a quota/package boundary, just one additional qualifying request
can add an entire $2 package. Within an already-paid package, another
request may add $0 in *package-step* fees. Neither is the causal/allocated
marginal cost of a paid API response. Avoid multiplying a route's requests
by $0.000002 and labeling that as its actual bill.

The supplied usage logs concern the live **five Supabase data-tools routes**
only. They are **not cost measurements for factory Products 003–024**,
which have different routes and staging/production status. Public PA,
SEC, Treasury and RDAP adapters may have configured direct cash fees of
zero, but upstream rate limits, hosting, retries and other expenses remain
unmeasured until independently sourced billing evidence is available.

### Cost evidence required before real unit economics

- Same-period organization-wide Supabase billing statement, plan, quota,
  spend-cap/overage eligibility, complete project usage and true charged
  "Function Invocations" line items (not only logs).
- A documented allocation method for this function and unrelated functions
  in the same Supabase project; do not treat all organization charges as
  belonging to x402.
- Separately dated source-provider invoices, request/bandwidth usage and
  contractual fees for each actual paid product.
- Verified actual settlement receipts and genuine external buyer-service
  attribution, plus refunds, failures, support and maintenance expenses,
  to establish the cost **per confirmed sale** rather than per log record.

Until then, **actual profit and per-sale costs remain unknown, not zero**.
No new rate or financial snapshot is treated as a seller-wallet invoice.
There are no payment, wallet, pricing, deployment or registry changes.

## Required guardrails and next evidence

The analyzer **cannot** establish actual Supabase invoice charges, quota
remaining, per-sale compute charges, upstream source marginal costs,
retry/refund cost, confirmed settled buyers, or net profit. These values
remain \`null\`, not guessed as $0. Paid-route HTTP 200 stays a review
candidate, and the Product 025+ growth freeze remains enforced.

For a defensible commercial margin decision, collect (with private retention)
the organization-wide Supabase billing/usage statement, production-provider
cost allocation rules, settled on-chain transaction receipts, independently
proven external buyers, source-provider costs and failure/retry/refund
measurements. Compare these sources at the same time grain before changing
pricing or deploying a staged route. The public per-million package price
is a **rate reference**, not a measured invoice or an automatically
allocable \$0.000002 charge to any observed request.

## Checks

\`\`\`bash
node --test economics/phase1-five-product-costs.test.js \
  economics/live-fee-economics.test.js \
  economics/supabase-usage-readiness.test.js
\`\`\`

All production reads for this analysis were read-only. This branch adds no
scheduled job, billing operation, production Edge Function changes, payment
attempts, customer identity claim or product registration.
