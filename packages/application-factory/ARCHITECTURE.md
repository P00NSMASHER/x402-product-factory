# Application Factory — architecture and maintainability boundaries

## Guiding architecture

The factory is **three autonomous workflow families**, not 23 independent backends. Each family has one isolated application state machine and a set of source-controlled workflow recipes. Compilers assemble runnable **self-contained** Node.js/SQLite packages. The shared manufacturing contract introduced here is **build time only**: generated packages never depend on the source repository.

```text
Unverified workflow research / recipes
          │
          ├── Document-workflow kernel/runtime
          ├── Quote-to-order kernel/store/server
          └── Inventory-control engine/store/server
          │
     Family-specific compiler
          │
     SHARED BUILD-ONLY CONTRACT
   ┌─────────────────────────────────────────┐
   │ trusted input files · private directories│
   │ canonical manifest/file SHA-256 checks  │
   │ mutable progress + write-once receipts   │
   └─────────────────────────────────────────┘
          │
     Independent FAMILY acceptance
          │
  Approved-for-private-synthetic binary receipt
          │
  Autonomy checkpoints ──> private previews /
                          local crash recovery
```

### Boundary ownership

| Owner | Responsibility | Deliberate non-responsibility |
|---|---|---|
| `kernel.js` + `runtime/` | Document CRUD, tenancies, encrypted evidence, worker, renewal workflows | Quote/order inventory state |
| `quote-family/kernel.js`, `store.js`, `server.js` | Quote totals, role-separated approvals, idempotent order handoffs | Supplier orders, payments |
| `inventory-family/engine.js`, `store.js`, `server.js` | Quantity arithmetic, internal reorder approval, role and tenant isolation | Real purchases, invoicing |
| `manufacturing/shared-contracts.js` | Trusted *build inputs*, manifest/file hash integrity, private paths, atomic mutable progress, digest-addressed write-once acceptance receipts, evidence-preserving local process locks and bounded incomplete-stage preservation | Business workflow rules, runtime import, network transport |
| Family-specific `manufacturing.js` or `manufacturing/line.js` | Exact manifest schema, documented family recipe, independently executed acceptance | Cross-family business policy |
| `autonomy/` | Six-hour engineering slot selection, missed-cycle repair, source-pinned checkpoint reuse | Customer demand claims or public launch |
| `deploy/` | Verified private local app boot, browser QA, bounded crash recovery and source-pinned gateway | Commercial/public hosting |

### Safe extension rules

1. New application workflow recipes extend an existing family **without changing** its native business invariant (quote approval, stock handling, tenant boundaries). A distinct new business *state machine* should be a separate family.
2. Shared build contracts accept **explicit allowlists** of expected bundle file names; they reject missing or injected files, symlinks and hash mismatches. Keep manifest family metadata and independently executed receipts in the family owner, rather than placing business logic in the shared helper.
3. The build-only helper must **not be copied into standalone applications** and cannot become a dependency of generated app `run.js`, `store.js`, `server.js` or kernel. Tests assert these boundaries.
4. Never loosen `releaseApproved:false`, sandboxed synthetic data, owner-private credential storage, least-privilege permissions, role separation, idempotency or cross-version schema guards to improve test green rates.
5. Changing a compiled application binary must change its content-addressed package digest. Reorganizing *build-time* code without changing inputs must preserve byte-identical package digests. The accepted pre-refactor quote/inventory manifest SHA-256 snapshots are compared **only while the previous source/recipe input fingerprint matches**.
6. Keep automated browser, real packaged SQLite/HTTP, crashed-listener and whole-launcher recovery proofs independently executed. A static manifest validation is not a substitute.
7. The GitHub schedule declared only in stacked draft branches **does not run on main**. No draft should be represented as an activated public service or paying business.
8. Accepted lifecycle evidence is keyed by the exact package digest and is write-once. A repeat run must independently execute the package, match the original receipt bytes and leave that receipt untouched; progress reports remain separately replaceable. Document, quote and inventory failure evidence uses one shared digest-keyed write-once contract with the actual observation time. An explicit retry can recover a package but cannot erase or replace the first failure. Legacy quarantine records remain readable and apply only to their recorded digest.
9. Local process-lock recovery is deliberately narrow: only a valid lock whose recorded PID is definitely absent can be reclaimed, and the original lock plus a true-time recovery observation are preserved immutably before reuse. If recovery is interrupted after that observation becomes durable, it resumes only when the exact archive/event pair validates, without rewriting the observation. A future-dated owner record holds unchanged rather than producing an observation that predates its claimed start; a recovery event is never backdated execution evidence. After exclusive ownership is restored, bounded valid staging trees are moved unchanged to private incomplete history only after an immutable true-time tree-digest event is durable. Unsafe or ambiguous trees hold unchanged and are never treated as accepted work.

### CI checklist

`node --test packages/application-factory/manufacturing/*.test.js` confirms the shared input and private manifest rules, as well as existing document family acceptance. Full CI also executes `quote-family`, `inventory-family`, real manufactured candidate services, desktop/phone browser journeys, private operator-gateway tests, no-contact release gates and authenticated synthetic state recovery.

A source package hash is an integrity checksum, **not** a signed third-party attestation or independent security review. New production infrastructure, people, customers, money, public exposure, permissions and communications require separate owner authorization.

### Next maintainability priorities

After the shared build-contract refactor: simplify the **long stacked PR integration graph** with a single read-only, exact-head review manifest and direct dependency check; make deploy/checkpoint receipts enforce versioned schemas; and preserve a documented compatibility path for existing private test state. These are separate change sets, not implicit permissions to merge, activate schedules, or publish.

