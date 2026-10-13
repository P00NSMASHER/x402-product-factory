# Autonomous Candidate Factory Implementation Plan

Goal: select and execute one meaningful offline full-stack application candidate per six-hour UTC slot without manual prompts.
Spec: docs/superpowers/specs/2026-10-13-autonomous-candidate-factory.md
Stack: Node.js 22.13+, existing shared workflow kernel and full-stack acceptance, GitHub Actions.

- [x] RED catalog test for 72 distinct document-workflow recipes; GREEN curated 24 by 3 catalog.
- [x] RED cycle test for slot selection, no duplicates, exhaustion, strict limits and release hold; GREEN deterministic planner.
- [x] RED packaged acceptance tests for build, reuse, quarantine, tamper, source drift, no income claims; GREEN engine and receipts.
- [x] RED CLI test for noninteractive invocation, strict flags, plan and exhaustion; GREEN safe CLI.
- [ ] Verify Linux full packaged-service acceptance, full inherited CI, read-only scheduled GitHub workflow and workflow_dispatch.
- [ ] Confirm exact-head receipts and independent product review remains pending.

Constraints: no real customer data, automatic public release, contacts, marketing sender, purchases, payments or new numbered products. CI schedule starts only after reviewed merge into default branch.
