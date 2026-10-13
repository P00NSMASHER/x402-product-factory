# Hosting and source-cost evidence gate — October 11, 2026

## Decision

**The factory cannot yet claim measured per-sale hosting, upstream source,
refund/retry or operating costs.** The present evidence establishes an
observable request mix, the connected organization's plan, the published
Supabase invocation-pricing rules, and previously measured *configured*
direct-source cash fees for Products 003–007. These are **not** a monthly
provider invoice, a complete billing cycle, or verified unit economics.

The missing source of truth is the actual organization-wide Supabase usage
and invoice statement, plus separately reconciled upstream provider expenses,
retry/refund costs and **independently verified** paid settlements. Do not
substitute function logs or published catalog prices for that evidence.

## What was checked read-only

- Connected Supabase project: `bvjtimsalbzkmulyinpg`, the function
  `x402-data-tools`, organization plan **Free** as observed.
- Source: `function_edge_logs` filtered by the actual function ID and grouped
  by pathname, method and status. Only aggregate counts and timings were read.
  The bounded recent log window is incomplete relative to a monthly invoice.
  To protect confidential operational details, live aggregate rows are **not
  committed to this public repository**.
- Published Supabase rules (consulted October 11):
  https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations
  say HTTP 402 challenges count as function invocations; OPTIONS preflight
  does not. The Free plan has an included quota of 500,000 monthly invocations;
  overage pricing on paid plans is **$2 per million**, charged in million-call
  packages after organization-wide included allowances. This is not evidence
  that any individual request incurred $0.000002 or that remaining quota is
  available.
- The connected Supabase tools offer read-only project metadata and function
  logs but did not expose authoritative, complete, organization-wide invoice
  or usage data for this audit. This report makes **no claim** about actual
  invoice dollars, remaining quota or per-sale marginal hosting cost.

**Important scope separation:** These five canonical Supabase
`x402-data-tools` paid routes are **not** the numbered factory catalog
Products 001–024. Do not assign their hosting usage to Product 003, 006 or
any other numbered product because a name resembles one. Most numbered
products are staging or have different hosts and payment arrangements.

## Reusable cost-evidence bridge

The existing `economics/supabase-usage-readiness.js` remains the single
validator for operator-private, bounded route-level aggregate logs. New
`economics/hosting-cost-evidence.js` consumes **that same strict aggregate
format**, with an optional second private document describing an
**operator-transcribed** Supabase invoice line.

It never fetches a billing credential, makes a payment, changes a price, or
modifies a provider. Input paths must be absolute, outside this checkout,
in genuine owner-only (0700) directories with owner-only (0600) regular
files. Symlink/hardlink/public-readable paths fail closed.

Run without an invoice:

```bash
umask 077
node economics/hosting-cost-evidence.js \
  /ABSOLUTE/PRIVATE/x402-function-edge-aggregates.json
```

For a genuinely available, securely retained invoice export, supply a
**separately assembled, private** JSON transcription. Strict fields:
`schema_version`, `source`, `project_ref`, `function_slug`,
`billing_period_start`, `billing_period_end`, `invoice_reference`,
`organization_invocations_reported`,
`organization_function_invocation_charge_usd` and
`invoice_authenticity`. The opaque invoice reference must not encode
account numbers, email addresses, public payment links or keys.

**Synthetic example — not an actual invoice:**

```json
{
  "schema_version": 1,
  "source": "operator_private_supabase_invoice_transcription",
  "project_ref": "bvjtimsalbzkmulyinpg",
  "function_slug": "x402-data-tools",
  "billing_period_start": "2026-10-01T00:00:00Z",
  "billing_period_end": "2026-11-01T00:00:00Z",
  "invoice_reference": "synthetic_invoice_reference_001",
  "organization_invocations_reported": 1000000,
  "organization_function_invocation_charge_usd": "2.000000",
  "invoice_authenticity": "operator_supplied_not_verified"
}
```

Then run:

```bash
umask 077
node economics/hosting-cost-evidence.js \
  /ABSOLUTE/PRIVATE/x402-function-edge-aggregates.json \
  /ABSOLUTE/PRIVATE/supabase-invoice-transcription.json
```

The log observation window must be contained by the claimed invoice period,
which may not exceed 32 days. The organization's reported invocation count
must be at least as large as the observed function's non-OPTIONS requests.
All USD amounts use exact integer micro-dollar parsing: negatives,
floating-point JSON money, unsupported precision, malformed timestamps,
duplicate or unknown input fields, and mismatched scopes fail closed.

## Financial interpretation

An **optional** hypothetical pro-rata share is displayed only when a private
invoice transcription exists:

`reported organization function-invocation charge × observed non-OPTIONS
function invocations ÷ reported organization invocations`

The calculation is performed with integer micro-USD arithmetic and rounded
**down**. It also models individual route shares. These results are
**illustrative equal-average allocations**, never booking entries or verified
incremental costs. Supabase quotas, million-invocation package rounding,
shared projects, log coverage and unrelated functions make the true marginal
cost non-proportional. A transcription reporting **$0** still does not prove
zero hosting cost per external sale or unlimited free capacity. Without an
invoice, every hypothetical allocation remains `null`.

The following report fields always remain fail-closed:

- `actual_x402_function_charge_usd: null`
- `actual_invoice_cost_per_confirmed_sale_usd: null`
- `actual_source_api_cost_per_confirmed_sale_usd: null`
- `actual_retry_refund_cost_per_confirmed_sale_usd: null`
- `actual_net_margin_percent: null`
- `proven_sales_count: null`
- `unattended_product_launch_authorized: false`
- `automatic_price_changes: false`
- `product_025_unlock_evidence: false`

Observed HTTP 200 on a paid route is still **unverified** as settlement or
external buyer demand. A transaction transfer is not automatically a sale.
Configured direct-source fees of $0 in staged Products 003–007 do not prove
hosting, throttling, support or marginal delivery costs are zero.

## Remaining evidence required

Collect a real, suitably reviewed organization-wide Supabase billing and
usage statement for a common completed period. Validate quotas, the actual
function's share, the unrelated shared-project workload, billable egress,
source-provider charges, errors/retries/refunds, and **verified real purchases**
using the correct paid seller. Only then is attributable cost per proven sale
potentially computable. Do not override the existing economic launch gates.

## Reproduce (offline, synthetic fixtures only)

```bash
node --test \
  economics/phase1-five-product-costs.test.js \
  economics/live-fee-economics.test.js \
  economics/supabase-usage-readiness.test.js \
  economics/hosting-cost-evidence.test.js
```

No production deploy, real payment, invoice mutation, price change,
new numbered product or background task is authorized by this work.
