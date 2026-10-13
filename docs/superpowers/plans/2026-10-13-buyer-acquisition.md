# Buyer Acquisition Kit Implementation Plan

> **For agentic workers:** Use test-first implementation, adversarial validation, and the repository's existing full CI plus independent manufacturing/browser gates.

**Goal:** Build a mass-produced buyer discovery and outreach-draft system with durable suppression and evidence boundaries.

**Architecture:** The existing recipe compiler produces truthful edition-specific discovery kits; an operator-only CLI converts validated public organization references into draft outreach. A private signed campaign state stores review milestones, not messages sent or independent demand proof.

**Tech Stack:** Node.js 22, built-in `crypto`/`fs`/`path`, Node test runner, existing deterministic application-family compiler.

**Spec:** `docs/superpowers/specs/2026-10-13-buyer-acquisition.md`

## Global constraints
- Every output is draft-only; no network calls, email, checkout, launch or Product 025+ unlock.
- Never store personal email, phone, names of natural persons, credentials, invoices or raw customer evidence.
- No target entered by the operator is automatically labeled a paying/qualified customer.
- Keep every previous security, source, payment and release gate unchanged.

## Tasks
- [ ] Write failing tests for organization source validation, duplicate detection, fit ranking and three-stage draft generation. Implement `growth/prospecting.js`, then run green suite.
- [ ] Write failing tests for append-only private campaign review states, explicit suppression, idempotency and HMAC tamper detection; implement `growth/campaign.js`.
- [ ] Implement `scripts/create-acquisition-kit.js` for private operator-generated research drafts and state review; prove with actual child-process tests; no recipient transmission.
- [ ] Add generic per-edition sales discovery assets to `manufacturing/assembler.js`; test manifest integrity and exercise all three editions.
- [ ] Add additive CI and independent no-network/default-off checks; run complete repo suite and packaged-browser flows. Release as stacked draft PR only with verified evidence.

## Review focus
- A target with a forged “verified buyer” status stays untrusted.
- A target containing private email/phone is refused rather than copied to a draft.
- A suppressed target remains suppressed despite a fresh import or review event.
- Tampered signed campaign state cannot silently reset opt-outs.
- Source observations cannot be marketed as proof of a buyer's internal pain or willingness to pay.
