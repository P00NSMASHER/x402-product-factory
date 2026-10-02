# Source adapters

Product logic should consume normalized adapters rather than call upstream sources directly.

Initial adapters:

- `pa-registry` — Pennsylvania business registry/entity resolution
- `ofac` — sanctions-screening evidence
- `rdap` — domain registration evidence
- `census-geocoder` — address normalization/geographic consistency
- `sec` — public-company identity and recent filings

Each adapter should return:
- normalized facts
- source identifier/URL when available
- fetched_at
- confidence/provenance metadata
- explicit unavailable/error state

Products may combine evidence, but must not convert missing evidence into a negative factual claim.
