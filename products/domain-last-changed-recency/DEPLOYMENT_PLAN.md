# Product 012 deployment plan — Domain Last-Changed Recency x402

Status: live-source-verified staging candidate.

## Contract

- Route: `GET /api/domain-last-changed-recency`
- Price: `$0.002 USDC`
- Atomic amount: `2000`
- Network: `eip155:8453`
- Inputs: `domain`, optional `maxAgeDays` (default 90; range 1–3650)
- Decisions:
  - `recently_changed`
  - `stable_since_window`
  - `unregistered`
  - `human_review`

## Authoritative evidence

Use IANA RDAP bootstrap to resolve the TLD's authoritative registry RDAP server.

Product 012 may classify recency only from the domain object's true RDAP `last changed` event, normalized by the shared RDAP adapter as:

`events.lastChanged`

Do **not** substitute:
- `lastUpdateOfRdapDatabase`
- registry database refresh timestamps
- request timestamps
- DNS modification inference
- WHOIS cache timestamps

If `events.lastChanged` is absent, return `human_review` with `LAST_CHANGED_DATE_UNAVAILABLE`.

## Decision rule

For registered domains with a valid last-changed date:

- lastChanged >= UTC-day cutoff -> `recently_changed`
- lastChanged < cutoff -> `stable_since_window`

A valid authoritative 404/unregistered result returns `unregistered`.

## Claim boundary

A recent RDAP last-changed event is a registration-metadata timing signal only.

It does not by itself establish:
- compromise,
- fraud,
- ownership transfer,
- malicious activity,
- security risk,
- business risk,
- control of the domain.

Registry event semantics can vary by TLD.

## x402 ordering

`402 -> validate input -> verify -> authoritative source work -> settle -> 200`

- invalid input: 400, no settlement
- RDAP source transport failure: 502, no settlement
- unresolved payment state: 503, retry same authorization
- completed evidence result: settle, then 200

## Discovery

Publish Product 012 only while its registry status ends in `staging`.

Required discovery surfaces:
- resource-array x402 catalog with resource-level `accepts[]`
- OpenAPI
- llms/agent text
- deterministic release bundle

OpenAPI operationId:
`checkDomainLastChangedRecency`

## Verified evidence

Deterministic tests cover:
- inside-window result
- older result
- unregistered result
- missing last-changed result
- RDAP transport failure
- x402 ordering
- discovery metadata
- explicit rejection of `lastUpdateOfRdapDatabase` as last-changed evidence

Live authoritative RDAP smoke for `openai.com` observed:
- lastChanged: `2024-10-17`
- maxAgeDays: `730`
- decision: `recently_changed`

## Deployment blocker

AppDeploy weekly Free-tier reset remains recorded as `2026-10-05T00:00:00Z`. No paid upgrade is authorized.
