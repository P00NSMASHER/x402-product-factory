# Encrypted document evidence — local-development candidate

This addition attaches **bounded binary evidence** to the existing three connected document-workflow editions. It reuses the operator-issued session, tenant-scoped server runtime, and existing workflow requirements. It is **not** a hosted production storage or document-validation service.

## Data and protections

- Upload only `application/pdf` (.pdf), `image/png` (.png), and `image/jpeg` (.jpg/.jpeg), each at most **256 KiB**. The server checks MIME, filename, and fixed leading-file signatures; this is **not** malware scanning, deep file validation, or evidence authenticity checking.
- A separate private SQLite database stores each encrypted blob with AES-256-GCM, a fresh random 96-bit nonce and an authentication tag. Authenticated associated data binds the tenant, workspace, record, requirement, filename, type, size, checksum and timestamp. A wrong encryption key or tampered row fails closed.
- Unique per-workspace idempotency keys prevent duplicated uploads when client responses are lost. Metadata is listed independently of encrypted bytes; downloads always use `Content-Disposition: attachment` and `application/octet-stream`, never inline HTML/PDF/image rendering.
- The backend authorizes every operation against the **server-resolved tenant** and an existing workspace. Uploads require a non-archived record and a recipe-defined document requirement. Browser uploads require the existing same-origin cookie and CSRF protections; machine clients require a valid bearer credential.
- Default limits: **100 stored files and 10 MiB per tenant**; neither is a promise of production capacity. Deletion is supported only through the internal vault interface for now. No public sharing links or external receivers.
- Previously stored workflow receipt metadata is separate from file bytes; attaching an object does **not** certify the document or automatically mark its checklist received.

## Operator activation

Only a running private loopback service exposes upload routes. The feature is **disabled by default**. With a securely generated random 32-byte key encoded as 64 hexadecimal characters, set the private environment variable `FACTORY_VAULT_KEY_HEX` before starting `serve`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Store this value in private operator key management, not in shell history or Git.
FACTORY_VAULT_KEY_HEX=<private-64-character-hex> node scripts/run-application-runtime.js serve --state-dir /absolute/private/state --port 8789
```

The example placeholder above is **not** a usable key. Preserve the key outside the repository using an authorized secure mechanism. The service does not generate or escrow the key, does not provide encrypted database backups, and does not support safe rotation. Losing the key makes encrypted documents unrecoverable. If no key is set, the existing app still runs and document routes return 404.

## API contract

With the existing machine bearer credential, `POST /v1/workspaces/{id}/documents` accepts a raw `application/octet-stream` body and the headers `X-Record-Id`, `X-Requirement-Id`, `X-Document-Name`, `X-Document-Type`, and `Idempotency-Key`. `GET /v1/workspaces/{id}/documents` lists scoped metadata, and `GET /v1/workspaces/{id}/documents/{32-hex-id}` downloads a scoped attachment. Browser equivalents under `/app/api/workspaces/{id}/documents` use the existing session cookie and CSRF header; their exact names never appear in URLs or logs as credentials.

The connected browser UI displays attachments per requirement, offers file selection and download, and preserves bytes and request identity for an explicit retry after uncertain responses. Browser upload size is checked locally, **then independently enforced by the server**.

## Verification and commercial boundaries

The new unit and integration tests cover encryption-at-rest, persistence after reopen, tenant/workspace isolation, counterfeit signatures, quota and size rejection, tampering, idempotency, archived/unknown records, session authorization, cross-site/CSRF rejection, and disabled-feature compatibility. The native Chromium acceptance now exercises an actual upload/download through each of the three editions at desktop and mobile sizes against a temporary local encrypted vault, in addition to the existing complete workflow journeys.

**Draft, unmerged, undeployed.** No real customer documents, outbound messages, payments, analytics collections, production credential enrollment, new commercial product IDs, prices, wallets, or schedules are authorized. Before any real customer use, independently review authentication, tenant isolation, signed backups and recovery, antivirus/file validation, retention/deletion, operational key management/rotation, hosting, TLS and regulatory/privacy requirements.
