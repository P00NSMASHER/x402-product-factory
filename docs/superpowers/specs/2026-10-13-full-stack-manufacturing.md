# Complete-application manufacturing

## Delegated outcome
Turn the already approved mass-production direction into a repeatable assembly line for runnable applications, rather than generating only standalone browser prototypes. Reuse the existing three recipe editions and the existing server/browser/evidence/recovery components. No new paid product IDs, public launch, price/payment changes or account schedules.

## Architecture and scope
A deterministic compiler copies an explicit source allowlist, generates an edition-specific one-recipe catalog and operator instructions, and hashes every output. Build packages exclude secrets, live state, source tests, and unrelated paid APIs. Verification requires the expected digest and rejects any changed, missing, extra, or symbolic-link file.

A resumable serial manufacturing runner assembles each edition, runs a separate child process against the assembled files with synthetic state, and accepts output only after full workflow checks. Bounded retry isolates failed editions and keeps accepted artifacts immutable; reruns verify and reuse existing accepted candidates. Persistent quarantine receipts prevent repeated unbounded attempts until explicitly retried. This is an operator-run assembly line, not an installed scheduler or autonomous marketing business.

The acceptance process starts the packaged runtime itself, proves tenant separation and persistence, uploads/downloads encrypted evidence, runs browser-independent automation, verifies backup/restore and credential invalidation, and emits actual observed counts. All temporary state, credentials and encryption keys are destroyed instead of packaged.

## Acceptance boundaries
Default production assembles all three existing editions. Manufacturing tests also cover a batch of 100 valid synthetic configurations, restart reuse, integrity rejection, isolated failures and retained previous outputs. Full repository CI and inherited native-browser acceptance remain mandatory. A new read-only CI job exports only tested runnable packages and bounded receipts. No hosted deployment, real customer use, acquisition or revenue is claimed.
