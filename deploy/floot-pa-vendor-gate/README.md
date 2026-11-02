# Product 002 Floot rollback source

This directory pins the exact immutable source snapshot for the live Product 002 Floot endpoint and its schema. It is rollback evidence, not permission to write to Floot.

The source is fixed to commit `07d83efaad9fbd9b582c2b18c1ee5d7a4ced1a41` in `P00NSMASHER/permitplate-nyc`. `rollback-manifest.json` records each source path, Floot target path, byte length, Git blob ID, SHA-256 digest, required contract strings, and forbidden AppDeploy dependency.

Validate the manifest locally:

```text
node scripts/verify-floot-product-002-rollback.js
```

Verify the immutable GitHub source bytes without sending a payment:

```text
node scripts/verify-floot-product-002-rollback.js --verify-remote
```

An authorized recovery must first read the current Floot project/version, compare rather than overwrite blindly, and restore only:

- `endpoints/vendor-intake-gate_GET.ts`
- `endpoints/vendor-intake-gate_GET.schema.ts`

Do not replace the live discovery catalog or unrelated routes from the historical repository. Do not create a custom `*_OPTIONS.ts` file because Floot does not support it. After a restore, run `node scripts/verify-floot-product-002.js --require-ready` and separately confirm the existing PA routes remain unchanged. The Supabase seller is outside this rollback scope.
