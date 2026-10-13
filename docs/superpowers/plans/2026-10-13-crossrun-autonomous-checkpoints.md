# Cross-run autonomous candidate continuation — implementation plan

Goal: Restore recent verified packages into new CI runners, prevent repeat work and publish a private offline fleet health report.

Stack: Node.js >=22.13.0, existing application assembler/acceptance/supervisor, GitHub Actions token with read-only actions permission.

- [x] Write failing behavior tests for verified cross-run restore, conflicts, fixtures, corruption, symlinks, rate limits, prior quarantine, and no commercial outcomes.
- [x] Implement private checkpoint importer with 32-cycle, 12-MiB caps and digest/provenance checks.
- [x] Write failing fleet ledger and static responsive UI tests, then implement exact-source status checks and no external scripts.
- [x] Add strict CLI tests and guarded restore/export scripts, including explicit no-overwrite and independent child processes.
- [x] Wire GitHub same-branch successful artifact download with actions:read only, staging/permission normalization, artifact restoration, pinned-current-cycle verification and private fleet export.
- [ ] Run the complete repository, standalone autonomy, and native 1440px/390px browser acceptance checks on exact head. Capture truthful red-green case where earlier CI wrongly required exactly one receipt after a four-app restore.
- [ ] Document verified GitHub run URLs, technical vs commercial status, artifact retention and inactive default-branch cron, without changing user task schedules.

All generated apps remain synthetic and commercial release is held. A successful artifact restore does not authorize public hosting, credential collection, charges or customer outreach.
