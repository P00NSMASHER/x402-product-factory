# BotMarket submission receipt — 2026-10-02

This receipt records zero-spend BotMarket x402 service submissions made from the factory repository.

## Submission results

| Submission ID | Service | Slug | Price | BotMarket result |
| ---: | --- | --- | ---: | --- |
| 30 | PA Entity Lookup x402 | `pa-entity-x402-floot-app` | 0.001 USDC | queued for manual review |
| 32 | OFAC SDN Name Screen x402 | `ofac-sdn-name-screen-x402-m9ko96-v2-appdeploy-ai` | 0.005 USDC | queued for manual review |
| 33 | US Census Address Geocoder x402 | `us-census-address-geocoder-x402-23mj4x-v2-appdeploy-ai` | 0.005 USDC | queued for manual review |
| 34 | Domain RDAP Lookup x402 | `domain-rdap-lookup-x402-spdfnq-v2-appdeploy-ai` | 0.005 USDC | queued for manual review |
| 35 | Treasury Average Interest Rates x402 | `treasury-average-interest-rates-x402-xeqftl-v2-appdeploy-ai` | 0.005 USDC | queued for manual review |

## BotMarket-side queue reason

Each accepted submission returned HTTP 200 with `status: queued`.

BotMarket then reported the same registry-write failure:

`Registry PR failed; queued for manual review. Reason: file update failed: HTTP 422 {"message":"[SHA]: Required",...}`

That error is inside BotMarket's registry write path. It is not evidence of a seller endpoint defect.

## Publication readback

A read-only check of BotMarket's documented:

`GET /v1/service/<slug>`

was performed after the submissions.

All five slugs returned:

- HTTP 404
- `{"detail":"Service not found"}`

Therefore none of the five services should currently be described as published on BotMarket.

## Handling rule

Do not resubmit these services merely because readback is still 404. The existing BotMarket submissions are already queued for manual review.

Only submit again if BotMarket explicitly rejects/closes a submission or provides a supported correction/retry path.

No payment, listing fee, or paid verification was used.
