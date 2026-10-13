# Buyer acquisition kit — offline, draft-only

**Commercial status:** research-only. This creates reviewable organization-level prospect packets; it does **not** find contacts, send messages, collect inbound requests, issue real invitations, charge money, prove demand, or release products. The current products are still synthetic/local implementation candidates.

## Start with publicly observable organizations

Provide one research record per organization with an approved HTTPS homepage, dated evidence URL and a short publicly observable signal. Do not supply personal names, emails, phone numbers, private records or inferred purchasing interest. No DNS/website verification occurs; all input remains **operator-provided and unverified** until separately reviewed. Observations older than 180 days or future-dated records fail validation.

```json
{
  "schemaVersion": 1,
  "targets": [
    {
      "company": "Example Industrial Distribution",
      "homepage": "https://example.org",
      "recipeId": "supplier-desk",
      "observations": [{
        "url": "https://example.org/about",
        "observedOn": "2026-10-13",
        "signal": "business_category",
        "note": "Public company website describes industrial distribution products."
      }]
    }
  ]
}
```

The example organization is fictional and is not a real lead or a verified customer. Supported signal codes: `business_category`, `document_collection`, `renewal_process`, `client_onboarding`, `supplier_intake`, and `multi_location`.

From the source repository (or one built application package), Node.js 22.13+:

```sh
node scripts/create-acquisition-kit.js plan --input /absolute/private/targets.json --output-dir /absolute/private/review-001
```

The tool writes a `buyer-research.md` review packet, `research-queue.json`, and an integrity hash list. One input may contain up to **300 organizations**; repeated company domains fail closed. The output directory must not exist and its parent must be private. No messages are sent. Each company's draft references only the selected recipe, not claims that its team has a problem or wants to buy. Each draft requires independent human review, sender identity, unsubscribe handling, source verification, and commercial approval before use.

## Private follow-up review (operator-only)

Optionally use a different 256-bit private campaign key (64 hex characters plus newline in an owner-private file). Never put the key in Git, shell arguments, or any generated app artifact.

```sh
node scripts/create-acquisition-kit.js init --input /absolute/private/targets.json --ledger /absolute/private/campaign.json --key-file /absolute/private/campaign.key
node scripts/create-acquisition-kit.js event --ledger /absolute/private/campaign.json --key-file /absolute/private/campaign.key --domain example.org --kind reviewed --request-key reviewed-001
node scripts/create-acquisition-kit.js report --ledger /absolute/private/campaign.json --key-file /absolute/private/campaign.key
```

Valid operator-reported review events: `reviewed`, `reported_outreach`, `reported_reply`, `reported_pilot_interest`, `not_interested`, `do_not_contact`. They enforce review and response sequences, idempotency and do-not-contact suppression; the program cannot actually send mail. Follow-ups are **manual review suggestions** no sooner than seven days after an operator-reported outreach event, not scheduled dispatches. Reimports cannot erase suppressions. Raw contacts and customer data are neither required nor accepted. The HMAC ledger detects unkeyed modification but is not independently verified evidence, and anyone with the private key can fabricate it; never mistake reported interest for paid sales. The separate Growth Lab requires independent review of original off-system proof before scale recommendations.

## Manufacturing integration

Each generated application includes its own per-edition `growth/qualification.json` and `growth/research-questions.md` plus the same validated offline CLI, covered by the package content hash. The acquisition assets are source-independent of the live internal workspaces, do not get browser access to campaign state, and do not modify the number-001–024 product registry, payment paths, wallets, application account schedule, or customer data. The three pilot-preview landing pages remain noncommercial.

## Missing before a commercial release

External market evidence, seller legal/commercial identity, U.S. anti-spam/privacy compliance, provider-authorized opt-out controls, independent security review, actual permission to deliver email, live buyer consent, hosted enrollment, real payment validation and operating profitability. **Draft, unmerged, undeployed; release HOLD and Product 025+ freeze unchanged.**
