# Supabase x402 Data Tools Deployment

Production seller origin:

`https://bvjtimsalbzkmulyinpg.supabase.co/functions/v1/x402-data-tools`

## Why this exists

The five AppDeploy sellers became undiscoverable when AppDeploy's platform credit gate returned HTTP 402 for discovery files as well as paid routes. This deployment moves the actual API implementations—not merely discovery metadata—to one free-tier Supabase Edge Function.

## Live paid routes

- `GET /api/sec-filings` — $0.005 USDC
- `GET /api/ofac-sdn-screen` — $0.005 USDC
- `GET /api/us-address-geocode` — $0.005 USDC
- `GET /api/domain-rdap` — $0.005 USDC
- `GET /api/treasury-average-rates` — $0.005 USDC

All routes use x402 v2 exact settlement on Base, Base USDC, and seller wallet `0x708f7b52b56eafd7fc7752ed732914021`.

## Public discovery

These are intentionally unpaywalled:

- `/.well-known/x402`
- `/.well-known/x402.json`
- `/openapi.json`
- `/llms.txt`
- `/skill.md`
- `/health`

## Verification snapshot

- Supabase function: `x402-data-tools`
- Live Supabase version captured in this repository: 3
- Supabase source SHA-256: `4ffd87200993ee465768099e877f9c9255c24f34e61f3b2eded68944887d007f`
- Agent402 self-registration: accepted
- Agent402 seller health: 1
- Agent402 seller routable: true
- Agent402 tool count: 5
- Each exact-name route query currently ranks the matching migrated route #1 and exposes the Base unproven lane at the $0.01 router tier.
- x402scan does not currently discover this path-prefixed Supabase seller because it canonicalizes to the bare host. This is a directory limitation, not a seller-health failure.

The Edge Function does not read or write the Supabase database and does not use the existing project's unrelated functions.
