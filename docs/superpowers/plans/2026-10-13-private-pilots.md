# Private self-service evaluation implementation plan

Goal: automate invitation-only synthetic onboarding and record committed workflow observations without promoting them into commercial demand evidence.
Architecture: transactional v2 invitation/event tables extend the existing runtime. Browser routes reuse opaque sessions and CSRF protections; packaged apps inherit the same components.
Spec: ../specs/2026-10-13-private-pilots.md
Execution: inline under the owner's explicit delegation. No independent review claimed.

- [ ] Test-first: activation/resume/isolation, expiry/revocation/leases, consent, private usage, v1 migration and restore invalidation.
- [ ] Implement invitation lifecycle with atomic tenant/workspace creation, first-outcome and active-day counters derived from committed commands.
- [ ] Wire same-origin browser activation, a local invitation preview link, private CLI issue/revoke/report, and evaluation status.
- [ ] Extend recovery validation to v2 while preserving v1 recovery and invalidating all restored pilot grants.
- [ ] Include new modules in deterministic packages and prove the complete native desktop/mobile pilot journeys against packaged code.
- [ ] Run the complete repository suite, focused tests and all exact-head CI; record real results and release limits.

Constraints: no public launch, real buyer data, customer outreach, billing, pricing/wallet changes, spending or account-schedule edits. Invitations are bounded 7-day defaults; no external analytics endpoints. Raw invitation codes only in newly created private files or in-memory session exchanges.
