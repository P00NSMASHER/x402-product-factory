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
