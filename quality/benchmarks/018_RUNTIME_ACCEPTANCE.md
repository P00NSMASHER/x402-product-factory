# Product 018 — end-to-end predeployment acceptance gate

## Purpose

This is a deterministic, **fully mocked runtime integration canary** for the existing Product 018 GET/OPTIONS routes. It exercises real draft `createFactoryRuntime` → AppDeploy route map → generated paid handler → registry/OFAC/RDAP staging service → x402 verifier and settlement state machine, with in-memory fake source and facilitator responses. It never contacts Pennsylvania, OFAC, RDAP or a payment service.

## Run

```bash
node quality/benchmarks/018-runtime-canary.js --check
node --test quality/benchmarks/018-runtime-canary.test.js
```

The command prints a JSON report containing HTTP outcomes, mock verification/settlement counts, mock source lookup traces, and remaining release blockers. No actual transaction identifiers, source errors, account data or payment signatures are printed. The test fails if a non-chargeable 502 settles, a bad request reaches a provider, a valid multi-ranked PA record is rejected, or a 402 challenge's amount, wallet, chain or USDC asset drifts.

## Transport-data confidentiality

The staged Product 018 service now emits only audited fixed public source-error codes such as `SOURCE_TIMEOUT`, `SOURCE_HTTP_ERROR`, `SOURCE_CONTRACT_INVALID`, or generic `SOURCE_ADAPTER_FAILURE`. It never returns raw provider exception messages or unknown error codes that might contain internal addresses, authorization values, query strings, or secrets. Simulated private exceptions are checked at the full HTTP response boundary.

## Acceptance criteria and blockers

- **Local synthetic acceptance:** all declared scenarios pass at the exact commit (unpaid challenge, preflight, malformed/invalid requests, mock verification failures, completed human reviews, clean proceed, incomplete/contradictory required sources, private-error suppression, and mock settlement failures).
- **Real-world approval still blocked:** authoritative live provider contract samples have not been independently audited at this commit, no actual x402 receipt/reconciliation was tested, actual hosting/provider/facilitator fee schedule remains unmeasured here, and independent buyer and human regulatory/security review are outstanding.
- **Scope:** No changes to product registry, existing price `0.010` USDC, payout wallet, chain/asset, customer PII, product numbering, real merchant, or other products. Product 025+ remains frozen. All related PRs remain draft/unmerged and none is production-deployed.

This gate raises confidence in **implemented draft behavior** but is not a certification that source providers are available, buyer demand exists, any seller is profitable, or production may launch.
