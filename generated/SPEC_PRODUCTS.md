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

## 008 treasury-average-rate-threshold

Compare the latest official monthly weighted-average interest rate for one Treasury security category to a caller threshold.

- Endpoint: `GET /api/treasury-average-rate-threshold`
- Price: **$0.003000 USDC**
- Decisions: `threshold_met`, `threshold_not_met`, `human_review`
- Sources: U.S. Treasury Fiscal Data monthly Average Interest Rates on U.S. Treasury Securities
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `security` (string; required, minLength=2, maxLength=100)
- `thresholdPercent` (number; required, min=0, max=100)
- `operator` (string; optional, default=gte)

### Decision rules

- Require one unambiguous latest Treasury security category record with its published weighted-average rate.
- Compare ratePercent to thresholdPercent with operator gte/lte; it is not a live market yield.
- the source is the monthly weighted average interest rate on outstanding Treasury securities
- the result is not a live Treasury market yield
- the result is not a forecast or investment recommendation
- the result does not represent the rate on a specific new Treasury issuance

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-008.js`
- Pass existing exact-revision release gate and authoritative source smokes.
- Measure non-credit-gated production hosting, failures, refunds and source costs.
- Block commercial release until real margin and external demand are independently evidenced.

## 009 ofac-name-review-gate

Perform deterministic first-pass name/alias screening against the current OFAC SDN list and return whether one or more review candidates meet a caller-selected similarity threshold.

- Endpoint: `GET /api/ofac-name-review-gate`
- Price: **$0.003000 USDC**
- Decisions: `candidate_found`, `no_candidate`, `human_review`
- Sources: U.S. Treasury OFAC SDN names and aliases
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `name` (string; required, minLength=2, maxLength=160)
- `minScore` (integer; optional, default=90, min=70, max=100)

### Decision rules

- Compare names and aliases through current SDN similarity screening at minScore.
- Report candidates for human review; no_candidate is not legal sanctions clearance.
- candidate_found is a review signal, not a legal sanctions determination
- no_candidate is not sanctions clearance
- the product does not perform OFAC 50 Percent Rule ownership analysis
- identity resolution requires human review of identifiers and context

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-009.js`
- Pass existing exact-revision release gate and authoritative source smokes.
- Measure non-credit-gated production hosting, failures, refunds and source costs.
- Block commercial release until real margin and external demand are independently evidenced.

## 010 pa-business-formation-age

Determine whether a uniquely resolved Pennsylvania business entity is at least a caller-selected age using Pennsylvania Department of State creation-date evidence.

- Endpoint: `GET /api/pa-business-formation-age`
- Price: **$0.002000 USDC**
- Decisions: `established_entity`, `recent_entity`, `company_not_found`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **-15.5%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `minAgeDays` (integer; optional, default=365, min=1, max=36500)

### Decision rules

- Require strong, unique Pennsylvania business registry identity.
- Compare confirmed creation date against minAgeDays using UTC dates; missing or ambiguous evidence triggers review.
- formation age is an identity/history signal only
- it does not prove current good standing, ownership, authority, legitimacy, fraud risk, sanctions status, creditworthiness, or legal compliance
- creation date is taken from Pennsylvania public registry data and may be unavailable for some records

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-010.js`
- Pass existing exact-revision release gate and authoritative source smokes.
- Measure non-credit-gated production hosting, failures, refunds and source costs.
- Block commercial release until real margin and external demand are independently evidenced.

## 011 domain-expiration-horizon

Determine whether an authoritative RDAP registration expiration date falls within a caller-selected future horizon.

- Endpoint: `GET /api/domain-expiration-horizon`
- Price: **$0.002000 USDC**
- Decisions: `expiring_soon`, `not_expiring_soon`, `unregistered`, `human_review`
- Sources: IANA DNS bootstrap and authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **-15.5%**

### Inputs

- `domain` (string; required, minLength=3, maxLength=253)
- `horizonDays` (integer; optional, default=60, min=1, max=3650)

### Decision rules

- Require authoritative RDAP expiration event when registered.
- Compare expiration to today plus horizonDays; unknown registration or missing date requires review.
- expiration horizon is a domain-registration timing signal only
- registry renewal/grace/redemption policies vary and can change actual lifecycle outcomes
- it does not prove domain ownership, control, legitimacy, security, fraud risk, or business identity

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-011.js`
- Pass existing exact-revision release gate and authoritative source smokes.
- Measure non-credit-gated production hosting, failures, refunds and source costs.
- Block commercial release until real margin and external demand are independently evidenced.

## 012 domain-last-changed-recency

Determine whether an authoritative RDAP last-changed event falls within a caller-selected recent window.

- Endpoint: `GET /api/domain-last-changed-recency`
- Price: **$0.002000 USDC**
- Decisions: `recently_changed`, `stable_since_window`, `unregistered`, `human_review`
- Sources: IANA DNS bootstrap and authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **-15.5%**

### Inputs

- `domain` (string; required, minLength=3, maxLength=253)
- `maxAgeDays` (integer; optional, default=90, min=1, max=3650)

### Decision rules

- Require authoritative RDAP lastChanged event when registered.
- Compare lastChanged to today minus maxAgeDays using UTC dates; missing evidence requires review.
- recently_changed is a domain-registration metadata signal only
- a recent change does not by itself establish compromise, fraud, ownership change, malicious activity, or business risk
- registry event semantics and update behavior vary by TLD

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-012.js`
- Pass existing exact-revision release gate and authoritative source smokes.
- Measure non-credit-gated production hosting, failures, refunds and source costs.
- Block commercial release until real margin and external demand are independently evidenced.

## 013 sec-company-identity-match

Check whether a supplied expected company name matches the authoritative SEC EDGAR company identity resolved from exactly one ticker or CIK.

- Endpoint: `GET /api/sec-company-identity-match`
- Price: **$0.003000 USDC**
- Decisions: `match`, `human_review`, `company_not_found`
- Sources: U.S. Securities and Exchange Commission EDGAR
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `company` (string; required, minLength=2, maxLength=160)
- `ticker` (string; exactly_one_of_ticker_or_cik, minLength=1, maxLength=12)
- `cik` (string; exactly_one_of_ticker_or_cik)

### Decision rules

- Require an expected company name plus exactly one ticker or CIK, never both.
- Compare conservatively normalized expected name with the authoritative SEC-resolved company name.
- Never interpret an SEC identity match as legal status, beneficial ownership, fraud clearance or investment advice.
- match is only an SEC identity-consistency result
- it does not establish investment quality, current good standing, ownership, authority, fraud risk, sanctions status, creditworthiness, or legal compliance
- company_not_found means the queried identifier did not resolve in the checked SEC public data; it is not proof that the business does not exist

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `source-contract-verified-staging`
- Release gate: `scripts/validate-product-013.js`
- Exact-head existing product release gates and deterministic/source checks must pass.
- Authority-dependent live smokes and required production credentials (including SEC_USER_AGENT) must pass before any approved deployment.
- Complete unit economics and genuine independent external-buyer evidence are unavailable; do not authorize commercial release.

## 014 treasury-average-rate-trend

Compare the latest official monthly average interest rate for one Treasury security description with the prior month's rate and return a bounded directional signal.

- Endpoint: `GET /api/treasury-average-rate-trend`
- Price: **$0.003000 USDC**
- Decisions: `rising`, `falling`, `unchanged`, `human_review`
- Sources: U.S. Treasury Fiscal Data monthly Average Interest Rates on U.S. Treasury Securities
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `security` (string; required, minLength=2, maxLength=100)
- `minChangeBps` (integer; optional, default=1, min=1, max=1000)

### Decision rules

- Require the latest and prior monthly Treasury observations for exactly one unambiguous category.
- Compute rate change in basis points and return rising, falling or unchanged relative to minChangeBps.
- Do not describe a two-month comparison as a long-term trend or forecast.
- the result is a mechanical comparison of official monthly average-interest-rate records
- it is not an interest-rate forecast, investment advice, monetary-policy prediction, or recommendation
- a two-month directional comparison is not a long-term trend determination

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-014.js`
- Exact-head existing product release gates and deterministic/source checks must pass.
- Authority-dependent live smokes and required production credentials (including SEC_USER_AGENT) must pass before any approved deployment.
- Complete unit economics and genuine independent external-buyer evidence are unavailable; do not authorize commercial release.

## 015 treasury-average-rate-spread

Compare the latest official monthly weighted-average interest rates for two U.S. Treasury security categories from the same record date and classify their spread.

- Endpoint: `GET /api/treasury-average-rate-spread`
- Price: **$0.003000 USDC**
- Decisions: `left_higher`, `right_higher`, `within_tolerance`, `human_review`
- Sources: U.S. Treasury Fiscal Data monthly Average Interest Rates on U.S. Treasury Securities
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **23.0%**

### Inputs

- `leftSecurity` (string; required, minLength=2, maxLength=100)
- `rightSecurity` (string; required, minLength=2, maxLength=100)
- `toleranceBps` (number; optional, default=2, min=0, max=1000)

### Decision rules

- Require distinct security descriptions and two valid Treasury rate observations for the same record date.
- Compute left-minus-right spread in basis points and apply inclusive tolerance.
- A monthly average spread is not a live yield spread or trading signal.
- the source values are monthly weighted-average rates on outstanding Treasury securities
- the spread is not a live market yield spread
- the result is not a forecast, curve-trading signal, or investment recommendation

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-015.js`
- Exact-head existing product release gates and deterministic/source checks must pass.
- Authority-dependent live smokes and required production credentials (including SEC_USER_AGENT) must pass before any approved deployment.
- Complete unit economics and genuine independent external-buyer evidence are unavailable; do not authorize commercial release.

## 016 pa-entity-ofac-review

Resolve a prospective Pennsylvania company to a unique legal entity, then run deterministic current OFAC SDN primary-name and alias screening against the resolved legal name.

- Endpoint: `GET /api/pa-entity-ofac-review`
- Price: **$0.005000 USDC**
- Decisions: `candidate_found`, `no_candidate`, `company_not_found`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; U.S. Treasury OFAC SDN names and aliases
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **53.8%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `minScore` (integer; optional, default=90, min=70, max=100)

### Decision rules

- Resolve a unique strong Pennsylvania legal entity before screening the legal name, not the raw submitted name.
- Use deterministic current OFAC name/alias candidates at caller-selected minScore.
- A candidate is for review; no_candidate is not sanctions clearance or 50 Percent Rule ownership analysis.
- candidate-name screening only; a candidate is not a legal sanctions determination
- no_candidate is not sanctions clearance
- OFAC 50 Percent Rule ownership analysis is not included
- a Pennsylvania registry match does not prove good standing, ownership, or authority to contract

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-016.js`
- Exact-head existing product release gates and deterministic/source checks must pass.
- Authority-dependent live smokes and required production credentials (including SEC_USER_AGENT) must pass before any approved deployment.
- Complete unit economics and genuine independent external-buyer evidence are unavailable; do not authorize commercial release.

## 017 pa-vendor-new-domain-review

Resolve a prospective Pennsylvania vendor to a unique legal entity, verify the supplied domain plausibly aligns with that resolved legal name, and flag recently registered domains for human review.

- Endpoint: `GET /api/pa-vendor-new-domain-review`
- Price: **$0.005000 USDC**
- Decisions: `established_domain_match`, `recent_domain_review`, `domain_mismatch`, `unregistered_domain`, `company_not_found`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; IANA DNS bootstrap and authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **53.8%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `domain` (string; required, minLength=3, maxLength=253)
- `minDomainAgeDays` (integer; optional, default=90, min=1, max=3650)

### Decision rules

- Resolve a unique strong Pennsylvania legal entity before checking authoritative RDAP.
- Domain-name alignment uses the resolved legal name and is not ownership verification.
- Classify domain registration age at UTC-day granularity; recent registration is a review flag, never fraud proof.
- domain-name alignment is a deterministic heuristic and does not prove domain ownership or control
- recent registration is a review signal, not proof of fraud
- an established domain is not proof that a vendor is safe or trustworthy
- a Pennsylvania registry match does not prove good standing, ownership, or authority to contract

### Failure behavior

- Invalid input: HTTP 400; payment is not settled.
- Required source failure: HTTP 502 with chargeable=false; payment is not settled.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-017.js`
- Exact-head existing product release gates and deterministic/source checks must pass.
- Authority-dependent live smokes and required production credentials (including SEC_USER_AGENT) must pass before any approved deployment.
- Complete unit economics and genuine independent external-buyer evidence are unavailable; do not authorize commercial release.

## 018 pa-vendor-counterparty-review

Give an autonomous agent a bounded proceed or human_review decision for a prospective Pennsylvania vendor using legal-entity identity, OFAC SDN candidate-name screening, and domain registration/name/age evidence.

- Endpoint: `GET /api/pa-vendor-counterparty-review`
- Price: **$0.010000 USDC**
- Decisions: `proceed`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; U.S. Treasury OFAC SDN names and aliases; IANA DNS bootstrap plus authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **76.9%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `domain` (string; required, minLength=3, maxLength=253)
- `minScore` (integer; optional, default=90, min=70, max=100)
- `minDomainAgeDays` (integer; optional, default=90, min=1, max=3650)

### Decision rules

- Resolve a unique strong Pennsylvania legal entity before OFAC screening or RDAP legal-name alignment.
- Require no current OFAC name candidates at configured score, legal-name-aligned registered RDAP domain, and domain age at or above minDomainAgeDays.
- Any uncertain, conflicting, recent-domain, name-candidate, or missing required evidence is human_review, never a legal clearance.
- proceed is only a workflow signal that configured review triggers were not hit
- a no-candidate OFAC name result is not sanctions clearance
- OFAC 50 Percent Rule ownership analysis is not included
- domain registration/name alignment does not prove domain ownership or control
- recent domain registration is a review signal, not proof of fraud
- a Pennsylvania registry match does not prove good standing, ownership, authority to contract, creditworthiness, or legal compliance

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-018.js`
- Existing exact-revision release gate and deterministic tests must pass before a reviewed deployment.
- Independently verify authoritative-source availability, payment identity, and current facilitator fee/allowance terms.
- Commercial release remains blocked until true hosting/source/refund economics and independently verified customer demand are established.

## 019 pa-vendor-maturity-review

Review whether a prospective Pennsylvania vendor has both an established legal-entity history and an established legal-name-aligned domain history before an automated workflow continues.

- Endpoint: `GET /api/pa-vendor-maturity-review`
- Price: **$0.007000 USDC**
- Decisions: `established_vendor`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; IANA DNS bootstrap plus authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **67.0%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `domain` (string; required, minLength=3, maxLength=253)
- `minEntityAgeDays` (integer; optional, default=30, min=1, max=36500)
- `minDomainAgeDays` (integer; optional, default=90, min=1, max=3650)

### Decision rules

- Require one strong unique PA entity with usable creation date at least minEntityAgeDays old.
- Require authoritative RDAP registered domain aligned to resolved legal name and registered at least minDomainAgeDays ago.
- Missing or young entity/domain records require human_review and do not establish fraud or safety.
- established_vendor is a maturity/history workflow signal only
- entity age does not establish current good standing, ownership, authority, legitimacy, creditworthiness, or legal compliance
- domain age and legal-name alignment do not prove domain ownership or control
- older entity/domain history is not proof a vendor is safe or trustworthy
- recent entity or domain registration is a review signal, not proof of fraud

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-019.js`
- Existing exact-revision release gate and deterministic tests must pass before a reviewed deployment.
- Independently verify authoritative-source availability, payment identity, and current facilitator fee/allowance terms.
- Commercial release remains blocked until true hosting/source/refund economics and independently verified customer demand are established.

## 020 pa-vendor-domain-continuity-review

Review whether a prospective Pennsylvania vendor's legal-name-aligned domain has sufficient expiration runway and has not changed too recently for automated continuation.

- Endpoint: `GET /api/pa-vendor-domain-continuity-review`
- Price: **$0.006000 USDC**
- Decisions: `stable_domain`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; IANA DNS bootstrap plus authoritative registry RDAP
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **61.5%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `domain` (string; required, minLength=3, maxLength=253)
- `minExpirationDays` (integer; optional, default=180, min=1, max=3650)
- `minStableDays` (integer; optional, default=30, min=1, max=3650)

### Decision rules

- Require one unique strong PA entity and an authoritative registered domain aligned to the resolved legal name.
- Require expiration runway of at least minExpirationDays and lastChanged age of at least minStableDays.
- Incomplete evidence or policy failures produce human_review; stability is not proof of ownership, safety or continuity guarantees.
- stable_domain is a continuity/timing workflow signal only
- expiration runway does not guarantee renewal or uninterrupted service
- lastChanged recency does not by itself establish compromise, ownership transfer, malicious activity, or fraud
- legal-name/domain alignment does not prove domain ownership or control
- a Pennsylvania registry match does not prove good standing, ownership, authority, creditworthiness, or legal compliance

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-020.js`
- Existing exact-revision release gate and deterministic tests must pass before a reviewed deployment.
- Independently verify authoritative-source availability, payment identity, and current facilitator fee/allowance terms.
- Commercial release remains blocked until true hosting/source/refund economics and independently verified customer demand are established.

## 021 pa-entity-type-policy

Resolve a Pennsylvania business to one strong registry entity, normalize its registration type to a stable policy kind, and compare that kind with a caller-supplied allowed set.

- Endpoint: `GET /api/pa-entity-type-policy`
- Price: **$0.002000 USDC**
- Decisions: `policy_match`, `policy_mismatch`, `company_not_found`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **-15.5%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `allowedKinds` (string; required)

### Decision rules

- Resolve one strong PA registry business and normalize source registration type to a known policy kind.
- Compare normalized kind with the caller-declared comma-separated allowedKinds; no automatic legal/status finding.
- Unknown or ambiguous registry evidence returns human_review.
- policy_match only evaluates the caller-supplied entity-type policy
- it is not legal advice or proof of good standing, ownership, authority, tax treatment, liability protection, fraud risk, sanctions status, creditworthiness, or regulatory compliance

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-021.js`
- Existing exact-revision release gate and deterministic tests must pass before a reviewed deployment.
- Independently verify authoritative-source availability, payment identity, and current facilitator fee/allowance terms.
- Commercial release remains blocked until true hosting/source/refund economics and independently verified customer demand are established.

## 022 pa-registered-county-policy

Resolve a Pennsylvania business to one strong registry entity and compare its source-published registered county with a caller-supplied allowed Pennsylvania county set.

- Endpoint: `GET /api/pa-registered-county-policy`
- Price: **$0.002000 USDC**
- Decisions: `policy_match`, `policy_mismatch`, `company_not_found`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **-15.5%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `allowedCounties` (string; required)

### Decision rules

- Resolve one strong PA registry business and read its source-published registered county.
- Normalize county names including optional County suffix and compare with the caller-declared allowedCounties set.
- No match is only a caller policy outcome, not evidence of physical operations, residency, jurisdiction or legal compliance.
- policy_match evaluates only source-published registered county against caller policy
- it does not prove physical operations, headquarters, service area, residency, local ownership, tax situs, good standing, authority, or legal compliance

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502 with chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry the same authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-022.js`
- Existing exact-revision release gate and deterministic tests must pass before a reviewed deployment.
- Independently verify authoritative-source availability, payment identity, and current facilitator fee/allowance terms.
- Commercial release remains blocked until true hosting/source/refund economics and independently verified customer demand are established.

## 023 pa-local-vendor-policy-gate

Evaluate a prospective Pennsylvania vendor against caller-defined entity-type, registered-county, and minimum-formation-age rules using one public registry lookup.

- Endpoint: `GET /api/pa-local-vendor-policy-gate`
- Price: **$0.004000 USDC**
- Decisions: `proceed`, `human_review`, `company_not_found`
- Sources: Pennsylvania Department of State via data.pa.gov
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **42.2%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `allowedKinds` (string; required)
- `allowedCounties` (string; required)
- `minAgeDays` (integer; optional, default=365, min=1, max=36500)

### Decision rules

- Resolve a unique strong PA business registry identity before checking caller policy.
- Evaluate caller allowed entity kinds, allowed registered counties and minimum formation age.
- A proceed decision is an automated workflow trigger only and is not proof of compliance, local operations, or vendor trust.
- proceed means only that configured caller policy checks passed
- it is not legal/compliance approval or proof of good standing, ownership, authority, local operations, tax situs, fraud risk, sanctions status, or creditworthiness

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502, chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-023.js`
- Run existing product release gate and deterministic source-contract tests at the same candidate revision.
- Independently reverify provider sources and seller-specific payment/hosting costs before approval to release.
- Commercial promotion requires externally verified buyers, full unit economics and human security/integration review.

## 024 pa-vendor-distance-gate

Resolve a Pennsylvania business to one strong registry entity, geocode a caller-supplied origin address and the source-published registry address, and compare straight-line Census-coordinate distance with a caller-supplied radius.

- Endpoint: `GET /api/pa-vendor-distance-gate`
- Price: **$0.004000 USDC**
- Decisions: `within_radius`, `outside_radius`, `company_not_found`, `human_review`
- Sources: Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services
- Purchase frequency: **unmeasured**
- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **42.2%**

### Inputs

- `company` (string; required, minLength=2, maxLength=120)
- `originAddress` (string; required, minLength=6, maxLength=240)
- `maxDistanceMiles` (number; required, min=0.1, max=1000)

### Decision rules

- Require unique strong PA registry entity and source-published registered address.
- Geocode both caller origin and registry address using U.S. Census Geocoding Services; unavailable or uncertain evidence requires human_review.
- Evaluate straight-line coordinate distance versus caller maxDistanceMiles; not a driving distance or geographic eligibility certification.
- distance is straight-line great-circle distance between Census geocoder coordinates, not driving distance or travel time
- the registry address is source-published public registration data and does not prove current operations or physical control
- within_radius is only a caller-defined geographic policy result and does not prove local ownership, service area, residency, tax situs, good standing, authority, or legal compliance

### Failure behavior

- Invalid input: HTTP 400; do not settle payment.
- Required source failure: HTTP 502, chargeable=false; do not settle payment.
- Payment unresolved: HTTP 503; retry same payment authorization.
- Automatic reject: **false**

### Launch gate

- Status: `live-source-verified-staging`
- Release gate: `scripts/validate-product-024.js`
- Run existing product release gate and deterministic source-contract tests at the same candidate revision.
- Independently reverify provider sources and seller-specific payment/hosting costs before approval to release.
- Commercial promotion requires externally verified buyers, full unit economics and human security/integration review.

