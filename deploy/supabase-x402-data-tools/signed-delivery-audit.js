"use strict";

// Offline verification of *signed service-response claims* against the
// checkpoint-verified settlement journals. Signatures authenticate a key's
// claim, not client receipt, signer independence, sales, or actual revenue.
// No private keys, live network calls, changes to the seller, or payments.
const fs = require("node:fs");
const crypto = require("node:crypto");
const {privatePath} = require("./settlement-ledger");
const {CHAIN, ROUTE_IDS} = require("./reconcile-settlements");
const {hmacKey, pseudonym, readPrivateExclusions} = require("./buyer-review-queue");
const {auditCrossJournals, loadPrivateManifest} = require("./cross-journal-audit");
const {scopeIdentifier} = require("./buyer-provenance-preflight");

const MAX_CLAIMS = 250;
const MAX_CLAIMS_BYTES = 512 * 1024;
const MAX_SIGNER_BYTES = 2048;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const HEX = /^[0-9a-f]{64}$/;
const TX = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const ISSUER = /^[A-Za-z][A-Za-z0-9_-]{7,63}$/;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const DOMAIN = "x402-service-response-claim:v1\n";

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function exactKeys(obj, expected) {
  return obj && typeof obj === "object" && !Array.isArray(obj) &&
    Object.keys(obj).sort().join(",") === [...expected].sort().join(",");
}
function canonicalBase64(value, maxBytes) {
  if (typeof value !== "string" || value.length > maxBytes * 2 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    invalid("DELIVERY_BASE64_INVALID");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes ||
      bytes.toString("base64") !== value) {
    invalid("DELIVERY_BASE64_INVALID");
  }
  return bytes;
}
function validTimestamp(value) {
  return typeof value === "string" && UTC.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}
function canonicalClaim(value) {
  const fields = [
    "schema_version", "issuer_id", "network", "transaction", "payer",
    "route", "request_id", "response_status", "response_body_sha256",
    "response_stream_completed_at", "transport_observation"
  ];
  if (!exactKeys(value, fields) || value.schema_version !== 1 ||
      typeof value.issuer_id !== "string" || !ISSUER.test(value.issuer_id) ||
      value.network !== CHAIN || typeof value.transaction !== "string" ||
      !TX.test(value.transaction) || typeof value.payer !== "string" ||
      !ADDRESS.test(value.payer) || !ROUTE_IDS.has(value.route) ||
      typeof value.request_id !== "string" || !REQUEST_ID.test(value.request_id) ||
      value.response_status !== 200 ||
      typeof value.response_body_sha256 !== "string" ||
      !HEX.test(value.response_body_sha256) ||
      value.response_body_sha256 === "0".repeat(64) ||
      !validTimestamp(value.response_stream_completed_at) ||
      value.transport_observation !== "server_response_stream_completed") {
    invalid("DELIVERY_CLAIM_SCHEMA_INVALID");
  }
  // Key ordering is fixed independent of attacker-controlled JSON field order.
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}
function messageForClaim(value) {
  return Buffer.from(DOMAIN + JSON.stringify(canonicalClaim(value)), "utf8");
}
function validateSignedClaims(doc) {
  if (!exactKeys(doc, ["schema_version", "journal_scope_id", "signed_claims"]) ||
      doc.schema_version !== 1 ||
      typeof doc.journal_scope_id !== "string" || !HEX.test(doc.journal_scope_id) ||
      !Array.isArray(doc.signed_claims) ||
      doc.signed_claims.length > MAX_CLAIMS) {
    invalid("DELIVERY_SIGNED_CLAIMS_DOCUMENT_INVALID");
  }
  for (const entry of doc.signed_claims) {
    if (!exactKeys(entry, ["claim", "signature_base64"])) {
      invalid("DELIVERY_SIGNED_ENTRY_INVALID");
    }
    canonicalClaim(entry.claim);
    if (canonicalBase64(entry.signature_base64, 64).length !== 64) {
      invalid("DELIVERY_SIGNATURE_LENGTH_INVALID");
    }
  }
  return doc;
}
function privateJson(filename, limit, errorCode) {
  const location = privatePath(filename);
  if (!fs.existsSync(location)) invalid(errorCode + "_MISSING");
  const fd = fs.openSync(location, fs.constants.O_RDONLY | NOFOLLOW);
  let raw;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 ||
        (stat.mode & 0o077) !== 0 || stat.size > limit) {
      invalid(errorCode + "_NOT_PRIVATE_OR_TOO_LARGE");
    }
    raw = fs.readFileSync(fd, "utf8");
    if (Buffer.byteLength(raw, "utf8") > limit) {
      invalid(errorCode + "_TOO_LARGE");
    }
  } finally { fs.closeSync(fd); }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { invalid(errorCode + "_JSON_INVALID"); }
  return parsed;
}
function loadPrivateSignedClaims(filename) {
  return validateSignedClaims(
    privateJson(filename, MAX_CLAIMS_BYTES, "DELIVERY_CLAIMS_FILE")
  );
}
function validateSigner(doc, expectedFingerprint) {
  if (!exactKeys(doc, ["schema_version", "issuer_id", "spki_der_base64"]) ||
      doc.schema_version !== 1 || typeof doc.issuer_id !== "string" ||
      !ISSUER.test(doc.issuer_id) ||
      typeof expectedFingerprint !== "string" ||
      !HEX.test(expectedFingerprint) ||
      expectedFingerprint === "0".repeat(64)) {
    invalid("DELIVERY_SIGNER_NOT_PINNED");
  }
  // Admit bounded DER for explicit algorithm rejection (RSA-2048 SPKI is
  // ~294 bytes); only canonical Ed25519 keys are ultimately accepted.
  const der = canonicalBase64(doc.spki_der_base64, 512);
  const fingerprint = crypto.createHash("sha256").update(der).digest("hex");
  if (fingerprint !== expectedFingerprint) {
    invalid("DELIVERY_SIGNER_FINGERPRINT_MISMATCH");
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({
      key: der, format: "der", type: "spki"
    });
  } catch { invalid("DELIVERY_PUBLIC_KEY_INVALID"); }
  if (publicKey.asymmetricKeyType !== "ed25519" ||
      !publicKey.export({format:"der",type:"spki"}).equals(der)) {
    invalid("DELIVERY_PUBLIC_KEY_MUST_BE_CANONICAL_ED25519");
  }
  return {issuer_id: doc.issuer_id, publicKey};
}
function loadPrivateSigner(filename, expectedFingerprint) {
  return validateSigner(
    privateJson(filename, MAX_SIGNER_BYTES, "DELIVERY_SIGNER_FILE"),
    expectedFingerprint
  );
}
function auditSignedDelivery(manifest, {
  keyHex, signedClaims, signer, expectedFingerprint, exclusions = []
} = {}) {
  const key = hmacKey(keyHex);
  const verifiedSigner = validateSigner(signer, expectedFingerprint);
  const source = validateSignedClaims(signedClaims);
  const audit = auditCrossJournals(manifest, {
    keyHex, exclusions, includeTransactionBindings: true
  });
  const scopeId = scopeIdentifier(manifest, keyHex);
  if (source.journal_scope_id !== scopeId) {
    invalid("DELIVERY_JOURNAL_SCOPE_MISMATCH");
  }
  const bindings = audit.global_wallet_review.transaction_bindings;
  const byTransaction = new Map(
    bindings.map(row => [row.transaction_case_id, row])
  );
  const excludedWallets = new Set(
    audit.global_wallet_review.cases
      .filter(row => row.status === "operator_declared_non_external")
      .map(row => row.case_id)
  );
  const signedByTransaction = new Set();
  const seenRequestIds = new Set();
  for (const entry of source.signed_claims) {
    const claim = canonicalClaim(entry.claim);
    if (claim.issuer_id !== verifiedSigner.issuer_id) {
      invalid("DELIVERY_ISSUER_ID_MISMATCH");
    }
    const signature = canonicalBase64(entry.signature_base64, 64);
    if (signature.length !== 64 ||
        !crypto.verify(null, messageForClaim(claim),
          verifiedSigner.publicKey, signature)) {
      invalid("DELIVERY_SIGNATURE_VERIFICATION_FAILED");
    }
    const transactionId = pseudonym(key, "cross-journal-transaction",
      claim.network + ":" + claim.transaction);
    const walletId = pseudonym(key, "wallet", claim.payer);
    const linked = byTransaction.get(transactionId);
    if (!linked) {
      // Includes missing journals, unknown transfers, and conflicting
      // transactions intentionally excluded by the cross-journal gate.
      invalid("DELIVERY_TRANSACTION_NOT_UNCONTESTED_IN_SCOPE");
    }
    if (linked.wallet_case_id !== walletId || linked.route !== claim.route) {
      invalid("DELIVERY_TRANSACTION_WALLET_ROUTE_MISMATCH");
    }
    if (signedByTransaction.has(transactionId)) {
      invalid("DELIVERY_DUPLICATE_TRANSACTION_CLAIM");
    }
    if (seenRequestIds.has(claim.request_id)) {
      invalid("DELIVERY_REQUEST_ID_REUSED");
    }
    seenRequestIds.add(claim.request_id);
    signedByTransaction.add(transactionId);
  }
  const cases = [];
  let excludedSigned = 0, pendingSigned = 0;
  for (const binding of bindings) {
    const signed = signedByTransaction.has(binding.transaction_case_id);
    const excluded = excludedWallets.has(binding.wallet_case_id);
    if (signed && excluded) excludedSigned++;
    if (signed && !excluded) pendingSigned++;
    cases.push({
      transaction_case_id: binding.transaction_case_id,
      wallet_case_id: binding.wallet_case_id,
      route: binding.route,
      status: excluded
        ? "operator_declared_non_external"
        : signed
          ? "signed_server_delivery_claim_independent_review_required"
          : "missing_signed_server_delivery_claim",
      signed_claim_integrity_verified: signed,
      client_receipt_independently_confirmed: false,
      eligible_revenue_atomic_usdc: "0"
    });
  }
  cases.sort((a,b)=>a.transaction_case_id.localeCompare(b.transaction_case_id));
  if (bindings.length !== audit.uncontested_unique_transfer_evidence_not_sales ||
      signedByTransaction.size !== pendingSigned + excludedSigned ||
      cases.length !== bindings.length) {
    invalid("DELIVERY_TOTAL_RECONCILIATION_FAILED");
  }
  return {
    schema_version: 1,
    report_type: "signed_server_delivery_claims_not_client_receipts_or_sales",
    journal_scope_id: scopeId,
    externally_supplied_key_fingerprint_matched: true,
    signer_control_independently_authenticated: false,
    signed_claims_cryptographically_valid: source.signed_claims.length,
    uncontested_transfer_evidence_not_sales: bindings.length,
    signed_claims_for_wallets_requiring_review: pendingSigned,
    signed_claims_for_operator_declared_non_external_wallets: excludedSigned,
    missing_signed_server_delivery_claims: bindings.length - signedByTransaction.size,
    conflicting_transactions_quarantined: audit.conflicting_transaction_cases,
    actual_response_body_independently_compared: false,
    actual_client_receipt_independently_confirmed: false,
    current_chain_reverified: false,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    cases
  };
}
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 && args.length !== 4) {
    invalid("DELIVERY_USAGE");
  }
  const manifest = loadPrivateManifest(args[0]);
  const signedClaims = loadPrivateSignedClaims(args[1]);
  const signer = privateJson(args[2], MAX_SIGNER_BYTES, "DELIVERY_SIGNER_FILE");
  const exclusions = args.length === 4
    ? readPrivateExclusions(args[3]) : [];
  const result = auditSignedDelivery(manifest, {
    keyHex: process.env.X402_REVIEW_HMAC_KEY,
    expectedFingerprint: process.env.X402_DELIVERY_KEY_SHA256,
    signedClaims, signer, exclusions
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (require.main === module) {
  try { main(); }
  catch {
    // File paths, HMAC keys, transactions, payers and private response digests
    // must never appear in errors or workflow logs.
    process.stderr.write(
      "Signed service-delivery audit blocked: inspect private inputs and signer provenance.\n"
    );
    process.exitCode = 1;
  }
}
module.exports = {
  MAX_CLAIMS, MAX_CLAIMS_BYTES, MAX_SIGNER_BYTES, canonicalBase64,
  canonicalClaim, messageForClaim, validateSignedClaims, privateJson,
  loadPrivateSignedClaims, validateSigner, loadPrivateSigner, auditSignedDelivery
};
