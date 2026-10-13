# OFAC SDN and alias-list cache freshness — Product Factory quality gate

## Verified implementation issue

The existing `packages/sources/ofac-name-screen.js` previously set `cache=[...map.values()]` once per process and never revalidated its age. A long-lived server instance could consequently use indefinitely old SDN and alternate-name files. Worse, it assigned an **empty** snapshot before throwing `SOURCE_CONTRACT_INVALID`, allowing subsequent lookups to screen against an empty cached array as if there were no name candidates.

## Fix in this draft branch

- **Maximum local cache age:** one hour by default (`3600000 ms`), with a strict six-hour upper bound on any injected TTL. A process must fetch both source files again before serving an expired snapshot.
- **Atomic SDN + ALT refresh:** simultaneously fetch both official published files, build the candidate/alias map, require a nonempty SDN dataset, and publish the cache only after both requests succeed. Never publish half a refresh.
- **Single-flight concurrency:** overlapping screening requests share one pair of SDN/ALT fetches, reducing redundant downloads and avoiding interleaved cache mutation.
- **Fail closed on an expired snapshot:** if either fetch returns a source error or invalid/empty data, no previous or partially populated dataset may be used to conclude `no_candidate`. A later successful fresh attempt can recover.
- **Fail closed on invalid clock state:** a nonfinite/rollback clock or a snapshot that expires while being scored produces `SOURCE_CONTRACT_INVALID`, not a chargeable false-negative screen.
- **Transparent metadata:** `provenance.localDatasetRetrievedAtUtc`, `localDatasetCacheAgeMs` and `providerPublicationVerified:false` distinguish the local fetch time from official government publication time. **This does not establish that a source is current, complete or legally authoritative.**

## Acceptance and tests

```bash
node --test packages/sources/ofac-cache-freshness.test.js
node --test packages/sources/ofac-cache-settlement.test.js
node scripts/run-all-tests.js
```

These tests inject only fake SDN/ALT CSVs and mock x402 facilitator replies. The settlement replay runs the actual generated paid routes for **Product 009 (OFAC name review), Product 016 (PA entity + OFAC), and Product 018 (counterparty review)**. It primes a valid snapshot, expires it, simulates official OFAC 503 responses and verifies **HTTP 502, chargeable:false, no settlement and no receipt** across all three routes. It then restores the source and verifies recovery without reusing a failed prior cache.

## Operational and security boundaries

The cache TTL bounds the **local age of an adapter fetch**, not the true date of publication, global freshness of OFAC sanctions lists or absence of beneficial-owner sanctions. A failed source is a source availability problem, not evidence that a screened party is safe or sanctioned. Continue to show only name-candidate review signals and the existing disclaimers; this patch makes no legal/compliance approval.

Repository changes are restricted to the shared in-process OFAC adapter, deterministic test suites, documentation and CI. No new products, price, route, wallet, chain, source URL, payment logic, authentication token, real settlement, customer information, scheduler, merge or deployment. **Product 025+ remains frozen**, and independent provider/current-cost/buyer/security checks remain HOLD.
