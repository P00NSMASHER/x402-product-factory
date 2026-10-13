# Buyer acquisition and evidence-controlled launch kit

## Delegated outcome
Extend three runnable document-workflow editions from internal synthetic trials toward repeatable buyer research and personalized, nonmisleading outreach **drafts**, without sending messages or claiming demand. The factory may manufacture 1–100 configured editions, but buyer evidence and authorization must remain separate from software acceptance.

## Architecture
1. Pure buyer-target validator reads operator-provided public organization identity (company name, HTTPS company homepage, dated public source URLs, observation codes), not names/emails of people. No browser, DNS, scraping, API keys, form submissions, email or other network effects. Website discovery remains an external input and is not claimed automated. Risky URLs, IP/localhost destinations, contact information, forged statuses, duplicate domains, non-HTTPS URLs and stale observations fail closed.
2. A deterministic scoring/selection plan across at most 300 target organizations maps each to an explicitly chosen document-workflow recipe, produces source-linked research questions, a short outreach **draft** and two follow-up drafts, and sets legal/identity/opt-out/review checks. Marketing claims are recipe-based; no evidence that a target has the implied pain. Documents are never sent.
3. Private operator campaign state supports source input and status transitions, explicit suppress/do-not-contact, ordered follow-up review, idempotent operator-entered events, append-only tamper-evident HMAC. It does not store contact addresses, people, raw interview notes, claims of paid sales, or a send queue; event statuses are only operator reports. Records are bounded, expire from attention as sources become stale, and never unlock messaging or checkout. Forged/tampered state fails closed.
4. The manufacturing compiler includes generic sales-discovery assets alongside each runnable app and an offline operator CLI to turn a supplied public-org research file into a private, source-linked draft kit. Source inputs and personalized drafts stay outside distributed packages.

## Acceptance
- 100 organizations can be screened and draft sets generated deterministically without outbound requests, with explicit qualification questions and no commercial claims.
- A saved suppressed organization is never placed in a follow-up review queue; repeated event keys never double count progress; tampering, wrong key and invalid input fail closed.
- Generic per-app kit is specific to each edition and hash-covered by the package manifest; manufacturing and native browser checks stay green.
- Existing Product 025+, price/wallet, account schedules, billing, live outreach, website deployment and privacy/security release gates remain unchanged.

## Non-goals
No gathering or sending personal contacts; no autonomous public outreach or scraping; no artificial leads/interviews/revenue; no guarantees or prediction of conversion; no unattended campaigns; no real payment; no public hosting. A real outreach launch requires verified sender identity, lawful email practices/opt-out processing, authenticated provider setup, and explicit release authorization.
