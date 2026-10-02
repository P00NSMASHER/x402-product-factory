# Durable x402 Seller Migration

## Objective

Move the factory's live products off credit-gated AppDeploy hosting without changing the seller wallet, Base USDC x402 v2 semantics, prices, or public-data behavior.

The durable production shape is **one unique seller origin** that serves both machine-readable discovery and the paid routes themselves.

## Confirmed traction

On 2026-10-02 an independent payer settled **0.001 USDC** to the seller wallet for the PA best-match SKU:

- Seller wallet: `0x708f7b52b56eafd7fc1de65fc7752ed732914021`
- Amount: `1000` atomic Base USDC = **$0.001**
- Transaction: `0x17985b16137ff8aef95641be06424a5fa4e9edacc6ade5aaf0a58d523ad1cd73`
- Agent402 confirmed the payer was **not** its router.
- Public chain history shows the payer makes many small USDC payments to many distinct sellers, consistent with recurring machine/pay-per-call usage.

## Production routes

| Route | Price |
| --- | ---: |
| `GET /api/pa-entity-one?q=...` | $0.001 |
| `GET /api/pa-business?q=...&limit=...` | $0.005 |
| `GET /api/vendor-intake-gate?name=...&address=...&domain=...` | $0.020 |
| `GET /api/sec-filings?ticker=...&form=...&limit=...` | $0.005 |
| `GET /api/us-address-geocode?address=...` | $0.005 |
| `GET /api/ofac-sdn-screen?name=...&limit=...&minScore=...` | $0.005 |
| `GET /api/domain-rdap?domain=...` | $0.005 |
| `GET /api/treasury-average-rates?security=...` | $0.005 |

## Payment contract

All paid routes must preserve:

- x402 version: `2`
- scheme: `exact`
- network: `eip155:8453`
- asset: Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- payTo: `0x708f7b52b56eafd7fc1de65fc7752ed732914021`
- EIP-712 domain: `extra.name = "USD Coin"`, `extra.version = "2"`
- facilitator: `https://facilitator.payai.network`

Flow:

1. No payment header -> return HTTP 402 + `PAYMENT-REQUIRED`.
2. Decode x402 v2 payment payload.
3. Validate inputs only after a payment challenge can be obtained.
4. Verify with facilitator.
5. Fetch authoritative source data.
6. If upstream source fails, do **not** settle.
7. Settle the same payment.
8. Return result with `PAYMENT-RESPONSE` and `x402-settled: true`.

## Discovery contract

These paths must always return HTTP 200 without a payment requirement:

- `/.well-known/x402`
- `/.well-known/x402.json`
- `/openapi.json`
- `/skill.md`
- `/llms.txt`
- `/robots.txt`
- `/health`

Every paid OpenAPI operation must include:

- `x-payment-info.price` with fixed decimal USD amount
- `x-payment-info.protocols: [{ "x402": {} }]`
- request/query schemas and examples
- a documented HTTP 402 response
- a JSON 200 response schema

The x402 challenge resource metadata should use a printable ASCII `serviceName` of 32 characters or fewer and no more than 5 searchable tags.

## Authoritative public sources

- PA Department of State: `https://data.pa.gov/resource/xvd7-5r2c.json`
- SEC EDGAR: `company_tickers.json` + `data.sec.gov/submissions/CIK##########.json`
- Census Geocoder: official Census one-line address geographies endpoint
- OFAC: Sanctions List Service `SDN.CSV` + `ALT.CSV`
- RDAP: IANA DNS bootstrap -> authoritative registry RDAP
- Treasury: Fiscal Data `avg_interest_rates`

## Current hosting facts

- AppDeploy currently credit-gates the six seller origins when its weekly allowance is exhausted, including discovery files. That makes the sellers disappear from crawlers even though application source is correct.
- Agent402 supports AppDeploy path-prefix sellers, but it cannot crawl a discovery document that itself returns 402.
- A discovery-only aggregate origin cannot claim paid routes hosted on a different origin.
- Replit publication is currently blocked by an account-level usage restriction.
- The existing `pa-entity-x402.floot.app` origin is live, healthy, already discoverable, and has received the confirmed independent purchase.

## Production cutover

The durable split is now:

1. **Keep PA on Floot** at `https://pa-entity-x402.floot.app` so its existing outside settlement and Agent402 route history remain attached to the proven seller.
2. **Run SEC, OFAC, Census, RDAP, and Treasury on Supabase** at:
   `https://bvjtimsalbzkmulyinpg.supabase.co/functions/v1/x402-data-tools`
3. The Supabase seller is an ACTIVE public Edge Function (`verify_jwt=false` because x402 is the payment/auth layer), with no AppDeploy runtime dependency.
4. Free discovery endpoints return HTTP 200:
   - `/.well-known/x402`
   - `/.well-known/x402.json`
   - `/openapi.json`
   - `/llms.txt`
   - `/skill.md`
   - `/health`
5. All five paid routes return HTTP 402 when unpaid and preserve the existing $0.005 Base USDC x402 v2 contract:
   - `/api/sec-filings`
   - `/api/ofac-sdn-screen`
   - `/api/us-address-geocode`
   - `/api/domain-rdap`
   - `/api/treasury-average-rates`
6. The Supabase implementation fetches the authoritative public sources directly and only settles after a source result is available.
7. Agent402 was asked to crawl/index the new path-prefixed Supabase seller as the replacement for the five AppDeploy sellers.
8. Keep the AppDeploy copies only as fallback/reference; they are not the durable production origin while platform credit gating can paywall discovery.

### Registry compatibility note

- Agent402 explicitly supports path-prefixed sellers, so the Supabase function origin is compatible with its crawler/router model.
- x402scan currently canonicalizes a submitted URL to the bare host and therefore reports `No discovery document found` for this path-prefixed Supabase seller. That is a registry limitation, not a failure of the seller: direct public checks confirm the Supabase discovery files return 200 and all five paid routes return 402.
- Do not move the PA Floot seller merely to unify hosting; retaining its seller identity preserves the outside-settlement and unproven-routing history already attached to it.

## Agent402 routing facts

- Base proven-seller threshold currently requires 20 outside settlements and 3 distinct payers.
- The confirmed 2026-10-02 outside $0.001 settlement counts toward that proven threshold.
- The unproven Base lane is enabled for routes priced at or below $0.01.
- Therefore the $0.001 and $0.005 SKUs can be tried before they meet the full settlement-history floor.
- The $0.020 vendor-intake gate is above the unproven ceiling and needs independent settlement history/direct discovery.



## Distribution status — 2026-10-02

- Agent402 currently ranks the Floot PA seller first for both `Pennsylvania business registry lookup` and `Pennsylvania vendor verification` route queries.
- The PA $0.001 and $0.005 route rows carry `base.unprovenTier: true`, `unprovenMaxUsd: 0.01`, and an `executeVia` route despite the seller-level `settlement_required` label.
- Agent402 confirmed the first $0.001 settlement was from an outside buyer, not its own router.
- BotMarket dry-run validation passed for all six seller/product landing origins with the intended Base USDC prices.
- BotMarket manual-review submissions:
  - #30 PA Entity Lookup — $0.001 USDC
  - #31 SEC Recent Filings — $0.005 USDC
  - #32 OFAC SDN Name Screen — $0.005 USDC
  - #33 US Census Address Geocoder — $0.005 USDC
  - #34 Domain RDAP Lookup — $0.005 USDC
  - #35 Treasury Average Interest Rates — $0.005 USDC
- BotMarket accepted each submission with HTTP 200 and `status=queued`. Its automatic registry-PR step currently fails internally with `[SHA]: Required`, so all six are awaiting manual review; the maintainer was notified with the submission IDs.
- The AppDeploy copies remain unsuitable for Agent402 routing while platform-level credit gating causes their discovery files to return HTTP 402. Do not confuse AppDeploy deployment status `ready` with crawler availability.


## Supabase replacement seller — 2026-10-02

- Supabase project: `bvjtimsalbzkmulyinpg` (`Facility Bid Watch Validation`, us-east-1)
- Edge Function: `x402-data-tools`
- Deployment status: `ACTIVE`
- Verified function version: `3`
- Public seller origin: `https://bvjtimsalbzkmulyinpg.supabase.co/functions/v1/x402-data-tools`
- Seller root returns the five production route paths and Base network.
- `/.well-known/x402` and `/openapi.json` were independently fetched over public HTTPS and advertise the correct HTTPS seller origin.
- All five unpaid production routes were independently probed and returned HTTP 402.
- Payment requirements advertise Base USDC with EIP-712 `extra.name = "USD Coin"`, `extra.version = "2"`, amount `5000`, and the existing seller wallet.
- The first deployment exposed Supabase's internal rewritten HTTP URL in generated metadata; version 3 fixed the public base to the external HTTPS `/functions/v1/x402-data-tools` origin and was re-verified.


## Current cutover

The five AppDeploy data APIs have been ported to one isolated Supabase Edge Function:

`https://bvjtimsalbzkmulyinpg.supabase.co/functions/v1/x402-data-tools`

Live paid routes:

- `/api/sec-filings`
- `/api/ofac-sdn-screen`
- `/api/us-address-geocode`
- `/api/domain-rdap`
- `/api/treasury-average-rates`

Cutover verification:

1. `/health`, `/.well-known/x402`, and `/openapi.json` return public HTTP 200.
2. Every paid route returns HTTP 402 when unpaid.
3. `PAYMENT-REQUIRED` advertises x402 v2 exact payment on Base, amount 5000 atomic USDC, the existing seller wallet, `extra.name = "USD Coin"`, `extra.version = "2"`, and Bazaar metadata.
4. Agent402 self-registration returned `listed: true`, `toolCount: 5`, `health: 1`, and `routable: true`.
5. Exact-name Agent402 route queries rank each migrated tool #1 and expose `unprovenTier: true` with `unprovenMaxUsd: 0.01`.
6. The deployed source is preserved at `deploy/supabase-x402-data-tools/index.ts`.
7. The PA Floot seller remains unchanged so its existing outside-sale history and route identity are preserved.
8. AppDeploy copies remain fallback/reference only while their platform-level discovery paths are credit-gated.

x402scan currently canonicalizes this path-prefixed Supabase seller to the bare host and therefore does not discover it. Agent402 supports path-prefixed sellers, so this does not block Agent402 routing.
