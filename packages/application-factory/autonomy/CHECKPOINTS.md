# Durable autonomous candidate checkpoints and fleet board

**Purpose:** The autonomous factory currently runs in short-lived GitHub Actions Linux runners. Each fresh job normally loses yesterday's output, so previously accepted apps can be built and verified again without meaningful customer value. This upgrade restores a compatible, source-verified snapshot of prior accepted synthetic applications before each new run, preserving legitimate work and preventing duplicate claimed releases.

## Cross-run operation

The existing **Autonomous App Candidate Factory** GitHub Actions workflow (still a draft-branch check) now requests **contents: read, actions: read** only. It selects the latest **successful run on the same branch** via GitHub's own token, retrieves that run's named candidate artifact into an isolated private directory, sets owner-private permissions, and invokes the restore CLI. It neither fetches artifacts from another PR nor requires a personal access token. A missing first-run predecessor starts clean; failed/expired source retrieval is an explicit gate, not silently treated as success.

The importer scans at most the **32 newest six-hour receipts**, caps restored packages at **12 MiB**, verifies each saved `executed-packaged-workflow` acceptance against the current application source, checks the complete app manifest and independent verification receipt, then copies **only accepted packages and the matching evidence** to the new private output directory. Synthetic injected-test fixtures and quarantines are **not promoted**; incompatible older-source artifacts are reported as stale and not copied. Existing files cannot be silently overwritten. Failures leave an explicit private checkpoint lock or incomplete candidate that must be reconciled rather than guessed healthy. Current-cycle verification uses its **pinned UTC time** and digest-bound receipt; it does not assume only one previous receipt exists.

Run a checkpoint restore on trusted private state (Linux Node >=22.13.0):

    node scripts/restore-autonomous-checkpoint.js --source /absolute/private/extracted-previous-run --output /absolute/private/current-state --max-cycles 32

The isolated CLI refuses relative paths, unsafe permissions, symbolic links, conflicting target files, tampered records, forged accepted counts, incompatible manifests and injected-test-only candidate status.

## Private fleet dashboard

Each GitHub workflow run exports a self-contained, responsive read-only `portfolio/index.html`, `portfolio/fleet.json` and `portfolio/integrity.json` alongside the candidate package artifact. The fleet checks up to 24 prior six-hour slots by default (hard maximum 64) using the existing source-aware supervisor, and separates **genuinely verified apps**, pending, quarantined, unexercised test fixtures, and missing research. Native 1440px and 390px Chromium acceptance runs against a real synthetic full-stack build and checks no script execution, outbound network or payment links.

Operator local invocation:

    node scripts/export-autonomous-fleet.js --state-dir /absolute/private/current-state --output-dir /absolute/private/current-state/portfolio --lookback 24

This command refuses overwriting an existing report and emits digest-checked files. The HTML is static with a restrictive Content Security Policy. No login, public business page, conversion action or buyer contact collection is added.

## Important operating limitations

- **Source checksum and GitHub success do not constitute independently authenticated commercial proof.** A maintainer controlling GitHub sources and artifacts could forge historical synthetic results. Independently audited customers, revenue, security certification and compliance remain unknown.
- **GitHub Actions artifact retention is seven days.** This is a bounded same-branch engineering checkpoint, **not permanent persistent cloud storage or off-site customer backup**. A downtime longer than retention or a branch identity change may require reconstruction from audited source. The recovery supervisor separately has an eight-slot/48-hour catch-up horizon when persistent private state exists.
- The original six-hour scheduled GitHub workflow still triggers **only from the default branch**, so this stacked **draft PR has not activated GitHub's cron**. The existing ChatGPT six-hour automation continues its authorized research and draft-CI work independently; its cadence/name and all other tasks are unchanged.
- GitHub Actions minutes might use the account's existing allowance. No paid API, independent server, hosted real SaaS, public publishing, outbound emails, personal buyer data, card charges or new numbered paid x402 products are activated.
- A runner build receipt is not market fit. These are synthetic document-workflow candidates with releaseApproval=false, realCustomers=null, collectedRevenue=null.
- Source provenance and release gates remain unchanged. Real customer credentials and proprietary files must **never** be placed in these CI artifacts. Do not treat this as live backup or key escrow.
