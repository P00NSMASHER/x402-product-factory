"use strict";

// Read-only, offline correlation of a separately signed client ACK to an
// authenticated server-completion claim and checkpoint-verified settlement.
// Two matching keys are not independent organizations or proven client receipt.
const crypto = require("node:crypto");
const {CHAIN, ROUTE_IDS} = require("./reconcile-settlements");
const {hmacKey, pseudonym, readPrivateExclusions} = require("./buyer-review-queue");
const {loadPrivateManifest} = require("./cross-journal-audit");
const {scopeIdentifier} = require("./buyer-provenance-preflight");
const {
  auditSignedDelivery, canonicalClaim, canonicalBase64, validateSigner,
  privateJson, validateSignedClaims, MAX_SIGNER_BYTES
} = require("./signed-delivery-audit");

const MAX_CLIENT_RECEIPTS = 250;
const MAX_CLIENT_DOC_BYTES = 512 * 1024;
const HEX = /^[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const ISSUER = /^[A-Za-z][A-Za-z0-9_-]{7,63}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const DOMAIN = "x402-client-receipt-ack:v1\n";
const CLAIM_FIELDS = Object.freeze([
  "schema_version", "issuer_id", "network", "transaction", "payer",
  "route", "request_id", "response_status", "response_body_sha256",
  "client_received_at", "client_observation"
]);
function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function validUtc(value) {
  return typeof value === "string" && UTC.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}
function canonicalClientClaim(value) {
  if (!exactKeys(value, CLAIM_FIELDS) || value.schema_version !== 1 ||
      typeof value.issuer_id !== "string" || !ISSUER.test(value.issuer_id) ||
      value.network !== CHAIN ||
      typeof value.transaction !== "string" || !HASH.test(value.transaction) ||
      typeof value.payer !== "string" || !ADDRESS.test(value.payer) ||
      !ROUTE_IDS.has(value.route) ||
      typeof value.request_id !== "string" || !REQUEST_ID.test(value.request_id) ||
      value.response_status !== 200 ||
      typeof value.response_body_sha256 !== "string" ||
      !HEX.test(value.response_body_sha256) ||
      value.response_body_sha256 === "0".repeat(64) ||
      !validUtc(value.client_received_at) ||
      value.client_observation !== "full_response_body_received") {
    invalid("CLIENT_RECEIPT_CLAIM_INVALID");
  }
  return Object.fromEntries(CLAIM_FIELDS.map(field => [field, value[field]]));
}
function messageForClientClaim(value) {
  return Buffer.from(DOMAIN + JSON.stringify(canonicalClientClaim(value)), "utf8");
}
function validateClientReceipts(document) {
  if (!exactKeys(document, [
    "schema_version", "journal_scope_id", "signed_receipts"
  ]) || document.schema_version !== 1 ||
      typeof document.journal_scope_id !== "string" ||
      !HEX.test(document.journal_scope_id) ||
      !Array.isArray(document.signed_receipts) ||
      document.signed_receipts.length > MAX_CLIENT_RECEIPTS) {
    invalid("CLIENT_RECEIPT_DOCUMENT_INVALID");
  }
  for (const item of document.signed_receipts) {
    if (!exactKeys(item, ["claim", "signature_base64"])) {
      invalid("CLIENT_RECEIPT_ENTRY_INVALID");
    }
    canonicalClientClaim(item.claim);
    if (canonicalBase64(item.signature_base64, 64).length !== 64) {
      invalid("CLIENT_RECEIPT_SIGNATURE_LENGTH_INVALID");
    }
  }
  return document;
}
function loadPrivateClientReceipts(filename) {
  return validateClientReceipts(
    privateJson(filename, MAX_CLIENT_DOC_BYTES, "CLIENT_RECEIPT_FILE")
  );
}
function equalResponseIdentity(client, server) {
  // Excludes timestamps and issuer IDs because clients and servers have
  // independent clocks and signing domains. No acceptance of partial
  // field matches, substitute payload hashes, or rerouted requests.
  return client.network === server.network &&
    client.transaction === server.transaction &&
    client.payer === server.payer &&
    client.route === server.route &&
    client.request_id === server.request_id &&
    client.response_status === server.response_status &&
    client.response_body_sha256 === server.response_body_sha256;
}
function auditClientReceipts(manifest, {
  keyHex, serverClaims, serverSigner, serverFingerprint,
  clientReceipts, clientSigner, clientFingerprint, exclusions = []
} = {}) {
  const key = hmacKey(keyHex);
  // Pin both independent trust domains out-of-band. Different public keys
  // and issuer labels alone CANNOT establish different beneficial owners.
  const server = validateSigner(serverSigner, serverFingerprint);
  const client = validateSigner(clientSigner, clientFingerprint);
  if (serverFingerprint === clientFingerprint ||
      server.issuer_id === client.issuer_id) {
    invalid("CLIENT_RECEIPT_SIGNER_NOT_DISTINCT");
  }
  const clientDoc = validateClientReceipts(clientReceipts);
  const serverDoc = validateSignedClaims(serverClaims);

  // Existing verifier independently validates each signed server claim
  // against the transaction, payer, route and checkpointed journal evidence.
  const serverReport = auditSignedDelivery(manifest, {
    keyHex, signedClaims: serverDoc, signer: serverSigner,
    expectedFingerprint: serverFingerprint, exclusions
  });
  const scopeId = scopeIdentifier(manifest, keyHex);
  if (clientDoc.journal_scope_id !== scopeId) {
    invalid("CLIENT_RECEIPT_JOURNAL_SCOPE_MISMATCH");
  }
  const authenticatedServerClaims = new Map();
  for (const item of serverDoc.signed_claims) {
    const record = canonicalClaim(item.claim);
    const id = pseudonym(key, "cross-journal-transaction",
      record.network + ":" + record.transaction);
    if (authenticatedServerClaims.has(id)) {
      // Also rejected in the upstream signed-delivery audit.
      invalid("CLIENT_RECEIPT_DUPLICATE_SERVER_TRANSACTION");
    }
    authenticatedServerClaims.set(id, record);
  }

  const matchedIds = new Set(), seenRequestIds = new Set();
  for (const item of clientDoc.signed_receipts) {
    const receipt = canonicalClientClaim(item.claim);
    if (receipt.issuer_id !== client.issuer_id) {
      invalid("CLIENT_RECEIPT_ISSUER_MISMATCH");
    }
    const signature = canonicalBase64(item.signature_base64, 64);
    if (signature.length !== 64 ||
        !crypto.verify(null, messageForClientClaim(receipt),
          client.publicKey, signature)) {
      invalid("CLIENT_RECEIPT_SIGNATURE_INVALID");
    }
    const transactionId = pseudonym(key, "cross-journal-transaction",
      receipt.network + ":" + receipt.transaction);
    const trustedServer = authenticatedServerClaims.get(transactionId);
    if (!trustedServer) {
      // Includes missing server evidence, out-of-scope and quarantined txs.
      invalid("CLIENT_RECEIPT_AUTHENTICATED_SERVER_CLAIM_MISSING");
    }
    if (!equalResponseIdentity(receipt, trustedServer)) {
      invalid("CLIENT_RECEIPT_SERVER_IDENTITY_MISMATCH");
    }
    if (matchedIds.has(transactionId)) {
      invalid("CLIENT_RECEIPT_REPLAYED_TRANSACTION");
    }
    if (seenRequestIds.has(receipt.request_id)) {
      invalid("CLIENT_RECEIPT_REPLAYED_REQUEST_ID");
    }
    matchedIds.add(transactionId);
    seenRequestIds.add(receipt.request_id);
  }

  let pendingReview = 0, excludedMatched = 0, serverOnly = 0, noServer = 0;
  const cases = serverReport.cases.map(row => {
    const clientAck = matchedIds.has(row.transaction_case_id);
    const serverSigned = row.signed_claim_integrity_verified;
    const excluded = row.status === "operator_declared_non_external";
    if (clientAck && !serverSigned) {
      invalid("CLIENT_RECEIPT_INCONSISTENT_SERVER_EVIDENCE");
    }
    if (clientAck && excluded) excludedMatched++;
    if (clientAck && !excluded) pendingReview++;
    if (!clientAck && serverSigned) serverOnly++;
    if (!serverSigned) noServer++;
    return {
      transaction_case_id: row.transaction_case_id,
      wallet_case_id: row.wallet_case_id,
      route: row.route,
      status: excluded ? "operator_declared_non_external"
        : clientAck ? "matched_signatures_independent_review_required"
          : serverSigned ? "server_claim_only_missing_client_receipt"
            : "missing_authenticated_server_claim",
      server_signature_verified: serverSigned,
      client_signature_matched: clientAck,
      client_recipient_identity_independently_verified: false,
      actual_client_delivery_independently_proven: false,
      eligible_revenue_atomic_usdc: "0"
    };
  }).sort((a, b) =>
    a.transaction_case_id.localeCompare(b.transaction_case_id));
  if (matchedIds.size !== pendingReview + excludedMatched ||
      cases.length !== serverReport.uncontested_transfer_evidence_not_sales ||
      serverOnly + matchedIds.size !==
        serverReport.signed_claims_cryptographically_valid ||
      noServer !== serverReport.missing_signed_server_delivery_claims) {
    invalid("CLIENT_RECEIPT_TOTALS_MISMATCH");
  }
  return {
    schema_version: 1,
    report_type: "dual_signed_client_acknowledgments_not_verified_buyers_or_sales",
    journal_scope_id: scopeId,
    uncontested_transfer_evidence_not_sales: cases.length,
    conflicting_transactions_quarantined:
      serverReport.conflicting_transactions_quarantined,
    authenticated_server_claims: serverReport.signed_claims_cryptographically_valid,
    valid_client_acknowledgment_signatures: clientDoc.signed_receipts.length,
    matched_client_signatures_requiring_review: pendingReview,
    matched_operator_declared_non_external_signatures: excludedMatched,
    server_claims_missing_client_acknowledgment: serverOnly,
    transactions_missing_server_claim: noServer,
    both_out_of_band_fingerprints_matched: true,
    distinct_signer_public_keys_and_issuer_labels: true,
    independent_issuer_ownership_verified: false,
    client_recipient_identity_independently_verified: false,
    actual_client_delivery_independently_proven: false,
    response_body_bytes_independently_compared: false,
    current_chain_reverified: false,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    cases
  };
}
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 5 && args.length !== 6) {
    invalid("CLIENT_RECEIPT_USAGE");
  }
  const manifest = loadPrivateManifest(args[0]);
  const serverClaims = validateSignedClaims(
    privateJson(args[1], 512 * 1024, "CLIENT_RECEIPT_SERVER_CLAIMS_FILE")
  );
  const serverSigner = privateJson(args[2], MAX_SIGNER_BYTES, "CLIENT_RECEIPT_SERVER_SIGNER_FILE");
  const clientReceipts = loadPrivateClientReceipts(args[3]);
  const clientSigner = privateJson(args[4], MAX_SIGNER_BYTES, "CLIENT_RECEIPT_CLIENT_SIGNER_FILE");
  const exclusions = args.length === 6 ? readPrivateExclusions(args[5]) : [];
  process.stdout.write(JSON.stringify(auditClientReceipts(manifest, {
    keyHex: process.env.X402_REVIEW_HMAC_KEY,
    serverClaims, serverSigner,
    serverFingerprint: process.env.X402_DELIVERY_KEY_SHA256,
    clientReceipts, clientSigner,
    clientFingerprint: process.env.X402_CLIENT_KEY_SHA256,
    exclusions
  }), null, 2) + "\n");
}
if (require.main === module) {
  try { main(); }
  catch {
    // Never expose raw wallet, transaction, signing key, request ID or file path.
    process.stderr.write(
      "Client receipt audit blocked: check private scope, key trust and signed evidence.\n"
    );
    process.exitCode = 1;
  }
}
module.exports = {
  MAX_CLIENT_RECEIPTS, MAX_CLIENT_DOC_BYTES, CLAIM_FIELDS,
  canonicalClientClaim, messageForClientClaim, validateClientReceipts,
  loadPrivateClientReceipts, equalResponseIdentity, auditClientReceipts
};
