# Product 003 deployment plan — PA Vendor Identity Match x402

Status: staging implementation complete and live-source verified. Production deployment is intentionally deferred while AppDeploy deployment credits are blocked.

## Product contract

- Route: `GET /api/pa-vendor-identity-match`
- Price: `$0.005 USDC`
- Atomic amount: `5000`
- Network: `eip155:8453`
- Asset: Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- payTo: `0x708f7b52b56eafd7fc1de65fc7752ed732914021`
- Decisions: `consistent` or `human_review`
- Automatic rejection: none

Required query fields:
- `company`
- `address`
- `domain`

## Authoritative sources

The production implementation must call authoritative sources directly. It must not call the seller's own paid x402 component routes and must not rely on their `/api/demo` endpoints.

### Pennsylvania registry

`https://data.pa.gov/resource/xvd7-5r2c.json`

Use the existing Product 001 name canonicalization, ranking and ambiguity rules.

Automatic consistency requires:
- one strong legal-entity candidate,
- no competing strong candidate,
- business name,
- filing number,
- registration type,
- usable registered address.

### U.S. Census address evidence

`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress`

Parameters:
- `benchmark=Public_AR_Current`
- `vintage=Current_Current`
- `format=json`

Geocode both:
1. buyer-supplied address,
2. selected PA registry address.

Automatic consistency requires:
- both addresses matched,
- same Census-normalized primary street number,
- same ZIP,
- coordinate distance <= 0.25 miles.

### Domain evidence

Bootstrap:
`https://data.iana.org/rdap/dns.json`

Use the TLD's authoritative RDAP server and query:
`<rdap-base>/domain/<domain>`

A 404 from the authoritative registry is a valid `registered=false` result.

Automatic consistency requires:
- authoritative RDAP service resolved,
- domain is registered,
- supplied company name plausibly aligns with the domain hostname.

## x402 ordering

The implementation must preserve this exact sequence:

1. No payment header -> HTTP 402.
2. Decode and validate the v2 payment payload.
3. Validate company/address/domain input.
4. Verify the payment with the facilitator.
5. Fetch and validate all required source evidence.
6. If a required source transport/contract failure occurs -> HTTP 502, `chargeable:false`, do not settle.
7. For completed evidence, produce `consistent` or `human_review`.
8. Settle the same verified payment.
9. If settlement is unresolved -> HTTP 503 and instruct caller to retry the same payment authorization.
10. Only after confirmed settlement -> HTTP 200 with `PAYMENT-RESPONSE` and `x402-settled:true`.

A completed contradictory evidence result is chargeable and may legitimately return `human_review`. Infrastructure/source failure is not chargeable.

## Discovery changes

Add Product 003 to all generated/public discovery surfaces:

- `/.well-known/x402`
- `/.well-known/x402.json`
- resource-array catalog, if separately exposed
- `/openapi.json`
- `/llms.txt`
- `/llms-full.txt`
- skill documentation
- landing product list, if applicable

The Product 003 resource must contain its own resource-level `accepts[]`, not only top-level payment requirements.

OpenAPI operationId:
`matchPennsylvaniaVendorIdentity`

## Claim boundary

A `consistent` result means only that the supplied company name, address and domain agree with the configured public-evidence checks.

It does not establish:
- good standing,
- ownership,
- authority to contract,
- sanctions clearance,
- fraud risk,
- creditworthiness,
- legal/compliance approval,
- control of an address,
- ownership/control of a domain.

## Pre-deploy evidence already obtained

- deterministic decision tests: passing
- source-adapter tests: passing
- shared x402 payment tests: passing
- paid-handler ordering tests: passing
- discovery metadata tests: passing
- zero-spend live-source smoke: passing
- live example: OpenAI OpCo / Harrisburg registered address / openai.com -> `consistent`

## Deployment blocker

AppDeploy deployment is currently account-limit blocked.

Observed reset information:
- daily reset: 2026-10-03T00:00:00Z
- weekly reset: 2026-10-05T00:00:00Z

Do not pay for an upgrade or retry deployment before the applicable reset unless explicitly authorized.

## Post-deploy acceptance

Before marketplace submission:

1. Unpaid Product 003 request returns 402.
2. 402 advertises exactly 5000 atomic USDC on Base.
3. payTo and USDC address match the constants above.
4. malformed/oversized payment headers fail safely.
5. invalid product input does not trigger settlement.
6. required-source outage does not trigger settlement.
7. valid payment + valid evidence returns 200 only after settlement.
8. PAYMENT-RESPONSE is present after settlement.
9. OpenAPI exposes Product 003.
10. x402 catalogs contain Product 003 with resource-level accepts.
11. existing Product 001 and 002 routes/prices remain unchanged.
12. production smoke and regression suite pass.
