# Sales Command Center: private, read-only operator review

The sales command center connects existing HMAC-checked public-organization research, operator-reported outreach and separately operator-attested Growth Lab buyer conversations. Its primary job is deciding which app needs real buyer interviews, not generating another collection of products.

It produces a private static index.html with research, suppression, qualified conversations and manual review priorities, plus board.json, a markdown action brief and an SHA-256 integrity manifest. No scripts, marketing pixels, personal buyer contacts, email addresses, send functions, live checkout, or recurring scheduling. Clicking a validated HTTPS public homepage is an intentional operator action, not automated tracking.

## Offline operator usage

Node.js 22.13+ is required. First initialize the existing signed acquisition campaign using scripts/create-acquisition-kit.js. Store the campaign key in a private 64-hex-character key file, not in the repository.

Run (replace all paths with private absolute local paths):

    node scripts/build-sales-command-center.js build --campaign /absolute/private/campaign.json --campaign-key-file /absolute/private/campaign-key.hex --output-dir /absolute/private/sales-report --as-of 2026-10-13

If an existing Growth Lab ledger holds separately reviewed external buyer evidence, include all three of these options:

    --proof-ledger /absolute/private/proof.json --proof-key-file /absolute/private/proof-key.hex --reviewer-key-hash <digest-of-reviewer-secret>

The angle-bracket value is a placeholder for a 64-hex-character SHA-256 digest, not the secret. The CLI refuses invalid/missing/symlinked/forged sources or keys and never overwrites an existing output directory. Existing ledgers are READ only: no email, invite, charge or account change.

## Evidence interpretation

- Public organizations researched: company website research, **not** qualified contacts or purchasing intent.
- Reported outreach/replies/interest: operator-entered event labels, **not** independently verified conversations.
- Qualified conversations: only separately operator-attested external Growth Lab events. Synthetic usage remains zero here.
- Verified independent buyers remain zero and independent collected revenue remains unknown until authorized processor/reconciliation evidence exists.
- Suppressed/no-contact organizations never enter the action queue; seven-day follow-up only recommends manual review.
- A Growth Lab scale_review recommendation still requires separate commercial/legal/privacy/security release authorization. The board cannot deploy, send, bill, unlock Product 025+, amend pricing/wallets or alter schedules.

Run tests:

    node --test packages/application-factory/sales/*.test.js

The static export is a dated snapshot, not a connected CRM or always-on agent. The integrity file detects file changes, but is not a bank or independent sales certificate. All outputs are local and draft-only; no verified sale or user customer was created.
