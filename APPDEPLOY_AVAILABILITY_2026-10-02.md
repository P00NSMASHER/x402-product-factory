# AppDeploy availability note — 2026-10-02

This is an operational availability note, not a product-code defect report.

During Product Factory work, AppDeploy reported that the account had reached both its daily and weekly Free tier credit limits. The tool reported:

- daily reset: 2026-10-03T00:00:00Z
- weekly reset: 2026-10-05T00:00:00Z
- deployments and app usage paused until the weekly reset

A read-only live audit at approximately 2026-10-02T09:25Z observed the same platform-level response from:

- US Census component demo
- OFAC component demo
- RDAP component demo
- PA Vendor Intake Gate demo

Each returned HTTP 402 with:

`APP_TEMPORARILY_UNAVAILABLE`

Therefore these observations do not establish a Product 002 implementation regression. They are consistent with the account-wide AppDeploy pause.

No paid request was attempted and no upgrade was purchased.

Product 003 staging verification intentionally uses the underlying authoritative public sources directly, so its GitHub CI and zero-spend source smoke can continue independently of the AppDeploy component apps.
