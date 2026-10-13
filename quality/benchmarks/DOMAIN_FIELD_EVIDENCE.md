# Standalone domain evidence integrity

## Scope and reproduced defect

Existing Product 007 (registration age), 011 (expiration horizon), and 012
(last-changed recency), on the integrated draft PR #22 base. A required RDAP
adapter could return `available:true` with an inconsistent domain, unknown
registration status, invalid event map, or malformed event date and still
produce a chargeable answer. Date parsers discarded the timestamp suffix,
accepted calendar rollovers, and used the written date rather than the UTC
date for offset timestamps.

The added regression suite was run against the unchanged implementation before
the fix. It observed HTTP 200 where HTTP 502 was required and an offset event
reported as October 11 rather than its actual UTC date, October 12.

## Contract

The new shared `packages/sources/domain-evidence-contract.js` runs after an
actual normalized source lookup and before the decision/payment path.

- Require a plain evidence/event object, boolean registration status, and
  matching normalized requested domain; reject contradictory unregistered
  events and conflicting canonical/fallback event aliases.
- Validate the entire relevant date: real calendar day, bounded time and
  offset components. Past registration and last-changed events must not be
  later than the single clock observation used to construct the decision.
  Future expiration dates are valid, as are completed expired-domain signals.
- Normalize valid offset timestamps to UTC before existing day-based decisions.
- Mark malformed evidence once as `SOURCE_CONTRACT_INVALID`; discard it before
  decision construction. Existing handwritten and generated paid routes return
  `502 chargeable:false` without settlement or raw upstream data disclosure.
- Preserve current prices, decision enums, valid unregistered responses, valid
  adverse signals, and completed missing/null-event `human_review` responses.
  A genuinely absent event is not treated as a malformed supplied timestamp.

## Verification

`node --test quality/benchmarks/domain-field-evidence-gate.test.js` exercises
all three products through both actual handwritten and generated x402 handlers,
with only synthetic source evidence and mocked payment verification/settlement.
It covers malformed/missing context, impossible dates, bad timestamp suffixes,
future past-events, aliases, UTC boundaries, completed negative outcomes and
non-disclosure. Existing service fixtures now include the `domain` field that
the real adapter already supplies; their outcome assertions are unchanged.
Full Factory CI remains required; exact-head evidence is recorded on the PR.

## Source interpretation and limitations

RFC 9083 section 4.5 defines RDAP events and explicitly permits future-dated
expiration events: https://www.rfc-editor.org/rfc/rfc9083.html#section-4.5
RFC 3339 sections 5.6-5.8 define calendar/time/offset syntax:
https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6

This operational parser preserves legacy date-only inputs and accepts up to
nine fractional digits, compared at JavaScript millisecond precision. Leap
seconds, excessive precision and unsupported formats fail closed; full RFC
edge-case certification is not claimed. The check binds the normalized
adapter result to the requested domain; the existing adapter echoes that
request, so this does not independently certify the raw provider's ldhName,
registration completeness, ownership, source freshness or decision accuracy.
No live RDAP probe, customer transaction, payment, new product, price/wallet
change, merge or deployment is part of this upgrade. PR #22 and this candidate
remain draft; commercial release is HOLD and Product 025+ remains locked.
