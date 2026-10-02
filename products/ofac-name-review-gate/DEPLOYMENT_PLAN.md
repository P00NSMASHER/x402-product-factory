# Product 009 deployment plan — OFAC Name Review Gate x402

Status: **live-source-verified staging**. Production deployment is deferred while AppDeploy is account-limit paused.

## Contract
- Route: `GET /api/ofac-name-review-gate`
- Price: **$0.003 USDC** / 3000 atomic units
- Inputs: `name`, optional `minScore` 70–100 (default 90)
- Decisions: `candidate_found`, `no_candidate`, `human_review`

## Source
Current U.S. Treasury OFAC SDN primary-name and alias CSV publications.

## Claim boundary
This is deterministic first-pass name/alias screening only. A candidate is a review signal, not a legal sanctions determination. A `no_candidate` result is not sanctions clearance. OFAC 50 Percent Rule ownership analysis is not included.

## Live verification

Coordinated GitHub Actions current-source smoke:
- query: `OpenAI OpCo`
- threshold: `90`
- decision: `no_candidate`
- candidate count: `0`
- source: current U.S. Treasury OFAC SDN primary names and aliases

The smoke proves current OFAC source transport, CSV parsing, deterministic scoring execution, and the no-candidate path. Candidate-match scoring is covered separately by deterministic unit tests.

The result limitations explicitly state that `no_candidate` is not sanctions clearance, a candidate is not a legal sanctions determination, and OFAC 50 Percent Rule ownership analysis is not included.

## Deployment blocker
AppDeploy weekly Free-tier reset reported as `2026-10-05T00:00:00Z`. No upgrade/spend authorized.
