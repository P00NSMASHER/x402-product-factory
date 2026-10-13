# Connected workspace implementation plan

Goal: a working browser-to-durable-runtime flow for all existing recipe editions.
Spec: ../specs/2026-10-13-connected-workspaces.md
Execution: owner-delegated inline work; self-review, not independent security approval.

1. Write and run failing session/real-HTTP tests before modifying the service.
2. Add bounded opaque sessions and `/app` routes; preserve `/v1` restrictions.
3. Add shared responsive workspace interface and resilient idempotent request client; test real browser tasks and failure recovery.
4. Verify inherited runtime behavior, cross-tenant restrictions, restart recovery and autonomous inbox updates; use full exact-head CI for complete repository acceptance.
5. Commit only the reviewed increment to a stacked draft, record actual evidence, leave commercial release/deployment unchanged.
