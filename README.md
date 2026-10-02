# x402 Product Factory

Migration-ready scaffold for a future dedicated `x402-product-factory` repository.

## Mission

Build narrow, deterministic, machine-purchasable decision tools for autonomous agents while sharing one hardened x402, evidence, source-adapter, test, and discovery layer.

## Current portfolio

| # | Product | Status | Route | Price |
|---|---|---|---|---:|
| 001 | PA Entity Lookup | production reference | `/_api/pa-entity-one` | $0.001 |
| 002 | PA Vendor Intake Gate | production reference | `/api/vendor-intake-gate` | $0.020 |
| 003 | PA Vendor Identity Match | live-source-verified staging | `/api/pa-vendor-identity-match` | $0.005 |
| 004 | PA Business Address Match | live-source-verified staging | `/api/pa-business-address-match` | $0.003 |
| 005 | PA Business Domain Match | live-source-verified staging | `/api/pa-business-domain-match` | $0.003 |
| 006 | SEC Filing Freshness Check | source-contract-verified staging | `/api/sec-filing-freshness` | $0.005 |
| 007 | Domain Registration Age | live-source-verified staging | `/api/domain-registration-age` | $0.002 |
| 008 | Treasury Average Rate Threshold | live-source-verified staging | `/api/treasury-average-rate-threshold` | $0.003 |
| 009 | OFAC Name Review Gate | live-source-verified staging | `/api/ofac-name-review-gate` | $0.003 |
| 010 | PA Business Formation Age | live-source-verified staging | `/api/pa-business-formation-age` | $0.002 |
| 011 | Domain Expiration Horizon | live-source-verified staging | `/api/domain-expiration-horizon` | $0.002 |
| 012 | Domain Last-Changed Recency | live-source-verified staging | `/api/domain-last-changed-recency` | $0.002 |
| 013 | SEC Public Company Identity Match | source-contract-verified staging | `/api/sec-company-identity-match` | $0.003 |
| 014 | Treasury Average Rate Trend | live-source-verified staging | `/api/treasury-average-rate-trend` | $0.003 |
| 015 | Treasury Average Rate Spread | live-source-verified staging | `/api/treasury-average-rate-spread` | $0.003 |
| 016 | PA Entity OFAC Review Gate | live-source-verified staging | `/api/pa-entity-ofac-review` | $0.005 |
| 017 | PA Vendor New-Domain Review | live-source-verified staging | `/api/pa-vendor-new-domain-review` | $0.005 |
| 018 | PA Vendor Counterparty Review | live-source-verified staging | `/api/pa-vendor-counterparty-review` | $0.010 |
| 019 | PA Vendor Maturity Review | live-source-verified staging | `/api/pa-vendor-maturity-review` | $0.007 |
| 020 | PA Vendor Domain Continuity Review | live-source-verified staging | `/api/pa-vendor-domain-continuity-review` | $0.006 |

Product 001 has an independently verified third-party Base USDC settlement and remains the payment/distribution reference.

## Product 003

Combines:
- Pennsylvania Department of State registry identity
- U.S. Census address consistency
- authoritative RDAP registration
- company/domain name alignment

Returns:
- `consistent`
- `human_review`

No automatic rejection.

## Product 004

A cheaper unbundled address-only check.

Combines:
- Pennsylvania Department of State registry identity
- U.S. Census address consistency

Returns:
- `match`
- `human_review`

No automatic rejection.

## Product 005

A cheaper company + domain identity check.

Combines:
- Pennsylvania Department of State registry identity
- IANA bootstrap + authoritative RDAP
- deterministic company/domain name alignment

Returns:
- `match`
- `human_review`

No automatic rejection.

## Product 006

A filing-metadata freshness decision using SEC EDGAR.

Inputs:
- exactly one of ticker or CIK
- optional exact form filter
- freshness window 1–365 days

Returns:
- `recent_filing`
- `no_recent_filing`
- `company_not_found`

SEC transport was proven with the existing production-style declared client identity, but the factory adapter now requires a contact-email `SEC_USER_AGENT` before live calls. Deterministic/source-contract tests pass; no contact email is invented or embedded.

## Product 007

Authoritative domain registration age via IANA bootstrap + registry RDAP.

Returns:
- `established`
- `recent_registration`
- `unregistered`
- `human_review`

Live smoke for `openai.com`: registration date `2007-01-19`, decision `established`.

## Product 008

Official U.S. Treasury monthly average-rate threshold decision.

Returns:
- `threshold_met`
- `threshold_not_met`
- `human_review`

Live smoke: `Total Marketable` rate `3.475%` for record date `2026-08-31`.

## Product 009

Deterministic current OFAC SDN primary-name and alias screening.

Returns:
- `candidate_found`
- `no_candidate`

Live smoke: the neutral query `OpenAI OpCo` at threshold `90` completed against the current OFAC SDN/ALT files and returned `no_candidate`.

That verifies source transport and deterministic decision execution only. A candidate is not a legal sanctions determination. A no-candidate result is not sanctions clearance. OFAC 50 Percent Rule ownership analysis is not included.

## Product 010

Pennsylvania Department of State formation-age threshold.

Returns:
- `established_entity`
- `recent_entity`
- `company_not_found`
- `human_review`

Live smoke for `OpenAI OpCo` observed creation date `2025-09-29` and returned `established_entity` at a 30-day threshold.

Formation age is an identity/history signal only and does not establish current good standing, ownership, authority, legitimacy, fraud risk, sanctions status, creditworthiness, or legal compliance.

## Product 011

Authoritative RDAP domain expiration-horizon check.

Returns:
- `expiring_soon`
- `not_expiring_soon`
- `unregistered`
- `human_review`

Live smoke for `openai.com` observed expiration date `2029-01-19` and returned `not_expiring_soon` for a 180-day horizon.

This is a registration timing signal only; registry renewal/grace/redemption policies vary and the result does not prove ownership, control, legitimacy, security, fraud risk, or business identity.

## Product 012

Authoritative RDAP last-changed recency decision.

Returns:
- `recently_changed`
- `stable_since_window`
- `unregistered`
- `human_review`

Live smoke for `openai.com` observed the true domain `lastChanged` event on `2024-10-17` and returned `recently_changed` for a 730-day window.

The product deliberately does **not** treat RDAP's `lastUpdateOfRdapDatabase` event as a domain change. A recent metadata change is not by itself evidence of compromise, fraud, ownership transfer, malicious activity, security risk, or business risk.

## Product 013

SEC public-company identity consistency from exactly one ticker or CIK.

Returns:
- `match`
- `human_review`
- `company_not_found`

The deterministic/source-contract suite is green. Live SEC calls remain gated on a real deployment `SEC_USER_AGENT` containing a contact email; no fake contact identity is embedded.

## Product 014

Official Treasury Fiscal Data two-month rate direction.

Inputs:
- security description
- optional minimum change in basis points

Returns:
- `rising`
- `falling`
- `unchanged`
- `human_review`

Live smoke for `Total Marketable` observed 3.475% on 2026-08-31 versus 3.443% on 2026-07-31: +3.2 bps, therefore `rising` at a 1-bp threshold.

This is a two-point monthly direction signal, not a long-term trend determination, live market yield, forecast, monetary-policy prediction, or investment advice.

## Product 015

Same-month Treasury category spread from one official Fiscal Data response.

Returns:
- `left_higher`
- `right_higher`
- `within_tolerance`
- `human_review`

Live smoke: `Treasury Bills` 3.788% versus `Treasury Notes` 3.345% on 2026-08-31, a +44.3 bp spread, returned `left_higher` at a 2 bp tolerance.

Both categories must resolve uniquely from the same latest monthly record date. This is not a live market-yield spread, yield-curve trading signal, forecast, or investment recommendation.

## Product 016

Pennsylvania legal-entity resolution followed by current OFAC SDN/alias review.

Flow:
- resolve the submitted company to one strong Pennsylvania legal entity,
- screen the **resolved legal business name** against current OFAC SDN primary names and aliases,
- return `candidate_found`, `no_candidate`, `company_not_found`, or `human_review`.

Live smoke for `OpenAI OpCo` resolved `Openai Opco, Llc`, screened that exact legal name at score threshold 90, and returned `no_candidate` with zero source failures.

This is candidate-name screening only. `candidate_found` is not a legal sanctions determination, `no_candidate` is not sanctions clearance, and OFAC 50 Percent Rule ownership analysis is not included.

## Product 017

Pennsylvania vendor legal-entity resolution plus authoritative domain registration-age review.

Flow:
- resolve the submitted company to one strong Pennsylvania legal entity,
- align the supplied domain against the **resolved legal business name**,
- read authoritative RDAP registration age,
- return `established_domain_match`, `recent_domain_review`, `domain_mismatch`, `unregistered_domain`, `company_not_found`, or `human_review`.

Live smoke for `OpenAI OpCo` resolved `Openai Opco, Llc`, matched `openai.com`, observed registration date `2007-01-19`, and returned `established_domain_match` at a 90-day minimum with zero source failures.

Recent registration is a review signal, not proof of fraud. Domain-name alignment does not prove ownership or control, and an established domain is not proof a vendor is safe or trustworthy.

## Product 018

A lighter composed counterparty decision than the full address-inclusive Product 002 gate.

Flow:
- resolve the submitted company to one strong Pennsylvania legal entity,
- screen the **resolved legal name** against current OFAC SDN primary names and aliases,
- verify the supplied domain through authoritative RDAP,
- require legal-name/domain alignment,
- require domain age at/above a caller threshold,
- return `proceed` or `human_review`.

Live smoke for `OpenAI OpCo` resolved `Openai Opco, Llc`, returned zero OFAC candidates at score 90, verified `openai.com` as aligned and 7,196 days old, and returned `proceed` with zero source failures.

`proceed` is only a workflow signal. A no-candidate OFAC result is not sanctions clearance, OFAC 50 Percent Rule ownership analysis is not included, domain alignment does not prove ownership/control, and recent domain registration is a review signal rather than proof of fraud.

## Product 019

Pennsylvania vendor entity + domain maturity review.

Flow:
- resolve one strong Pennsylvania legal entity,
- require entity formation age at/above a caller threshold,
- align the supplied domain against the **resolved legal business name**,
- require authoritative domain registration age at/above a caller threshold,
- return `established_vendor` or `human_review`.

Live smoke for `OpenAI OpCo` resolved `Openai Opco, Llc`, observed entity age 368 days and `openai.com` age 7,196 days, and returned `established_vendor` with zero source failures.

This is a maturity/history signal only. Older entity/domain history is not proof of legitimacy, safety, ownership, authority, creditworthiness, or legal compliance, and recent registration is a review signal rather than proof of fraud.

## Product 020

Pennsylvania vendor domain-continuity review.

Flow:
- resolve one strong Pennsylvania legal entity,
- align the supplied domain against the **resolved legal business name**,
- require enough authoritative RDAP expiration runway,
- require enough time since the authoritative `lastChanged` event,
- return `stable_domain` or `human_review`.

Live smoke for `OpenAI OpCo` resolved `Openai Opco, Llc`, observed `openai.com` expiration on `2029-01-19` (840 days away) and lastChanged on `2024-10-17` (715 days ago), and returned `stable_domain` with zero source failures.

This is a continuity/timing signal only. Expiration runway does not guarantee renewal or uninterrupted service, lastChanged recency does not establish compromise or fraud, and legal-name/domain alignment does not prove domain ownership or control.

## Shared layers

- `packages/x402/payment.js` — hardened Base USDC verify/settle flow
- `packages/sources/contracts.js` — normalized evidence adapter contract
- `packages/sources/live-pa-identity.js` — direct PA Open Data, Census, and authoritative RDAP adapters
- `product-registry.json` — canonical product IDs/routes/prices/statuses
- `scripts/validate-registry.js` — collision/integrity gate
- `runtime/create-runtime.js` — one portable runtime wiring every staged paid route and compiled discovery surface
- `runtime/appdeploy-bridge.js` — AppDeploy-compatible GET/OPTIONS route map
- `scripts/build-appdeploy-runtime-bundle.js` — deterministic self-contained ESM bundle for the CommonJS factory runtime
- `scripts/build-appdeploy-entrypoint.js` — generates the thin AppDeploy `backend/index.ts` using the proven `@appdeploy/sdk` secrets API
- `APPDEPLOY_HANDOFF.md` — reset-day provider integration boundary and secret-binding checklist
- `runtime/deployment-preflight.js` — environment prerequisite checks such as Product 006's SEC identity requirement
- `runtime/validate-deploy-candidate.js` — unified structural deploy-candidate gate
- `scripts/validate-no-nested-seller-calls.js` — prevents products from calling seller-owned AppDeploy APIs internally
- product-specific deterministic release gates
- coordinated zero-spend live-source smokes
- resource-level x402 `accepts[]` metadata for Bazaar-compatible discovery

## Payment invariants

Default production rail:
- network: `eip155:8453`
- asset: Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- payTo: `0x708f7b52b56eafd7fc1de65fc7752ed732914021`

Products follow:
`402 -> validate input -> verify payment -> source work -> settle -> 200`.

Required-source transport failure is non-chargeable and must not settle.

## Deployment readiness

A candidate deployment must pass all of the following from the same registry head:

- product-specific release gates
- factory registry and migration-manifest integrity
- canonical discovery bundle generation and hashes
- executable ESM runtime bundle generation + dynamic-import execution test
- release-manifest SHA-256 binding for `factory-runtime-bundle.js`
- portable runtime route coverage
- CORS OPTIONS coverage for every paid route
- malformed-payment and invalid-input ordering checks
- no nested seller-owned AppDeploy calls
- deployment prerequisite preflight

Product 006 additionally requires a real `SEC_USER_AGENT` containing a declared client identity and contact email. CI uses a dummy contact only for structural validation; it is not production configuration.

## Current deployment blocker

AppDeploy reported an account-wide Free tier pause with weekly reset at:

`2026-10-05T00:00:00Z`

No upgrade/payment has been authorized. Products 003–020 therefore remain staging candidates rather than production claims.

## Branch isolation

All factory development in this workspace is isolated to:

`x402-product-factory-bootstrap`

The existing production `main` branch is not the integration target for unfinished factory products.

See each product's `DEPLOYMENT_PLAN.md` and release gate before any production change.
