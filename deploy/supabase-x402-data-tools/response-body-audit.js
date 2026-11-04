"use strict";

// Offline byte-integrity check. Authenticated client/server signatures and
// settlement evidence are prerequisites, but operator-supplied captured bytes
// cannot prove independent buyer ownership or actual client delivery.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {privatePath} = require("./settlement-ledger");
const {hmacKey, pseudonym, readPrivateExclusions} = require("./buyer-review-queue");
const {loadPrivateManifest} = require("./cross-journal-audit");
const {scopeIdentifier} = require("./buyer-provenance-preflight");
const {canonicalClientClaim, auditClientReceipts,
  loadPrivateClientReceipts} = require("./client-receipt-audit");
const {privateJson, validateSignedClaims,
  MAX_SIGNER_BYTES} = require("./signed-delivery-audit");

const MAX_CAPTURE_RECORDS = 32;
const MAX_CAPTURE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32768;
const HEX = /^[0-9a-f]{64}$/;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const CAPTURE_KIND = "operator_supplied_client_response_bytes";

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function validateCaptureManifest(doc) {
  if (!exactKeys(doc, ["schema_version", "journal_scope_id", "captures"]) ||
      doc.schema_version !== 1 ||
      typeof doc.journal_scope_id !== "string" ||
      !HEX.test(doc.journal_scope_id) ||
      !Array.isArray(doc.captures) ||
      doc.captures.length > MAX_CAPTURE_RECORDS) {
    invalid("RESPONSE_BODY_MANIFEST_INVALID");
  }
  const seenCases = new Set(), seenFiles = new Set();
  for (const row of doc.captures) {
    if (!exactKeys(row, [
      "transaction_case_id", "capture_kind", "body_file"
    ]) || typeof row.transaction_case_id !== "string" ||
        !HEX.test(row.transaction_case_id) ||
        row.capture_kind !== CAPTURE_KIND ||
        typeof row.body_file !== "string" ||
        !path.isAbsolute(row.body_file) ||
        path.resolve(row.body_file) !== row.body_file) {
      invalid("RESPONSE_BODY_CAPTURE_INVALID");
    }
    if (seenCases.has(row.transaction_case_id)) {
      invalid("RESPONSE_BODY_DUPLICATE_TRANSACTION_CAPTURE");
    }
    if (seenFiles.has(row.body_file)) {
      invalid("RESPONSE_BODY_REUSED_CAPTURE_FILE");
    }
    seenCases.add(row.transaction_case_id);
    seenFiles.add(row.body_file);
  }
  return doc;
}
function loadPrivateCaptureManifest(filename) {
  return validateCaptureManifest(
    privateJson(filename, MAX_MANIFEST_BYTES, "RESPONSE_BODY_CAPTURE_MANIFEST")
  );
}
// Capture exact filesystem identity and nanosecond file timestamps, not just
// the response hash. A new inode containing identical bytes is *still* a
// replacement and must invalidate an earlier review snapshot.
function captureStatIdentity(stat) {
  return [
    stat.dev, stat.ino, stat.size, stat.nlink, stat.mode,
    stat.mtimeNs, stat.ctimeNs
  ].map(String).join(":");
}
function validCaptureStat(stat) {
  return stat.isFile() && stat.nlink === 1n &&
    (stat.mode & 0o077n) === 0n &&
    stat.size <= BigInt(MAX_CAPTURE_FILE_BYTES);
}
function readPrivateCaptureSnapshot(filename) {
  // The common privatePath contract requires an absolute location outside
  // checkout with a real owner-only parent and no symlinked path segments.
  const location = privatePath(filename);
  if (!fs.existsSync(location)) invalid("RESPONSE_BODY_CAPTURE_MISSING");
  const fd = fs.openSync(location, fs.constants.O_RDONLY | NOFOLLOW);
  let result, initial;
  try {
    initial = fs.fstatSync(fd, {bigint: true});
    if (!validCaptureStat(initial)) {
      invalid("RESPONSE_BODY_FILE_NOT_PRIVATE_OR_TOO_LARGE");
    }
    // SHA-256 over original bytes, not decoded/re-serialized JSON text.
    // The size is safe to convert because the 2 MiB bound was checked above.
    const size = Number(initial.size);
    const hasher = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(65536);
    let offset = 0;
    while (offset < size) {
      const count = fs.readSync(fd, buffer, 0,
        Math.min(buffer.length, size - offset), offset);
      if (count < 1) invalid("RESPONSE_BODY_TRUNCATED_DURING_READ");
      hasher.update(buffer.subarray(0, count));
      offset += count;
    }
    const after = fs.fstatSync(fd, {bigint: true});
    if (!validCaptureStat(after) ||
        captureStatIdentity(after) !== captureStatIdentity(initial)) {
      invalid("RESPONSE_BODY_CHANGED_DURING_READ");
    }
    result = {
      digest: hasher.digest("hex"),
      bytes: offset,
      identity: captureStatIdentity(initial)
    };
  } finally {
    fs.closeSync(fd);
  }
  // Reject path swaps, mode changes, and same-size writes made after the
  // descriptor was checked, but before the initial snapshot is accepted.
  const current = fs.lstatSync(location, {bigint: true});
  if (!validCaptureStat(current) || current.isSymbolicLink() ||
      captureStatIdentity(current) !== result.identity) {
    invalid("RESPONSE_BODY_FILE_REPLACED");
  }
  return result;
}
function readPrivateBodyDigest(filename) {
  const {digest, bytes} = readPrivateCaptureSnapshot(filename);
  return {digest, bytes};
}
// Used at the end of the whole batch. A previous capture can change while
// later files are being checked; re-reading each file catches ordinary
// modifications and path replacements before a final report is returned.
// This is a point-in-time check, not an immutable filesystem snapshot.
function verifyCaptureSnapshots(records) {
  if (!Array.isArray(records) || records.length > MAX_CAPTURE_RECORDS) {
    invalid("RESPONSE_BODY_SNAPSHOT_BATCH_INVALID");
  }
  for (const item of records) {
    if (!item || typeof item.filename !== "string" ||
        !item.snapshot || typeof item.snapshot.digest !== "string" ||
        typeof item.snapshot.identity !== "string" ||
        !Number.isSafeInteger(item.snapshot.bytes)) {
      invalid("RESPONSE_BODY_SNAPSHOT_INVALID");
    }
    const latest = readPrivateCaptureSnapshot(item.filename);
    if (latest.digest !== item.snapshot.digest ||
        latest.bytes !== item.snapshot.bytes ||
        latest.identity !== item.snapshot.identity) {
      invalid("RESPONSE_BODY_CHANGED_AFTER_INITIAL_CAPTURE");
    }
  }
}

function auditResponseBodies(manifest, {
  keyHex, serverClaims, serverSigner, serverFingerprint,
  clientReceipts, clientSigner, clientFingerprint,
  captureManifest, exclusions = []
} = {}) {
  const key = hmacKey(keyHex);
  const captures = validateCaptureManifest(captureManifest);
  const clientReport = auditClientReceipts(manifest, {
    keyHex, serverClaims, serverSigner, serverFingerprint,
    clientReceipts, clientSigner, clientFingerprint, exclusions
  });
  const scope = scopeIdentifier(manifest, keyHex);
  if (captures.journal_scope_id !== scope) {
    invalid("RESPONSE_BODY_JOURNAL_SCOPE_MISMATCH");
  }
  // All client receipt entries are already signature-verified against
  // independently pinned public keys and authenticated server claims.
  const expectedByCase = new Map();
  for (const entry of clientReceipts.signed_receipts) {
    const signed = canonicalClientClaim(entry.claim);
    const id = pseudonym(key, "cross-journal-transaction",
      signed.network + ":" + signed.transaction);
    if (expectedByCase.has(id)) invalid("RESPONSE_BODY_DUPLICATE_CLIENT_CLAIM");
    expectedByCase.set(id, signed.response_body_sha256);
  }
  const casesById = new Map(
    clientReport.cases.map(row => [row.transaction_case_id, row])
  );
  let inspectedBytes = 0;
  const digestOutcomes = new Map();
  const verifiedSnapshots = [];
  for (const row of captures.captures) {
    const signedCase = casesById.get(row.transaction_case_id);
    if (!signedCase || signedCase.client_signature_matched !== true ||
        !signedCase.server_signature_verified) {
      invalid("RESPONSE_BODY_WITHOUT_MATCHED_SIGNED_CLIENT_SERVER_CLAIMS");
    }
    const expected = expectedByCase.get(row.transaction_case_id);
    if (!expected) invalid("RESPONSE_BODY_MISSING_AUTHENTICATED_HASH");
    const evidence = readPrivateCaptureSnapshot(row.body_file);
    inspectedBytes += evidence.bytes;
    if (inspectedBytes > MAX_TOTAL_CAPTURE_BYTES) {
      invalid("RESPONSE_BODY_TOTAL_SIZE_LIMIT");
    }
    digestOutcomes.set(row.transaction_case_id,
      crypto.timingSafeEqual(
        Buffer.from(evidence.digest, "hex"),
        Buffer.from(expected, "hex")
      ));
    verifiedSnapshots.push({filename: row.body_file, snapshot: evidence});
  }
  // Ensure *all* previously hashed captures still refer to the identical
  // private file bytes and inode at the end of the multi-file operation.
  verifyCaptureSnapshots(verifiedSnapshots);
  let matched = 0, mismatched = 0, missing = 0, excludedMatches = 0;
  const cases = clientReport.cases.map(row => {
    const hasCapture = digestOutcomes.has(row.transaction_case_id);
    const matches = hasCapture ? digestOutcomes.get(row.transaction_case_id) : null;
    const excluded = row.status === "operator_declared_non_external";
    if (row.client_signature_matched && !hasCapture) missing++;
    if (hasCapture && matches) {
      matched++;
      if (excluded) excludedMatches++;
    } else if (hasCapture) mismatched++;
    return {
      transaction_case_id: row.transaction_case_id,
      wallet_case_id: row.wallet_case_id,
      route: row.route,
      status: excluded ? "operator_declared_non_external"
        : !row.client_signature_matched
          ? "matching_signatures_missing"
          : !hasCapture ? "signed_client_ack_missing_private_body_capture"
            : matches
              ? "private_body_digest_matches_signed_claims_review_required"
              : "private_body_digest_mismatch_quarantined",
      server_signature_verified: row.server_signature_verified,
      client_signature_matched: row.client_signature_matched,
      private_body_locally_compared: hasCapture,
      private_body_digest_matches_signed_claims: matches,
      independent_capture_provenance_verified: false,
      client_delivery_independently_proven: false,
      eligible_revenue_atomic_usdc: "0"
    };
  });
  if (matched + mismatched !== captures.captures.length ||
      matched + mismatched + missing !==
        clientReport.valid_client_acknowledgment_signatures) {
    invalid("RESPONSE_BODY_TOTALS_MISMATCH");
  }
  return {
    schema_version: 1,
    report_type: "private_response_byte_digest_checks_not_verified_client_delivery",
    journal_scope_id: scope,
    scoped_uncontested_settlements_not_sales:
      clientReport.uncontested_transfer_evidence_not_sales,
    signed_client_server_claim_pairs:
      clientReport.valid_client_acknowledgment_signatures,
    private_capture_files_checked: captures.captures.length,
    private_capture_bytes_read: inspectedBytes,
    capture_digest_matches: matched,
    capture_digest_mismatches_quarantined: mismatched,
    signed_client_acknowledgments_missing_capture: missing,
    matched_captures_from_operator_declared_non_external_wallets: excludedMatches,
    conflicting_transactions_quarantined:
      clientReport.conflicting_transactions_quarantined,
    actual_response_body_locally_compared_to_signed_hash: matched + mismatched > 0,
    independent_capture_provenance_verified: false,
    original_client_receipt_independently_verified: false,
    current_chain_reverified: false,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    cases
  };
}
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 && args.length !== 7) {
    invalid("RESPONSE_BODY_USAGE");
  }
  const manifest = loadPrivateManifest(args[0]);
  const serverClaims = validateSignedClaims(
    privateJson(args[1], 512 * 1024, "RESPONSE_BODY_SERVER_CLAIMS_FILE")
  );
  const serverSigner = privateJson(args[2], MAX_SIGNER_BYTES,
    "RESPONSE_BODY_SERVER_SIGNER_FILE");
  const clientReceipts = loadPrivateClientReceipts(args[3]);
  const clientSigner = privateJson(args[4], MAX_SIGNER_BYTES,
    "RESPONSE_BODY_CLIENT_SIGNER_FILE");
  const captureManifest = loadPrivateCaptureManifest(args[5]);
  const exclusions = args.length === 7 ? readPrivateExclusions(args[6]) : [];
  process.stdout.write(JSON.stringify(auditResponseBodies(manifest, {
    keyHex: process.env.X402_REVIEW_HMAC_KEY,
    serverClaims, serverSigner,
    serverFingerprint: process.env.X402_DELIVERY_KEY_SHA256,
    clientReceipts, clientSigner,
    clientFingerprint: process.env.X402_CLIENT_KEY_SHA256,
    captureManifest, exclusions
  }), null, 2) + "\n");
}
if (require.main === module) {
  try { main(); }
  catch {
    // No raw response bytes, hashes, wallet addresses, paths or keys in logs.
    process.stderr.write(
      "Response-body integrity audit blocked: inspect private capture files and signed evidence.\n"
    );
    process.exitCode = 1;
  }
}
module.exports = {
  MAX_CAPTURE_RECORDS, MAX_CAPTURE_FILE_BYTES, MAX_TOTAL_CAPTURE_BYTES,
  CAPTURE_KIND, validateCaptureManifest, loadPrivateCaptureManifest,
  readPrivateBodyDigest, readPrivateCaptureSnapshot, verifyCaptureSnapshots,
  auditResponseBodies
};
