# Product 002 deployment plan — PA Vendor Intake Gate x402

Status: **factory implementation complete; Floot cutover not yet deployed**.

## Product contract

- Route: `GET /api/vendor-intake-gate`
- Price: `$0.020 USDC`
- Atomic amount: `20000`
- Network: `eip155:8453`
- Asset: Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- payTo: `0x708f7b52b56eafd7fc1de65fc7752ed732914021`
- Decisions: `proceed` or `human_review`
- Automatic rejection: none

Required query fields:

- `company` (`name` remains accepted as a historical compatibility alias)
- `address`
- `domain`

## Production boundary

The durable production split remains:

- PA products on `https://pa-entity-x402.floot.app`
- SEC, OFAC, Census, RDAP, and Treasury data tools on the existing Supabase seller

Product 002 is **not currently claimed as live on Floot**. The Floot seller must expose both the paid route and its same-origin discovery entry before the registry status or public documentation may describe a completed cutover. The historical AppDeploy URL is reference evidence only and is not the durable target.

Do not move Product 002 to Supabase merely to unify hosting. Do not change the existing Floot PA entity routes or the Supabase five-tool seller.

## Authoritative source sequence

1. Resolve one strong Pennsylvania Department of State entity through `data.pa.gov`.
2. Compare the supplied and registered addresses through the U.S. Census geocoder.
3. Screen the resolved legal name against current OFAC SDN primary names and aliases.
4. Resolve the domain through IANA bootstrap and authoritative RDAP.
5. Apply the deterministic `proceed` / `human_review` policy.

The service calls these public sources directly. It must not call another seller-owned paid or demo route.

## Payment ordering

The deployment must preserve:

1. no payment header → HTTP 402,
2. decode x402 v2 payment,
3. validate product input,
4. verify payment,
5. fetch required public evidence,
6. required-source failure → HTTP 502 and no settlement,
7. compute the deterministic decision,
8. settle the same verified payment,
9. unresolved settlement → HTTP 503 and retry the same authorization,
10. confirmed settlement → HTTP 200 with `PAYMENT-RESPONSE` and `x402-settled:true`.

## Pre-cutover requirements

Before changing the production status or discovery surfaces:

1. Product 002 deterministic release gate passes.
2. `node scripts/verify-floot-product-002.js --require-ready` passes against the deployed seller.
3. Product 002 decision, service, paid-handler, metadata, and Floot-auditor tests pass.
4. Zero-spend direct-source smoke completes without source failures.
5. The Floot deployment source is backed up in a versioned rollback artifact.
6. The existing Floot PA entity routes and prices are unchanged.
7. The Product 002 handler is wired to the shared seller wallet and facilitator contract.
8. No paid probe, self-purchase, credit purchase, or hosting upgrade is used.

## Post-cutover acceptance

After a future authorized Floot deployment:

1. `/.well-known/x402` returns HTTP 200 and contains `/api/vendor-intake-gate`.
2. `/openapi.json` documents Product 002 at `$0.020`.
3. An unpaid valid Product 002 request returns HTTP 402, never the SPA HTML shell.
4. The decoded challenge advertises `20000` atomic Base USDC and the established seller wallet.
5. Invalid input cannot reach verification or settlement.
6. Required-source failure cannot settle.
7. Existing Floot PA entity routes continue to return their prior x402 challenges.
8. The Supabase five-tool seller remains unchanged and healthy.

Only after all acceptance checks pass may Product 002 be described as live on Floot or added to that seller's production discovery catalog.
