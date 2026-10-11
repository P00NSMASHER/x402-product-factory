"use strict";

// Offline, private cross-journal reconciliation of RPC-corroborated transfer
// evidence. Not a buyer identity check, sale ledger, or revenue counter.
const fs = require("node:fs");
const path = require("node:path");
const {
  readLedger, privatePath, verifyExternalCheckpoint
} = require("./settlement-ledger");
const {CHAIN, ROUTE_IDS} = require("./reconcile-settlements");
const {hmacKey, pseudonym} = require("./buyer-review-queue");

const MAX_JOURNALS = 12;
const MAX_MANIFEST_BYTES = 65536;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function keys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === expected.slice().sort().join(",");
}
function validateManifest(manifest) {
  if (!keys(manifest, ["schema_version", "journals"]) ||
      manifest.schema_version !== 1 ||
      !Array.isArray(manifest.journals) ||
      manifest.journals.length < 2 ||
      manifest.journals.length > MAX_JOURNALS) {
    invalid("CROSS_JOURNAL_MANIFEST_INVALID");
  }
  const seenPaths = new Set();
  for (const entry of manifest.journals) {
    if (!keys(entry, ["journal_path", "expected_head", "expected_records"]) ||
        typeof entry.journal_path !== "string" ||
        !path.isAbsolute(entry.journal_path) ||
        path.resolve(entry.journal_path) !== entry.journal_path ||
        !/^[0-9a-f]{64}$/.test(entry.expected_head || "") ||
        !Number.isSafeInteger(entry.expected_records) ||
        entry.expected_records < 0) {
      invalid("CROSS_JOURNAL_ENTRY_INVALID");
    }
    const safePath = privatePath(entry.journal_path);
    if (seenPaths.has(safePath)) invalid("CROSS_JOURNAL_DUPLICATE_PATH");
    seenPaths.add(safePath);
  }
  return manifest.journals;
}
function loadPrivateManifest(filename) {
  const location = privatePath(filename);
  if (!fs.existsSync(location)) invalid("CROSS_JOURNAL_MANIFEST_MISSING");
  const fd = fs.openSync(location, fs.constants.O_RDONLY | NOFOLLOW);
  let raw;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 ||
        (stat.mode & 0o077) !== 0 || stat.size > MAX_MANIFEST_BYTES) {
      invalid("CROSS_JOURNAL_MANIFEST_NOT_PRIVATE");
    }
    raw = fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { invalid("CROSS_JOURNAL_MANIFEST_JSON_INVALID"); }
  validateManifest(parsed);
  return parsed;
}
// A log may be read from different journal checkpoints. Observation timestamp,
// journal sequence, and confirmation depth can legitimately differ. Attribution,
// chain placement, payer and transfer details must agree for the same tx.
function evidenceIdentity(row) {
  return JSON.stringify([
    row.network, row.route, row.transaction_log_index, row.payer,
    row.receiver, row.token_contract, row.amount_atomic_usdc,
    row.block_number, row.canonical_block_hash
  ]);
}
function sameSnapshot(a, b) {
  const sameIdentity = a.fileIdentity && b.fileIdentity &&
    a.fileIdentity.dev === b.fileIdentity.dev &&
    a.fileIdentity.ino === b.fileIdentity.ino;
  return !!sameIdentity && a.bytesHash === b.bytesHash &&
    a.head === b.head && a.records.length === b.records.length;
}
function auditCrossJournals(manifest, {keyHex} = {}) {
  const key = hmacKey(keyHex);
  const journalEntries = validateManifest(manifest);
  const snapshots = [];
  const seenTx = new Map();
  const routeCounts = new Map([...ROUTE_IDS.keys()].map(route => [route, 0]));
  let totalRows = 0;

  for (let index = 0; index < journalEntries.length; index++) {
    const entry = journalEntries[index];
    if (!fs.existsSync(entry.journal_path)) {
      invalid("CROSS_JOURNAL_MISSING_JOURNAL");
    }
    const journal = readLedger(entry.journal_path);
    verifyExternalCheckpoint(journal, {
      head: entry.expected_head, records: entry.expected_records
    });
    if (journal.legacyCount) invalid("CROSS_JOURNAL_LEGACY_REVIEW_REQUIRED");
    snapshots.push({path: entry.journal_path, journal});
    totalRows += journal.records.length;
    for (const row of journal.records) {
      // readLedger checks the entire hash chain, canonical shape and negative
      // external-buyer flags. Do not accept user-supplied "verified" reports.
      if (row.schema_version !== 2 || row.network !== CHAIN ||
          row.external_buyer_verified !== false ||
          row.eligible_for_revenue_scoreboard !== false) {
        invalid("CROSS_JOURNAL_UNTRUSTED_RECORD");
      }
      const txKey = row.network + ":" + row.transaction;
      const fingerprint = evidenceIdentity(row);
      const prior = seenTx.get(txKey);
      if (!prior) {
        seenTx.set(txKey, {
          transaction: txKey, route: row.route, fingerprint,
          journalIndices: [index + 1], conflict: false
        });
      } else {
        // Duplicates within one journal are already rejected by readLedger.
        prior.journalIndices.push(index + 1);
        if (prior.fingerprint !== fingerprint) prior.conflict = true;
      }
    }
  }

  // Fail if a journal was replaced or changed during the multi-file scan.
  // This is a point-in-time audit; it cannot prevent changes after it exits.
  for (const {path: filename, journal: original} of snapshots) {
    if (!sameSnapshot(original, readLedger(filename))) {
      invalid("CROSS_JOURNAL_CHANGED_DURING_AUDIT");
    }
  }

  let conflicts = 0, duplicates = 0, uncontested = 0;
  const overlapCases = [];
  for (const item of seenTx.values()) {
    if (item.conflict) conflicts++;
    else {
      uncontested++;
      routeCounts.set(item.route, routeCounts.get(item.route) + 1);
    }
    if (item.journalIndices.length > 1) {
      duplicates += item.journalIndices.length - 1;
      overlapCases.push({
        case_id: pseudonym(key, "cross-journal-transaction", item.transaction),
        journal_indices: item.journalIndices,
        status: item.conflict
          ? "conflicting_evidence_manual_review_required"
          : "duplicate_transfer_evidence_not_additional_sale",
        revenue_eligible: false
      });
    }
  }
  overlapCases.sort((a, b) => a.case_id.localeCompare(b.case_id));
  if (uncontested + conflicts !== seenTx.size ||
      duplicates !== totalRows - seenTx.size ||
      [...routeCounts.values()].reduce((sum, n) => sum + n, 0) !== uncontested) {
    invalid("CROSS_JOURNAL_TOTALS_MISMATCH");
  }
  return {
    schema_version: 1,
    report_type: "cross_journal_transfer_evidence_not_sales",
    status: conflicts ? "conflicts_require_manual_review"
      : (totalRows ? "deduplicated_evidence_requires_buyer_review" : "no_evidence"),
    journal_count: snapshots.length,
    all_external_checkpoints_verified: true,
    current_chain_reverified: false,
    total_journal_transfer_evidence_rows: totalRows,
    unique_transaction_references: seenTx.size,
    redundant_cross_journal_references: duplicates,
    overlapping_transaction_cases: overlapCases.length,
    conflicting_transaction_cases: conflicts,
    uncontested_unique_transfer_evidence_not_sales: uncontested,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    per_route_uncontested_evidence_not_sales: [...routeCounts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([route, count]) => ({
        route, product_id: ROUTE_IDS.get(route), transfer_evidence: count,
        eligible_external_revenue_atomic_usdc: "0"
      })),
    overlap_cases: overlapCases
  };
}
function main() {
  if (process.argv.length !== 3) invalid("CROSS_JOURNAL_USAGE");
  const manifest = loadPrivateManifest(process.argv[2]);
  const report = auditCrossJournals(manifest, {
    keyHex: process.env.X402_REVIEW_HMAC_KEY
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
if (require.main === module) {
  try { main(); }
  catch {
    // No paths, wallet identifiers, tx hashes or secret material on errors.
    process.stderr.write(
      "Cross-journal audit blocked: inspect the private manifest, checkpoints and journals.\n"
    );
    process.exitCode = 1;
  }
}
module.exports = {
  MAX_JOURNALS, MAX_MANIFEST_BYTES, validateManifest, loadPrivateManifest,
  evidenceIdentity, sameSnapshot, auditCrossJournals
};
