# RDAP raw domain-response identity gate

## Change and safety outcome

The shared RDAP adapter previously treated any HTTP 200 JSON body as a
registered domain and set the normalized `domain` field to the caller's
query without checking the *provider's actual domain identifier*. A successful
request could therefore return an unrelated domain's dates and still be
eligible for x402 settlement.

For an HTTP 200 domain response, the adapter now requires:
- A JSON object, not a null, scalar or array.
- `objectClassName: "domain"`.
- A string `ldhName` that equals the normalized requested ASCII domain.
  Comparison is case-insensitive and tolerates a final root dot; it does not
  equate unrelated subdomains or suffixes.
- Missing, malformed and mismatched identifiers produce a fixed
  `SOURCE_CONTRACT_INVALID` error without leaking upstream payloads.

**Preserved behavior:** an authoritative endpoint's HTTP 404 still produces
a completed `registered:false` result. A valid matching HTTP 200 response
with no registration events remains eligible for `human_review` based on
the existing downstream decisions. Punycode LDH names remain supported.

This is a **shared adapter** safeguard for current consumers, not a new
product or a new commercial release mechanism.

## Verification

- New `packages/sources/rdap-response-identity.test.js` exercised the real
  adapter and payment handlers before implementation: **17 expected red,
  5 green**, including successful 200 outcomes on wrong-domain raw data.
- With the gate: **22/22 pass**.
- Focused real-adapter, compatibility, product, and public-source-probe
  tests: **44/44 pass** locally.
- Existing mock positive responses were updated to include RFC-style
  `objectClassName` and `ldhName`; no application behavior was changed for
  those fixtures.
- Local Windows `scripts/run-all-tests.js` is separately known to fail
  at the pre-existing `quality/adversarial-contracts.test.js`
  stale generated coverage check. The CI Linux full run is authoritative
  for this draft and must be recorded against its exact head.

## Interpretation and remaining limits

RDAP JSON response object class requirements and the domain `ldhName` field
are documented in RFC 9083 sections 4.9 and 5.3:
https://www.rfc-editor.org/rfc/rfc9083.html

This change binds a JSON response to the user's requested domain; it does
**not** cryptographically authenticate the provider or eliminate all issues
with redirects, IANA bootstrap entries, schema evolution, identity ownership,
untrustworthy date values, or incomplete events. It deliberately requires an
LDH identifier for ASCII input; Unicode-only bodies without `ldhName`
fail closed, rather than being used as paid evidence. The existing
`eventMap` handling and upstream redirect policy remain separate reviews.

No live RDAP calls, real payments, buyer data, launch, merge, prices, wallets,
scheduled tasks, or Product 025+ unlocks are part of this change. Commercial
release remains **HOLD** pending external evidence and human approval.
