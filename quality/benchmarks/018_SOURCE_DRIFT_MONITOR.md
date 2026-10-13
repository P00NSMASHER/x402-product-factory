# Product 018 — scheduled public-source drift watch

## Purpose

Detect source-contract regressions before they affect the existing Product 018 vendor-review workflow. The monitor **reuses** the fixed-public, HTTPS GET-only probe: Pennsylvania registry, OFAC SDN, and IANA/Verisign RDAP. It sends **no customer data, payment headers or transactions**. It cannot screen arbitrary buyers or change product pricing.

## Proposed schedule and activation

GitHub Actions workflow `Factory 018 public source compatibility` adds daily `13:17 UTC` source monitoring (GitHub may delay executions). It also runs on relevant PRs and by manual dispatch.

**GitHub schedules run only from the repository's default branch.** The workflow currently lives in a stacked **draft PR**. Therefore daily monitoring **is not active** until a separately approved merge; PR-triggered checks can validate it immediately.

## Privacy, request and artifact controls

The underlying probe permits only **eight** public GET requests at most, strict host/path and immutable public fixture restrictions, no redirects except the previously verified exact-file signed OFAC GovCloud publication path, and no payment/auth/cookie headers.

Every run writes a **redacted current observation, assessment, and markdown run summary** to GitHub Actions artifacts (35-day retention, subject to repository settings). The monitor reads the most recent completed *same-branch* observation artifact using read-only GitHub Actions permissions. It never writes to the repository or creates issues.

Retained fields are limited to observation time, fixed source IDs, compatibility/error codes, public GET counts, provider-claimed Last-Modified where supplied, and bounded **fixed-public-fixture** booleans/counts. No raw government data, actual names, addresses, OFAC identities, signed URLs, payment payloads, source logs, invoices, account IDs or buyer records are retained.

A genuine first same-branch run with **zero previously completed runs** reports `BOOTSTRAP_BASELINE_PENDING`. If an older completed run is known but its artifact is missing, corrupt, expired, from another branch, outside its Actions run time window, or fails the strict snapshot schema, the monitor returns **HOLD** rather than incorrectly bootstrapping. A failed GitHub run-list query is also **HOLD**, never "first observation."

## GitHub artifact layout compatibility

On the first proposed monitor run, GitHub Actions uploaded all redacted source files from one directory. A subsequent history-file addition temporarily caused the artifact ZIP to preserve the `factory018-current/` directory prefix when multiple upload paths had different parents. The continuity gate **correctly failed closed** instead of claiming an unverified comparison.

The recovered implementation supports only the two known fixed paths (`current.json` at the ZIP root and `factory018-current/current.json`), rejects unrelated nested files, and deletes temporary downloads after schema/time validation. **New artifacts place `history.json` in the same directory as the redacted snapshot** so future downloads use the flat layout again. This is an artifact packaging compatibility fix, not a relaxed source/payment policy.

## Historical integrity and recovery

The additional [baseline continuity gate](018-baseline-continuity.js) reads only previous **same-branch completed** GitHub Actions metadata and redacted artifacts. It checks up to 12 candidates from a bounded 30-run API listing, validates exact prior snapshot schema and file size, binds the observation timestamp to its associated completed run, and compares that selected timestamp with the current drift report.

- **VERIFIED_PREVIOUS:** The most recent completed run contains a valid, in-window redacted source observation. The comparison must use that exact prior timestamp.
- **NO_PREVIOUS_COMPLETED_RUN:** Genuine first run with no preceding completed same-branch run; baseline pending is a notice, not historical proof.
- **HOLD_PRIOR_ARTIFACT_GAP:** The immediately preceding run has no trustworthy observation. An older validated snapshot can be compared for context, but the workflow **still fails** rather than claiming uninterrupted monitoring.
- **HOLD_RUN_LOOKUP_UNAVAILABLE:** GitHub run history cannot be verified, including mismatched branch/completion metadata; the monitor fails rather than fabricating a clean first run.

If a **failed** monitoring run nevertheless wrote a validated *redacted source snapshot* before reporting a history gap, that completed source observation may serve as the immediate predecessor on the next run. A subsequent valid comparison can restore new observation continuity without erasing the previous failed check or overriding production release HOLD. This is the bounded recovery path after a detected gap.

The repository stores neither tokens nor previous API payloads. GitHub's read-only actions token is used only for run metadata and the bounded, redacted artifact, and an allowlisted history status is included in the new current-run artifact. Any future alarm is only a reason to investigate the fixed-public source monitor and **never** a license to change vendor decisions, initiate payments or deploy.

## Alert policy

| Observation | Classification |
|---|---|
| All three public adapters compatible and no meaningful change | No blocking drift |
| First compatible run with no prior artifact | Baseline-pending notice |
| Provider-reported publication time moves forward | Informational update |
| Provider date was present and disappears | Nonblocking metadata warning |
| Official source becomes incompatible/unavailable or access policy blocks it | **ALERT — fail workflow** |
| Provider date moves backwards, becomes future-dated or crosses operational stale threshold | **ALERT — fail workflow** |
| PA / OFAC fixed public-fixture counts or monitored source semantics change | **ALERT — manual review required** |

Investigation thresholds: **30 days** for PA registry and **14 days** for OFAC provider-reported Last-Modified dates. These are *operational alerts*, not legally mandated update cycles or authenticated proof of currency. RDAP Last-Modified may be absent, in which case freshness remains **unknown**, never assumed current.

A failing job reports fixed, allowlisted reasons through GitHub Actions annotations and the failed-workflow status. It does not automatically change product decisions, prices, owners, payments or deployments.

## Reproduce

```bash
node --test quality/benchmarks/018-source-drift.test.js
node --test quality/benchmarks/018-baseline-continuity.test.js
node --test quality/benchmarks/018-live-source-probe.test.js
```

Only in an authorized environment for public GETs:

```bash
node quality/benchmarks/018-source-drift.js --capture /tmp/018-prior/current.json /tmp/018-new/current.json /tmp/018-new/report.json /tmp/018-new/summary.md
node quality/benchmarks/018-source-drift.js --enforce /tmp/018-new/report.json
```

Comparisons reject unapproved snapshot fields, invalid timestamps, unknown error codes, impossible counts, inconsistent event severities or forged release-approval claims. A green public source watch **does not authorize commercialization**: real settlement/reconciliation, current full cost evidence, independent customers, legal/privacy/security review, and Product 025+ restrictions remain separate and unchanged.
