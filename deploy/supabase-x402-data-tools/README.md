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
- Historical captured version: 3 (historical source digest `4ffd87200993ee465768099e877f9c9255c24f34e61f3b2eded68944887d007f`; not the current live source).
- Read-only connected Supabase inspection on 2026-10-10: **ACTIVE version 6**.
- Supabase-reported v6 deployed **bundle** SHA-256: `28d4c24a123538e6cfa437723899784275576d1467e98a836a340a986f674d9f` (a bundle digest, not a SHA-256 of the raw `index.ts` text).
- Agent402 self-registration: accepted
- Agent402 seller health: 1
- Agent402 seller routable: true
- Agent402 tool count: 5
- At the prior Agent402 distribution snapshot, exact-name route queries ranked the matching migrated route #1 and exposed the Base unproven lane at the $0.01 router tier; this ranking was **not** reverified on 2026-10-10.
- x402scan does not currently discover this path-prefixed Supabase seller because it canonicalizes to the bare host. This is a directory limitation, not a seller-health failure.

The Edge Function does not read or write the Supabase database and does not use the existing project's unrelated functions.


## Distribution cutover

- Agent402 registration: accepted as one path-prefixed seller with 5 tools, health 1, routable true.
- Historical Agent402 exact-name route searches ranked all five migrated tools #1 in the Base unproven execution tier; check live directory results before repeating this as a current claim.
- BotMarket submission #37 is the current unified catalog listing for this origin.
- BotMarket submissions #31-#35 pointed at the older AppDeploy product hosts and have been marked to the maintainer as superseded by #37.
- BotMarket submission #30 (PA Entity on Floot) remains separate and current.

## Source of truth

Canonical source path in this repository:

`deploy/supabase-x402-data-tools/index.ts`

Do not maintain a second copy of this Edge Function under another deployment directory. The canonical file should be compared against the live Supabase Edge Function before any redeploy.

## Release source-drift gate

The canonical live Supabase Edge Function was inspected read-only on
**2026-10-10**. Production was **version 6**, with five buyer-task
discovery descriptions more specific than the stale GitHub baseline.
PR #4 was reconciled with those descriptions. The candidate source,
after removing only its new best-effort settlement-telemetry block,
was verified byte-for-byte equal to the observed deployed v6
`index.ts` source at the time of inspection.

The pinned, nonsecret release metadata is maintained in
`production-baseline-20261010.json`. The offline verifier:

```bash
node deploy/supabase-x402-data-tools/verify-production-baseline.js
```

checks **every pre-existing byte** of the live v6 source against the
pinned raw-source SHA-256
`d5c5457cc8d6bbafa041528bcc15323a7e8b47093e55dc61296641914819d508`,
after removing only the reviewed, byte-pinned post-settlement telemetry
block (SHA-256
`84e2da4ea3ab311974b282c6f27b580d5cdc686bfd63e401434c340f7b5f1c2e`).
It additionally validates the five live buyer-task descriptions and all
network/token/receiver/facilitator/price/amount constants. The existing PR
CI runs this offline check and negative tests for behavior drift.

A separately reviewed release must also pass the **fresh provider
snapshot** mode against a recently fetched live source and metadata
stored in temporary private 0600 files outside the repository:

```bash
node deploy/supabase-x402-data-tools/verify-production-baseline.js \
  --preflight /PRIVATE/ABSOLUTE/live-index.ts \
  /PRIVATE/ABSOLUTE/live-metadata.json ACTUAL_UTC_OBSERVATION_TIME
```

The snapshot may be no more than 15 minutes old, and its deployed
version, status, bundle digest and raw source must all match the pinned
v6 reference. The snapshot origin is still a manual trust responsibility:
the CLI cannot cryptographically verify an operator-supplied source.
A successful preflight explicitly reports that **deployment is not
authorized**. See `SETTLEMENT_EVIDENCE.md` for the complete runbook.

**Required before any release:** independently retrieve the current live
Supabase `x402-data-tools` source and deployed version again. Stop if
either differs from the pinned v6 snapshot; review and reconcile changes
rather than overwriting a newer live deployment. A green offline test
is **not** proof that production remains v6 or that PR #4 has deployed.
No automatic deployment, wallet access, or payment was performed by
the draft settlement upgrade.
