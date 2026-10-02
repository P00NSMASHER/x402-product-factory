# Product 024 deployment plan — PA Vendor Distance Gate x402

- Route: `GET /api/pa-vendor-distance-gate`
- Price: `$0.004 USDC`
- Atomic amount: `4000`
- Inputs: company, originAddress, maxDistanceMiles (0.1–1000)
- Decisions: within_radius, outside_radius, company_not_found, human_review

Use one Pennsylvania registry lookup and two direct Census geocoder calls through the shared adapters. Compare great-circle distance between Census coordinates. Completed outside_radius is a chargeable policy result; registry/Census transport failure is non-chargeable and must not settle.

Claim boundary: straight-line distance is not driving distance or travel time. Registry/Census evidence does not prove local ownership, operations, service area, residency, physical control, tax situs, good standing, authority, or legal compliance.
