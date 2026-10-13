# Autonomous Candidate Factory — design

Intent: user wants the factory to continually build candidate apps without per-app human prompts. Preserve all existing commercial restrictions, no real customer records, no paid deployment, spend or outbound contact. New limited scheduled synthesis must be truthful: distinct workflow configurations, not fake revenue or guaranteed profitability.

Alternatives considered: unrestricted LLM self-deploying startups (unsafe, billable and unverified); endless duplicate template renaming (false uniqueness); bounded source-controlled buyer workflow catalog and scheduled acceptance (selected).

Implementation: 24 curated B2B document-workflow jobs times 3 functionally differentiated workflows produce 72 meaningful recipe configurations on the current kernel. One candidate per six-hour UTC slot is selected deterministically, passed to the existing full-stack manufacture-and-exercise harness and quarantined if unsuccessful. No new numbered product IDs or external API keys. Repeat invocations reuse only verified content-addressed outputs and cannot silently change within one cycle. Reporter writes a bounded private cycle receipt, with explicit false commercial validation and zero external messages/payments.

GitHub Actions: read-only schedule, PR test and dispatch, timeout nine minutes, artifact retention seven days. The scheduled cron only runs once the file is in the default branch; the current draft does not activate it. CI runners can consume account minutes. Quality over volume: when 72 verified configurations are exhausted, request a catalog refresh instead of automatically fabricating clones. Independent market proof remains unknown.

Acceptance: unique recipes and rules, 72-slot no-repeat behavior, max two per cycle, tamper/drift rejection, source safety, separate acceptance of packaged Linux services, negative tests, full existing CI and browser tests. No human needed for each build once the reviewed cron is active; this does NOT eliminate review for real sales/security changes.
