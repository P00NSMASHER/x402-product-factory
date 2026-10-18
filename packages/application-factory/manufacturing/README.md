# Full-stack application manufacturing

The factory can now assemble **complete runnable local applications**, not just browser-only prototypes. One shared source stack is packaged with one selected workflow recipe. Each accepted directory includes its browser UI, scoped server API, persistent workflows, internal worker, opt-in encrypted evidence, and opt-in encrypted recovery. There are no external runtime package dependencies or generated customer credentials.

## One command

From the source repository, with Node.js 22.13 or later:

```sh
node scripts/manufacture-applications.js --output /absolute/private/manufactured-applications
```

This compiles the three existing recipes, runs each package through a separate real local workflow process, accepts passing directories, and writes replaceable progress to `manufacturing-report.json` plus digest-addressed, write-once per-package receipts in `verification/`. No app is deployed or kept running. To run an individual candidate, follow its generated README and keep its private state outside its application directory.

The same command can be rerun. An existing content-addressed package is verified and **executed again** before reuse; it is not rebuilt or trusted merely because an old report said it passed. The fresh deterministic acceptance must match the original write-once receipt, whose bytes and filesystem identity remain unchanged. A changed receipt fails closed instead of being repaired from the later run. The compiler computes the expected digest from current source bytes and the selected recipe. A checksum supplied by an untrusted party is not an authenticity guarantee.

`--recipes /absolute/path/to/recipes.json` accepts 1–100 validated document-workflow recipes. This is configuration manufacturing, not support for arbitrary uploaded code, new commercial product numbers, or proof that cloned editions have distinct customer demand. Duplicate IDs are rejected. The default numbered-product registry and payment paths stay unchanged.

## Failure handling

Failed execution receives at most two attempts by default (the internal bounded API supports 1–3). An edition that keeps failing receives a sanitized, persistent quarantine receipt; healthy editions continue. Repeated commands skip quarantined identities until `--retry-failed` is explicitly supplied. Corrupted existing artifacts are never overwritten by retries. A new source/recipe digest produces a new directory and leaves older outputs in place.

A shared private single-writer lock prevents overlapping document, quote and inventory builds. Normal completion/failure removes it. After a forced process death, a later command reclaims only a well-formed lock whose recorded local PID is definitely absent; it hard-links the original lock into private `.lock-history/` first and writes a separate immutable recovery event with the actual observation time. If that recovery itself stops after the event is durable but before lock removal, the next run verifies and reuses the exact event without replacing its bytes or timestamp. Active, malformed, unsafe and permission-ambiguous locks or recovery evidence fail closed. Interrupted temporary build directories are not accepted packages. They contain source only and may need operator cleanup. There is no distributed build scheduler or installed timer.

## What acceptance actually executes

The verifier starts a bounded child process with operator keys, proxy variables, `NODE_OPTIONS` and `NODE_PATH` excluded. It imports the **assembled package's own files**, provisions synthetic private credentials through the packaged CLI, exercises its real HTTP browser-session and machine boundaries, retries intake, uploads/downloads encrypted evidence, lets the timer-driven worker create an internal notification, completes required receipts, verifies paired backup/restore, rejects restored old credentials and resumes without duplicate notices. A second packaged CLI process checks state after restart. Synthetic state and secrets are deleted rather than included in the artifact.

A separate native Chromium CI check loads each manufactured app at desktop/mobile sizes, completes the UI workflow and encrypted attachment transfer, closes the page while the worker runs, reloads saved work, and checks overflow/errors. The inherited whole-repository and connected-browser CI jobs remain unchanged.

The 100-edition unit stress test does perform 100 deterministic file assemblies and integrity checks, but uses an **injected test receipt** instead of 100 real service launches. Its report explicitly says `injected-test-only`. The default three-edition CLI and CI acceptance execute real packaged services. Neither test counts as customer activity or revenue.

## Provenance and limits

All package files come from an explicit allowlist plus fixed generated README/catalog/package metadata. No source crawling, `.env`, database, credentials, tests, unrelated paid API, or dependency installation is included. A per-file SHA-256 manifest and expected package digest reject modified, missing, extra and symlinked files. The source root is trusted operator code, not an untrusted-code sandbox.

`accepted` means **passed these local implementation tests**. It does not mean security reviewed, licensed for public release, market validated, revenue generating, production hardened or hosted. Sessions still use operator keys and loopback HTTP. File signature checks are not malware scanning. Keys, retention, off-site recovery, public identity, TLS, real messaging, billing, support and customer acquisition remain outstanding. Subprocess bounds are operational limits, not adversarial sandbox isolation. Same-source Windows CRLF checkouts may produce different byte hashes; reproducibility requires identical source bytes.

Draft, unmerged and undeployed. No live customer data, external delivery, payments, price/wallet changes, account schedule changes, public product launch or Product 025+ unlock. Self-review is not independent approval.
