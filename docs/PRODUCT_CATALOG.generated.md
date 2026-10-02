# Generated Product Catalog

Generated from `specs/*.json`. Do not hand-edit.

| # | Product | Buyer task | Route | Price | Decisions |
| --- | --- | --- | --- | ---: | --- |
| 003 | PA Vendor Identity Match | Determine whether a prospective Pennsylvania vendor's submitted company name, address, and domain are mutually consistent with authoritative public identity evidence. | `GET /api/pa-vendor-identity-match` | $0.005 | consistent, human_review |
| 004 | PA Business Address Match | Check whether a submitted Pennsylvania business address is consistent with the address of a uniquely resolved Pennsylvania registry entity. | `GET /api/pa-business-address-match` | $0.003 | match, human_review |
| 005 | PA Business Domain Match | Check whether a supplied registered domain plausibly aligns with the name of a uniquely resolved Pennsylvania business entity. | `GET /api/pa-business-domain-match` | $0.003 | match, human_review |
| 006 | SEC Filing Freshness Check | Determine whether a U.S. public filer has an SEC EDGAR filing matching an optional exact form filter inside a caller-selected freshness window. | `GET /api/sec-filing-freshness` | $0.005 | recent_filing, no_recent_filing, company_not_found |
| 007 | Domain Registration Age | Determine whether an authoritative RDAP domain registration date is at least a caller-selected minimum age. | `GET /api/domain-registration-age` | $0.002 | established, recent_registration, unregistered, human_review |

## 003 — PA Vendor Identity Match

Compare a prospective Pennsylvania vendor company name, address, and domain against Pennsylvania Department of State registry data, U.S. Census address normalization, and authoritative RDAP. Returns consistent or human_review. This is an identity-consistency check, not legal/compliance approval, sanctions screening, fraud scoring, credit analysis, good-standing certification, proof of address control, or proof of domain ownership.

**Sources:** Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services; IANA DNS bootstrap plus authoritative registry RDAP.

**Decision rules:**
- Require a unique strong Pennsylvania registry match.
- Require both supplied and registry addresses to geocode, share the primary street number and ZIP, and be within 0.25 miles.
- Require authoritative RDAP to confirm the domain is registered and deterministic company/domain name alignment to pass.
- Return consistent only when every check passes; otherwise return human_review.

**Failure behavior:** HTTP 400; do not settle payment. HTTP 502 with chargeable=false; do not settle payment. HTTP 503; caller should retry the same payment authorization.

**Economics:** price $0.005; post-allowance margin floor 53.8% before unknown hosting/failure/refund/maintenance costs.

**Demand:** unmeasured.

## 004 — PA Business Address Match

Resolve a Pennsylvania business name to a unique strong registry entity and compare the supplied address with the registry address using U.S. Census geocoding. Returns match or human_review. A match is not proof of physical presence, control, good standing, ownership, authority, fraud risk, sanctions status, creditworthiness, or legal compliance.

**Sources:** Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services.

**Decision rules:**
- Require a unique strong Pennsylvania registry match.
- Require both submitted and registry addresses to geocode.
- Require matching primary street number and ZIP.
- Require geocoded distance at or below 0.25 miles.
- Return match only when all checks pass; otherwise return human_review.

**Failure behavior:** HTTP 400; do not settle payment. HTTP 502 with chargeable=false; do not settle payment. HTTP 503; caller should retry the same payment authorization.

**Economics:** price $0.003; post-allowance margin floor 23% before unknown hosting/failure/refund/maintenance costs.

**Demand:** unmeasured.

## 005 — PA Business Domain Match

Resolve a Pennsylvania business to a unique strong registry entity and check whether the supplied registered domain plausibly aligns with the company name using authoritative RDAP. Returns match or human_review. A match is not proof of domain ownership/control, good standing, ownership, authority, fraud/sanctions/credit status, or legal compliance.

**Sources:** Pennsylvania Department of State via data.pa.gov; IANA DNS bootstrap plus authoritative registry RDAP.

**Decision rules:**
- Require a unique strong Pennsylvania registry match.
- Require authoritative RDAP to confirm the supplied domain is registered.
- Require deterministic company/domain name alignment.
- Return match only when all checks pass; otherwise return human_review.

**Failure behavior:** HTTP 400; do not settle payment. HTTP 502 with chargeable=false; do not settle payment. HTTP 503; caller should retry the same payment authorization.

**Economics:** price $0.003; post-allowance margin floor 23% before unknown hosting/failure/refund/maintenance costs.

**Demand:** unmeasured.

## 006 — SEC Filing Freshness Check

Resolve a U.S. public filer by ticker or CIK and determine whether SEC EDGAR contains a matching filing inside a caller-selected freshness window. Optional form filtering is exact (for example 8-K, 10-Q, 10-K). Returns recent_filing, no_recent_filing, or company_not_found. The endpoint reports metadata only and does not interpret filing contents or provide investment advice.

**Sources:** U.S. Securities and Exchange Commission EDGAR.

**Decision rules:**
- Require exactly one of ticker or CIK.
- Resolve ticker to CIK when ticker is supplied.
- Filter recent SEC filing metadata by exact normalized form when form is supplied.
- Compute a UTC-day cutoff from maxAgeDays.
- Return recent_filing when at least one dated matching filing is on or after the cutoff; otherwise return no_recent_filing; return company_not_found only for a valid lookup that does not resolve a company.

**Failure behavior:** HTTP 400; do not settle payment. HTTP 502 with chargeable=false; do not settle payment. Live SEC transport also requires SEC_USER_AGENT containing a contact email. HTTP 503; caller should retry the same payment authorization.

**Economics:** price $0.005; post-allowance margin floor 53.8% before unknown hosting/failure/refund/maintenance costs.

**Demand:** unmeasured.

## 007 — Domain Registration Age

Use IANA RDAP bootstrap and the authoritative registry RDAP service to compare a domain registration date against a caller-selected minimum age. Returns established, recent_registration, unregistered, or human_review. Domain age alone does not establish ownership, control, legitimacy, fraud risk, safety, or business history.

**Sources:** IANA DNS bootstrap plus authoritative registry RDAP.

**Decision rules:**
- Use authoritative RDAP registration/registered event date when present.
- Compute domain age at UTC day granularity.
- Return unregistered when authoritative RDAP reports the domain is not registered.
- Return established when registration date is on or before the minimum-age cutoff; return recent_registration when newer; return human_review when required RDAP evidence or registration date is unavailable.

**Failure behavior:** HTTP 400; do not settle payment. HTTP 502 with chargeable=false; do not settle payment. HTTP 503; caller should retry the same payment authorization.

**Economics:** price $0.002; post-allowance margin floor -15.5% before unknown hosting/failure/refund/maintenance costs.

**Demand:** unmeasured.
