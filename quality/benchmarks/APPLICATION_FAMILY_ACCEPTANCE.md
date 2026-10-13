# Application family v1: observed acceptance

## Implemented artifact

One deterministic generator and shared workflow kernel manufacture three
interactive local document-collection/renewal workspaces. The example recipes
have different requirements and renewal/reminder rules. No commercial catalog
entry or new numbered product is created.

## Observed local evidence (2026-10-13)

- New capability baseline: 45 assertions failed before the workflow engine and
  compiler existed. This is missing-feature evidence, not 45 old-product defects.
- Final Node test batch: 48 tests pass, zero failures. One initial test-harness
  assertion was corrected to decode escaped HTML attribute quotes when inspecting
  Content-Security-Policy; the deny-network policy was not weakened.
- Manufacturing acceptance: 100 configured synthetic editions generated twice
  with identical bytes; manifest artifact hashes checked. Each generated HTML's
  own embedded kernel was executed in a fresh VM through intake -> reminder ->
  receipt -> checklist completion -> suppression of stale reminders -> snapshot
  restoration. 100/100 journeys passed.
- Browser interactions: all three editions at 1440x1024 and 390x844, six passing
  workflows (create intake, record three receipts, verify completeness, run
  deduplicated reminders, inspect history, export snapshot). No browser-script
  errors and zero outbound requests. Additional hostile-name check passed:
  HTML-like names display as text and do not execute or insert image elements.
- Browser environment denies URL navigation, so visual/interaction checks used
  Playwright set_content with the unmodified generated HTML and its CSP. Memory
  fallback was exercised; browser reload persistence is NOT claimed verified.
  Snapshot restoration is verified separately in the actual shared kernel.
- Phone layout inspected and refined to show full work-queue details without
  horizontal table clipping. Screenshots are generated artifacts, not UI mockups.

## Release status

These are local prototypes with synthetic data, not production services or
customer validation. Authentication, secure document storage, hosted delivery,
subscriptions, actual acquisition and sustained autonomous operation remain
future implementation slices. No sales, customer counts, savings or profitability
are asserted. Revenue/customer fields are null, not manufactured zeroes or sales.

The existing repository-wide suite and full GitHub CI must pass before this draft
can be described as integrated. Exact-head CI results belong in the PR receipt.
No independent reviewer approval is claimed. Existing x402 behavior, product
registry, source adapters, wallets, prices, scheduled tasks and release freeze
are outside this change and must remain byte-identical.
