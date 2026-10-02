# Product 006 deployment plan — SEC Filing Freshness Check x402

Status: **live-source-verified staging**. Production deployment is deferred only because AppDeploy remains account-limit paused.

## Contract

- Route: `GET /api/sec-filing-freshness`
- Price: `$0.005 USDC`
- Atomic amount: `5000`
- Network: `eip155:8453`
- Inputs: exactly one of `ticker` or digit-only `cik`; optional exact `form`; optional `maxAgeDays` 1–365 (default 30)
- Decisions: `recent_filing`, `no_recent_filing`, `company_not_found`

## Authoritative sources

- ticker map: `https://www.sec.gov/files/company_tickers.json`
- submissions: `https://data.sec.gov/submissions/CIK##########.json`
- filing URLs: SEC EDGAR Archives

The adapter uses the declared client identity already proven by the existing SEC Recent Filings product:

`x402-sec-filings/1.0 https://sec-recent-filings-x402-f9qatj.v2.appdeploy.ai`

A generic GitHub User-Agent was rejected by SEC/Akamai; the declared production-style identity returned HTTP 200 for both the ticker map and AAPL submissions.

## Freshness rule

Freshness is based on SEC `filingDate` calendar dates in UTC.

The cutoff is computed from the UTC start of the checked calendar day minus `maxAgeDays`. A filing on the cutoff calendar date counts as recent regardless of the time of day the check runs.

## Source contract

The SEC `filings.recent` payload must provide aligned arrays for:
- `form`
- `filingDate`
- `accessionNumber`
- `primaryDocument`

Missing or misaligned required arrays are treated as source-contract failure, not as `no_recent_filing`.

Ticker aliases normalize dotted forms such as `BRK.B` to SEC's `BRK-B` convention.

## x402 ordering

`402 -> validate input -> verify payment -> SEC lookup -> settle -> 200`

- invalid input: 400, no settlement
- SEC transport/contract failure: 502, `chargeable:false`, no settlement
- unresolved verification/settlement: 503, retry same authorization
- completed result: settle before HTTP 200

## Claim boundary

The product reports SEC filing metadata and date freshness only.

It does not:
- interpret filing contents,
- determine materiality,
- determine whether a filing is positive/negative,
- provide investment advice,
- establish that no disclosure occurred outside the requested form or EDGAR metadata window.

## Verification completed

- SEC source-adapter tests: passing
- declared SEC User-Agent verification: passing
- strict ticker/CIK normalization: passing
- dotted ticker alias test: passing
- malformed/misaligned SEC array contract tests: passing
- deterministic freshness tests: passing
- x402 payment ordering tests: passing
- resource-level `accepts[]` discovery tests: passing
- live SEC smoke: passing

Live smoke on 2026-10-02:
- ticker: `AAPL`
- resolved CIK: `0000320193`
- source: U.S. Securities and Exchange Commission EDGAR
- decision: `recent_filing`
- latest observed filing date: `2026-10-01`

## Deployment blocker

AppDeploy reported an account-wide weekly Free-tier pause until:

`2026-10-05T00:00:00Z`

No upgrade/payment is authorized.

## Required post-deploy acceptance

1. Confirm live AAPL lookup resolves to CIK `0000320193`.
2. Confirm unpaid Product 006 returns exact 402 / 5000 atomic USDC.
3. Confirm malformed/oversized payment headers fail safely.
4. Confirm invalid input does not settle.
5. Confirm SEC source/contract failure does not settle.
6. Confirm completed evidence settles before 200.
7. Confirm x402 catalogs expose resource-level `accepts[]`.
8. Confirm Products 001–005 remain unchanged.


## SEC automated-access identity

Production must configure `SEC_USER_AGENT` with an organization/product identifier and a real monitored contact email, consistent with SEC automated-access guidance.

The staging SEC adapter intentionally refuses real SEC HTTP calls when the configured User-Agent lacks a contact email. This avoids shipping an undeclared automated client.

Example shape only:

`Your Organization your-contact@example.com`

Do not hard-code or invent a personal contact address in source control.

The GitHub Actions live smoke remains source-blocked unless that configuration is intentionally supplied. A GitHub-runner SEC 403 must not be reclassified as a product-data result.
