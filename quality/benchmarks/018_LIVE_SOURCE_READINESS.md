# Product 018 read-only public source compatibility

## Purpose

This workflow checks whether current public sources return data that can be parsed by the exact PA business registry, OFAC SDN and IANA/Verisign RDAP source adapters used by Product 018. It uses *fixed public sample inputs*; no customer's vendor, name, address, invoice, payment authorization or funds are sent.

**It is an external contract observation, not a legal/compliance clearance, production health certification, live paid test, fee/revenue measurement or product-market-fit evaluation.**

## Public request policy

| Adapter | Only allowed public source | Restricted input | Checked |
|---|---|---|---|
| PA registry | `data.pa.gov/resource/xvd7-5r2c.json` | OpenAI OpCo (previously public entity, schema probe only) | Ranked/strong candidate count and identity shape |
| OFAC SDN | `sanctionslistservice.ofac.treas.gov` SDN/ALT CSV; only its narrowly validated signed public GovCloud S3 publication redirect | Resolved public entity name or the fixed public sample, score 90 | Queried legal name, score, bounded candidate counts and source contract |
| RDAP | IANA `data.iana.org/rdap/dns.json` and `rdap.verisign.com` | `example.com` (IANA documentation domain) | Registration status and registration-date shape |

Strict controls: HTTPS only, GET only, no request body or auth/cookie/payment headers, no arbitrary query input, at most **8 outbound requests**, per-response bounded reads (30 MB), and fixed host/path allowlisting. **One specifically validated same-file redirect** from the official OFAC publication endpoint to its named *public* AWS GovCloud bucket is allowed; its HTTPS host, published filename, path shape, signed query parameters, signature shape and maximum one-hour lifetime are checked before fetching. The signed link is never printed or stored. **Every other redirect is blocked**, and a bootstrap response pointing to another RDAP host is not followed automatically. Public source values, names, addresses and OFAC identities are **not printed or persisted** by this tool.

The JSON summary exposes only coarse source state, fixed known host labels, optional provider-reported Last-Modified date, and request counts. If a source offers no meaningful publication/freshness timestamp, the report explicitly leaves it **null**. Passing compatibility verifies neither a full/current sanctions dataset nor that all government records are accurate.

## Execute

```bash
node --test quality/benchmarks/018-live-source-probe.test.js
node quality/benchmarks/018-live-source-probe.js --probe-live
```

The first command runs deterministic **mock-only tests**. The second contacts the fixed official public sources **without submitting any payment**. It reports `PASS_READ_ONLY_SCHEMAS` only if all three returned the expected shapes; otherwise `HOLD_SOURCE_REVIEW` and a sanitized error code, exiting nonzero. An unavailable source or an unexpected redirect should be investigated through the provider and the pinned allowlist, not bypassed by permitting unknown domains or unrestricted fetch redirects. A legitimate OFAC redirect is accepted only when it matches the signed official public publication contract.

The separate GitHub Actions workflow `Factory 018 public source compatibility` is triggered by relevant PRs. It requires **only `contents:read`** and contains no payment secrets. The existing canonical factory CI remains a deterministic synthetic/offline release-gate suite.

## Redacted source drift monitoring

[Source drift monitor](018_SOURCE_DRIFT_MONITOR.md) compares fixed-public-source status and freshness against a prior *redacted-only* same-branch GitHub Actions artifact. Source failures, provider timestamp rollback/staleness and changed public-fixture semantics require review. Expected updates are informational.

The proposed workflow has a daily 13:17 UTC schedule **only after it is merged into the default branch**. Draft PR and manual workflow runs can test it now, but the schedule is not yet active. No customer names or payments are sent; provider Last-Modified remains unverified metadata.

## Release restrictions

**Even if all sources are compatible:** release status remains `HOLD_PENDING_REAL_PAYMENT_BUYER_AND_COST_AUDIT`. This does not authorize paid test transactions or production deployment. Independent source provenance, legal/sanctions-claim scope, seller payment settlement/refund reconciliation, current provider/hosting costs, and real buyer evidence must be reviewed separately. This PR remains draft, and Product 025+ remains locked.

## First live observation and strict policy revision

The first read-only GitHub probe found compatible PA registry and RDAP responses, while the official OFAC PublicationPreview service returned a redirect to a time-limited signed public GovCloud S3 object. The original strict no-redirect policy intentionally held OFAC. The revised guard follows **only** this proven publisher file shape; the new smoke reruns all three official sources and still fails closed on unapproved locations. This does not change the production OFAC adapter or authorize any paid action.
