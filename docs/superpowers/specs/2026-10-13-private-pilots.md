# Private self-service evaluation lifecycle

## Delegated objective
Connect the manufactured applications and pilot previews to an executable, low-touch evaluation workflow. The owner delegated choosing and implementing the next upgrade without another prompt. This is not approval to launch publicly, collect real buyer information, charge, send invitations, or change account schedules.

## Scope
An operator issues random private evaluation codes for one existing recipe. A local browser user explicitly consents to synthetic-only testing, redeems a code, and automatically receives one isolated persisted workspace. The code resumes the same trial on later visits; expired/revoked invitations cannot reactivate access. No buyer names or contact details are requested. Invitation issuance defaults to seven-day validity and a seven-day evaluation duration, with bounded configuration and issuance capacity.

Add v2 runtime tables for invitation lifecycle and minimal operational events. Provisioning invitation, tenant, workspace and activation event occurs in one transaction. Actual committed intake/checklist commands, not browser analytics claims, produce idempotent synthetic usage counters and first-outcome timing. These observations never enter or satisfy the operator-attested Growth Lab's buyer/payment evidence. Customer/revenue fields remain null.

Credential-derived tenant checks enforce trial expiry on API and browser reads/writes, attachment access and worker claims/commit. Existing operator accounts retain their behavior. Browser trial login retains same-origin, CSRF, bounded session/rate controls and private-state clearing. The preview exposes an invite-only local evaluation link, not public signup or checkout.

Recovery accepts both prior v1 and new v2 schemas. Restoring v2 invalidates every invitation as well as resetting existing credential digests and pausing automation; prior codes and post-backup revocations must not regain access. No live data is overwritten. Generated applications include all new runtime dependencies and a local CLI for issue/revoke/report; issue output writes secrets only to new private files.

## Acceptance
Prove isolated/repeat-safe provisioning, bounded codes/consent, session/credential revocation, expiry without a browser, lease fencing, no counter duplication after request replay, privacy-preserving usage, v1 migration, v2 recovery invalidation, and native desktop/mobile invitation journeys through the actual manufactured packages. Keep inherited full tests and manufacturing/browser checks. No independent security review or demand evidence is claimed.
