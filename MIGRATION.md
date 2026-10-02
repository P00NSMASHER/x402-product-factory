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

## Preferred cutover

Expand the existing Floot PA seller **additively**:

1. Preserve the existing PA best-match and PA search routes unchanged.
2. Add vendor-intake, SEC, Census, OFAC, RDAP, and Treasury implementations directly on the same Floot origin.
3. Update OpenAPI and `/.well-known/x402` to the 8-route catalog.
4. Run unpaid 402 probes for every paid route.
5. Verify discovery paths remain 200.
6. Publish.
7. Re-run x402scan discovery against the unique Floot origin.
8. Let Agent402's crawler pick up the expanded origin.
9. Keep AppDeploy copies as fallback/reference until the new seller has proven live traffic.

## Agent402 routing facts

- Base proven-seller threshold currently requires 20 outside settlements and 3 distinct payers.
- The confirmed 2026-10-02 outside $0.001 settlement counts toward that proven threshold.\n- The unproven Base lane is enabled for routes priced at or below $0.01.
- Therefore the $0.001 and $0.005 SKUs can be tried before they meet the full settlement-history floor.
- The $0.020 vendor-intake gate is above the unproven ceiling and needs independent settlement history/direct discovery.

