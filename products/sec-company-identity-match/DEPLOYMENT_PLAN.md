# Product 013 deployment plan — SEC Public Company Identity Match x402

Status: source-contract-verified staging candidate. Live SEC EDGAR calls require a deployment `SEC_USER_AGENT` that includes a declared client identity and real contact email.

## Contract

- Route: `GET /api/sec-company-identity-match`
- Price: `$0.003 USDC`
- Atomic amount: `3000`
- Network: `eip155:8453`
- Inputs:
  - `company`
  - exactly one of `ticker` or `cik`
- Decisions:
  - `match`
  - `human_review`
  - `company_not_found`
- No automatic rejection.

## Source

U.S. Securities and Exchange Commission EDGAR:
- ticker map: `https://www.sec.gov/files/company_tickers.json`
- submissions: `https://data.sec.gov/submissions/CIK##########.json`

The shared SEC adapter requires `SEC_USER_AGENT` with a contact email before making live calls.

## Decision rule

A `match` requires:
- the ticker/CIK resolves to an SEC company,
- the supplied expected company name and SEC company name are exactly equal after conservative punctuation and common corporate-suffix normalization.

A resolved but different company name returns `human_review`.

A completed identifier lookup that does not resolve returns `company_not_found`.

## x402 ordering

`402 -> validate input -> verify payment -> SEC source work -> settle -> 200`

- invalid input: HTTP 400, no settlement
- SEC/source/configuration failure: HTTP 502, `chargeable:false`, no settlement
- unresolved payment state: HTTP 503, retry the same authorization
- completed identity result: settle, then HTTP 200

## Discovery

Publish through:
- `/.well-known/x402`
- `/.well-known/x402.json`
- `/.well-known/x402-catalog.json`
- OpenAPI
- product index
- llms text
- release bundle

The resource must contain its own `accepts[]`.

OpenAPI operationId:
`matchSecPublicCompanyIdentity`

## Claim boundary

A `match` is an SEC identity-consistency result only. It is not:
- investment advice,
- proof of current good standing,
- proof of ownership,
- proof of authority,
- fraud/sanctions/credit analysis,
- legal/compliance approval.

`company_not_found` means only that the checked SEC identifier did not resolve in the public SEC data used by this product.

## Deployment prerequisites

1. Set `SEC_USER_AGENT` to a declared client identity plus a real contact email.
2. AppDeploy deployment/app-usage limits must be available.
3. Do not invent or embed a fake contact email.

## Current blockers

- `SEC_USER_AGENT` is intentionally not invented or committed.
- AppDeploy weekly Free-tier reset recorded as `2026-10-05T00:00:00Z`.

## Post-deploy acceptance

1. Unpaid request returns HTTP 402 with 3000 atomic USDC on Base.
2. Exactly one of ticker/CIK is required.
3. Invalid input is rejected before facilitator verification.
4. Missing/invalid SEC configuration does not settle.
5. SEC transport/contract failure does not settle.
6. Completed `match`, `human_review`, or `company_not_found` settles before 200.
7. Resource-level `accepts[]` appears in compiled discovery.
8. Products 001–012 remain unchanged.
