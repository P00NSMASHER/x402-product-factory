# Generated product catalogue

Generated from `specs/*.json` by `scripts/generate-spec-artifacts.js`. Do not hand-edit.

## 003 pa-vendor-identity-match

Determine whether a prospective Pennsylvania vendor's submitted company name, address, and domain are mutually consistent with authoritative public identity evidence.

- Endpoint: `GET /api/pa-vendor-identity-match`
- Price: **$0.005000 USDC**
- Decisions: `consistent`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services; IANA DNS bootstrap plus authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **53.8%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `address` (string; required, minLength=5, maxLength=240)
- `domain` (string; required, minLength=3, maxLength=253)

### Decision rules

- Require a unique strong Pennsylvania registry match.
- Require both supplied and registry addresses to geocode, share the primary street number and ZIP, and be within 0.25 miles.
- Require authoritative RDAP to confirm the domain is registered and deterministic company/domain name alignment to pass.
- Return consistent only when every check passes; otherwise return human_review.

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; caller should retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-003.js`
- Release gate passes from the same registry revision.
- Authoritative live-source smoke passes without source failures.
- Shared non-credit-gated hosting is available and measured.
- Commercial promotion remains blocked until complete unit economics meet the target or an explicit exception is approved.

## 004 pa-business-address-match

Check whether a submitted Pennsylvania business address is consistent with the address of a uniquely resolved Pennsylvania registry entity.

- Endpoint: `GET /api/pa-business-address-match`
- Price: **$0.003000 USDC**
- Decisions: `match`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `address` (string; required, minLength=5, maxLength=240)

### Decision rules

- Require a unique strong Pennsylvania registry match.
- Require both submitted and registry addresses to geocode.
- Require matching primary street number and ZIP.
- Require geocoded distance at or below 0.25 miles.
- Return match only when all checks pass; otherwise return human_review.

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; caller should retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-004.js`
- Release gate passes from the same registry revision.
- Authoritative live-source smoke passes without source failures.
- Shared non-credit-gated hosting is available and measured.
- Commercial promotion remains blocked until complete unit economics meet the target or an explicit exception is approved.

## 005 pa-business-domain-match

Check whether a supplied registered domain plausibly aligns with the name of a uniquely resolved Pennsylvania business entity.

- Endpoint: `GET /api/pa-business-domain-match`
- Price: **$0.003000 USDC**
- Decisions: `match`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; IANA DNS bootstrap plus authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `domain` (string; required, minLength=3, maxLength=253)

### Decision rules

- Require a unique strong Pennsylvania registry match.
- Require authoritative RDAP to confirm the supplied domain is registered.
- Require deterministic company/domain name alignment.
- Return match only when all checks pass; otherwise return human_review.

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; caller should retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-005.js`
- Release gate passes from the same registry revision.
- Authoritative live-source smoke passes without source failures.
- Shared non-credit-gated hosting is available and measured.
- Commercial promotion remains blocked until complete unit economics meet the target or an explicit exception is approved.

## 006 sec-filing-freshness

Determine whether a U.S. public filer has an SEC EDGAR filing matching an optional exact form filter inside a caller-selected freshness window.

- Endpoint: `GET /api/sec-filing-freshness`
- Price: **$0.005000 USDC**
- Decisions: `recent_filing`, `no_recent_filing`, `company_not_found`
- Sources: U.S. Securities and Exchange Commission EDGAR
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **53.8%**

### Inputs

- `ticker` (string; exactly_one_of_ticker_or_cik, minLength=1, maxLength=12)
- `cik` (string; exactly_one_of_ticker_or_cik)
- `form` (string; optional, maxLength=20)
- `maxAgeDays` (integer; optional, default=30, min=1, max=365)

### Decision rules

- Require exactly one of ticker or CIK.
- Resolve ticker to CIK when ticker is supplied.
- Filter recent SEC filing metadata by exact normalized form when form is supplied.
- Compute a UTC-day cutoff from maxAgeDays.
- Return recent_filing when at least one dated matching filing is on or after the cutoff; otherwise return no_recent_filing; return company_not_found only for a valid lookup that does not resolve a company.

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment. Live SEC transport also requires SEC_USER_AGENT containing a contact email.
- Payment unresolved: HTTP 503; caller should retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `source-contract-verified-staging`
- Release gate: `scripts/validate-product-006.js`
- Release gate and deterministic/source-contract tests pass.
- Production SEC_USER_AGENT contains a declared client identity and real contact email.
- Live SEC transport smoke passes under production-style identification.
- Shared non-credit-gated hosting is available and measured.
- Commercial promotion remains blocked until complete unit economics meet the target or an explicit exception is approved.

## 007 domain-registration-age

Determine whether an authoritative RDAP domain registration date is at least a caller-selected minimum age.

- Endpoint: `GET /api/domain-registration-age`
- Price: **$0.002000 USDC**
- Decisions: `established`, `recent_registration`, `unregistered`, `human_review`
- Sources: IANA DNS bootstrap plus authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **-15.5%**

### Inputs

- `domain` (string; required, minLength=3, maxLength=253)
- `minAgeDays` (integer; optional, default=90, min=1, max=3650)

### Decision rules

- Use authoritative RDAP registration/registered event date when present.
- Compute domain age at UTC day granularity.
- Return unregistered when authoritative RDAP reports the domain is not registered.
- Return established when registration date is on or before the minimum-age cutoff; return recent_registration when newer; return human_review when required RDAP evidence or registration date is unavailable.

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; caller should retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-007.js`
- Release gate passes from the same registry revision.
- Authoritative live-source smoke passes without source failures.
- Shared non-credit-gated hosting is available and measured.
- Post-allowance unit economics are settlement-negative at the current price; commercial promotion remains blocked until economics are repaired or an explicit exception is approved.

