"use strict";

// Private evidence-reference intake, not independent verification or revenue.
// Reuses the checkpoint-verified cross-journal audit and never reads documents
// at reference IDs, touches payment rails, or makes network requests.
const fs = require("node:fs");
const {privatePath} = require("./settlement-ledger");
const {hmacKey, pseudonym, readPrivateExclusions} = require("./buyer-review-queue");
const {auditCrossJournals, loadPrivateManifest} = require("./cross-journal-audit");

const MAX_DOSSIER_BYTES = 512 * 1024;
const MAX_CASES = 500;
const MAX_EVIDENCE_PER_CASE = 2000;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const ID = /^[0-9a-f]{64}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
// Expected categories are declarations of *where* an independent reviewer
// should inspect evidence, not a certification that the evidence is genuine.
const WALLET_EVIDENCE = Object.freeze({
  buyer_independence: "independent_third_party",
  wallet_control: "independent_third_party",
  operator_inventory_screen: "internal_control",
  independent_human_review: "reviewer_attestation"
});
const TRANSACTION_EVIDENCE = Object.freeze({
  service_delivery: "internal_service_log",
  chain_recheck: "independent_chain_provider",
  refund_reversal_check: "financial_reconciliation"
});
const WALLET_TYPES = Object.freeze(Object.keys(WALLET_EVIDENCE));
const TRANSACTION_TYPES = Object.freeze(Object.keys(TRANSACTION_EVIDENCE));

function invalid(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}
function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function validateDossiers(doc) {
  if (!exactKeys(doc, ["schema_version", "journal_scope_id", "cases"]) ||
      doc.schema_version !== 1 || typeof doc.journal_scope_id !== "string" ||
      !ID.test(doc.journal_scope_id) ||
      !Array.isArray(doc.cases) || doc.cases.length > MAX_CASES) {
    invalid("PROVENANCE_DOSSIER_DOCUMENT_INVALID");
  }
  const seenCases = new Set();
  for (const row of doc.cases) {
    if (!exactKeys(row, [
      "case_id", "operator_reference", "reviewer_reference", "evidence"
    ]) || typeof row.case_id !== "string" || !ID.test(row.case_id) ||
        typeof row.operator_reference !== "string" ||
        !REFERENCE.test(row.operator_reference) ||
        typeof row.reviewer_reference !== "string" ||
        !REFERENCE.test(row.reviewer_reference) ||
        row.operator_reference === row.reviewer_reference ||
        !Array.isArray(row.evidence) ||
        row.evidence.length > MAX_EVIDENCE_PER_CASE) {
      invalid("PROVENANCE_CASE_SCHEMA_INVALID");
    }
    if (seenCases.has(row.case_id)) invalid("PROVENANCE_CASE_DUPLICATE");
    seenCases.add(row.case_id);
    const seenItems = new Set();
    for (const item of row.evidence) {
      if (!exactKeys(item, [
        "type", "subject_case_id", "source_kind", "private_reference"
      ]) || typeof item.type !== "string" ||
          typeof item.subject_case_id !== "string" ||
          !ID.test(item.subject_case_id) ||
          typeof item.private_reference !== "string" ||
          !REFERENCE.test(item.private_reference)) {
        invalid("PROVENANCE_EVIDENCE_SCHEMA_INVALID");
      }
      const expectedSource = Object.hasOwn(WALLET_EVIDENCE, item.type)
        ? WALLET_EVIDENCE[item.type]
        : Object.hasOwn(TRANSACTION_EVIDENCE, item.type)
          ? TRANSACTION_EVIDENCE[item.type] : null;
      if (!expectedSource || item.source_kind !== expectedSource) {
        invalid("PROVENANCE_EVIDENCE_SOURCE_INVALID");
      }
      const uniqueness = item.type + ":" + item.subject_case_id;
      if (seenItems.has(uniqueness)) {
        invalid("PROVENANCE_DUPLICATE_EVIDENCE_REFERENCE");
      }
      seenItems.add(uniqueness);
    }
  }
  return doc;
}
function loadPrivateDossiers(filename) {
  const location = privatePath(filename);
  if (!fs.existsSync(location)) invalid("PROVENANCE_DOSSIER_FILE_MISSING");
  const fd = fs.openSync(location, fs.constants.O_RDONLY | NOFOLLOW);
  let raw;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 ||
        (stat.mode & 0o077) !== 0 || stat.size > MAX_DOSSIER_BYTES) {
      invalid("PROVENANCE_DOSSIER_FILE_NOT_PRIVATE");
    }
    raw = fs.readFileSync(fd, "utf8");
  } finally { fs.closeSync(fd); }
  let doc;
  try { doc = JSON.parse(raw); }
  catch { invalid("PROVENANCE_DOSSIER_JSON_INVALID"); }
  return validateDossiers(doc);
}
function scopeIdentifier(manifest, keyHex) {
  if (!manifest || !Array.isArray(manifest.journals)) {
    invalid("PROVENANCE_MANIFEST_REQUIRED");
  }
  const key = hmacKey(keyHex);
  // Scope is tied to the exact ordered set of externally pinned checkpoints,
  // not user-supplied file names or wallet identities. Reordering changes it.
  const checkpoints = manifest.journals.map(entry => [
    entry.expected_head, entry.expected_records
  ]);
  return pseudonym(key, "journal-checkpoint-scope", JSON.stringify(checkpoints));
}
function buildProvenancePreflight(manifest, {
  keyHex, dossier, exclusions = []
} = {}) {
  const audit = auditCrossJournals(manifest, {
    keyHex, exclusions, includeTransactionCaseIds: true
  });
  const scopeId = scopeIdentifier(manifest, keyHex);
  const checked = validateDossiers(dossier);
  if (checked.journal_scope_id !== scopeId) {
    invalid("PROVENANCE_JOURNAL_SCOPE_CHECKPOINT_MISMATCH");
  }
  const reviewCases = audit.global_wallet_review.cases;
  const byCase = new Map(reviewCases.map(row => [row.case_id, row]));
  const supplied = new Map();
  for (const row of checked.cases) {
    const known = byCase.get(row.case_id);
    if (!known) invalid("PROVENANCE_UNKNOWN_WALLET_CASE");
    if (known.status === "operator_declared_non_external") {
      invalid("PROVENANCE_EXCLUDED_WALLET_CANNOT_BE_SUBMITTED");
    }
    const transactions = new Set(known.transaction_case_ids);
    for (const item of row.evidence) {
      if (Object.hasOwn(WALLET_EVIDENCE, item.type)) {
        if (item.subject_case_id !== known.case_id) {
          invalid("PROVENANCE_WALLET_EVIDENCE_WRONG_SUBJECT");
        }
      } else if (!transactions.has(item.subject_case_id)) {
        // Prevent borrowing another wallet's API receipt or chain check.
        invalid("PROVENANCE_TRANSACTION_NOT_IN_WALLET_CASE");
      }
    }
    supplied.set(row.case_id, row);
  }

  let excluded = 0, noDossier = 0, incomplete = 0, referencesComplete = 0;
  let totalMissing = 0, submittedReferences = 0;
  const cases = [];
  for (const known of reviewCases) {
    if (known.status === "operator_declared_non_external") {
      excluded++;
      cases.push({
        case_id: known.case_id,
        status: "operator_declared_non_external",
        missing_wallet_evidence: [],
        missing_transaction_evidence: [],
        evidence_references_supplied: 0,
        independent_buyer_verified: false,
        eligible_revenue_atomic_usdc: "0"
      });
      continue;
    }
    const packet = supplied.get(known.case_id);
    const present = new Set((packet?.evidence || []).map(item =>
      item.type + ":" + item.subject_case_id
    ));
    const missingWallet = WALLET_TYPES.filter(type =>
      !present.has(type + ":" + known.case_id)
    );
    const missingTransactions = known.transaction_case_ids.map(id => ({
      transaction_case_id: id,
      missing_evidence: TRANSACTION_TYPES.filter(type =>
        !present.has(type + ":" + id)
      )
    })).filter(item => item.missing_evidence.length);
    const missingCount = missingWallet.length + missingTransactions.reduce(
      (sum, item) => sum + item.missing_evidence.length, 0
    );
    const evidenceSupplied = packet ? packet.evidence.length : 0;
    submittedReferences += evidenceSupplied;
    totalMissing += missingCount;
    const status = !packet
      ? "no_private_dossier_supplied"
      : missingCount
        ? "evidence_references_incomplete"
        : "reference_catalog_complete_independent_validation_required";
    if (!packet) noDossier++;
    else if (missingCount) incomplete++;
    else referencesComplete++;
    cases.push({
      case_id: known.case_id,
      status,
      transaction_evidence_cases_not_sales: known.transaction_case_ids.length,
      routes: known.routes,
      missing_wallet_evidence: missingWallet,
      missing_transaction_evidence: missingTransactions,
      evidence_references_supplied: evidenceSupplied,
      independent_buyer_verified: false,
      eligible_revenue_atomic_usdc: "0"
    });
  }
  if (excluded + noDossier + incomplete + referencesComplete !== reviewCases.length ||
      submittedReferences !== checked.cases.reduce(
        (n, item) => n + item.evidence.length, 0
      )) {
    invalid("PROVENANCE_TOTALS_MISMATCH");
  }
  return {
    schema_version: 1,
    report_type: "buyer_provenance_reference_preflight_not_independent_proof",
    journal_scope_id: scopeId,
    source_journal_count: audit.journal_count,
    source_unique_transactions_not_sales: audit.unique_transaction_references,
    source_conflicting_transactions_quarantined: audit.conflicting_transaction_cases,
    reviewed_wallet_cases_not_buyers: reviewCases.length,
    operator_declared_non_external_wallet_cases: excluded,
    missing_dossiers: noDossier,
    incomplete_reference_packets: incomplete,
    complete_reference_catalogs_not_verified: referencesComplete,
    supplied_reference_items: submittedReferences,
    missing_reference_items: totalMissing,
    source_references_independently_examined: false,
    reviewer_identity_independently_authenticated: false,
    current_chain_reverified: false,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    cases
  };
}
function buildProvenanceInventory(manifest, {keyHex, exclusions = []} = {}) {
  const audit = auditCrossJournals(manifest, {
    keyHex, exclusions, includeTransactionCaseIds: true
  });
  return {
    schema_version: 1,
    report_type: "buyer_provenance_intake_inventory_not_independent_proof",
    journal_scope_id: scopeIdentifier(manifest, keyHex),
    source_journal_count: audit.journal_count,
    conflicting_transactions_quarantined: audit.conflicting_transaction_cases,
    current_chain_reverified: false,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    cases: audit.global_wallet_review.cases.map(item => ({
      case_id: item.case_id,
      status: item.status,
      transaction_case_ids: item.status === "operator_declared_non_external"
        ? [] : item.transaction_case_ids,
      required_wallet_evidence_types: item.status === "operator_declared_non_external"
        ? [] : WALLET_TYPES,
      required_per_transaction_evidence_types:
        item.status === "operator_declared_non_external" ? [] : TRANSACTION_TYPES,
      eligible_revenue_atomic_usdc: "0"
    }))
  };
}
function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--inventory") {
    if (args.length < 2 || args.length > 3) invalid("PROVENANCE_USAGE");
    const manifest = loadPrivateManifest(args[1]);
    const exclusions = args.length === 3
      ? readPrivateExclusions(args[2]) : [];
    const inventory = buildProvenanceInventory(manifest, {
      keyHex: process.env.X402_REVIEW_HMAC_KEY, exclusions
    });
    process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
    return;
  }
  if (args.length !== 2 && args.length !== 3) {
    invalid("PROVENANCE_USAGE");
  }
  const manifest = loadPrivateManifest(args[0]);
  const dossier = loadPrivateDossiers(args[1]);
  const exclusions = args.length === 3
    ? readPrivateExclusions(args[2]) : [];
  process.stdout.write(JSON.stringify(buildProvenancePreflight(manifest, {
    keyHex: process.env.X402_REVIEW_HMAC_KEY, dossier, exclusions
  }), null, 2) + "\n");
}
if (require.main === module) {
  try { main(); }
  catch {
    // Do not print private evidence IDs, paths, addresses, or HMAC key.
    process.stderr.write(
      "Buyer provenance preflight blocked: verify private files, checkpoints, scope and evidence linkage.\n"
    );
    process.exitCode = 1;
  }
}
module.exports = {
  MAX_DOSSIER_BYTES, MAX_CASES, MAX_EVIDENCE_PER_CASE,
  WALLET_EVIDENCE, TRANSACTION_EVIDENCE, WALLET_TYPES, TRANSACTION_TYPES,
  validateDossiers, loadPrivateDossiers, scopeIdentifier,
  buildProvenanceInventory, buildProvenancePreflight
};
