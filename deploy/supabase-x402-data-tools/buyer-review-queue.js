"use strict";

// Offline triage only: groups evidence by pseudonymous payer wallet.
// Wallets are not people; neither a transfer nor a repeated payer proves
// an external customer, booked revenue, or a Product 025+ demand unlock.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  readLedger, privatePath, verifyExternalCheckpoint, parseCheckpointOptions
} = require("./settlement-ledger");

const EXCLUSION_REASONS = new Set([
  "operator_controlled", "test_or_synthetic", "marketplace_probe"
]);
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function hmacKey(hex) {
  if (typeof hex !== "string" || !KEY_PATTERN.test(hex)) {
    invalid("BUYER_REVIEW_KEY_MUST_BE_32_BYTE_HEX");
  }
  return Buffer.from(hex, "hex");
}
function pseudonym(key, namespace, value) {
  return crypto.createHmac("sha256", key)
    .update("x402-buyer-review:v1:")
    .update(namespace)
    .update(":")
    .update(value)
    .digest("hex");
}
function validateExclusions(rows) {
  if (!Array.isArray(rows) || rows.length > 1000) {
    invalid("BUYER_REVIEW_EXCLUSIONS_INVALID");
  }
  const normalized = [], seen = new Set();
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).sort().join(",") !==
          ["address", "evidence_reference", "reason"].join(",") ||
        !WALLET_PATTERN.test(item.address || "") ||
        !EXCLUSION_REASONS.has(item.reason) ||
        typeof item.evidence_reference !== "string" ||
        !/^[A-Za-z0-9_/:.-]{8,128}$/.test(item.evidence_reference)) {
      invalid("BUYER_REVIEW_EXCLUSION_RECORD_INVALID");
    }
    const address = item.address.toLowerCase();
    if (seen.has(address)) invalid("BUYER_REVIEW_EXCLUSION_DUPLICATE");
    seen.add(address);
    // Evidence references stay in the private source, never in the report.
    normalized.push({ address, reason: item.reason });
  }
  return normalized;
}
function readPrivateExclusions(filename) {
  const location = privatePath(filename);
  if (!fs.existsSync(location)) invalid("BUYER_REVIEW_EXCLUSIONS_NOT_FOUND");
  const fd = fs.openSync(location,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let raw;
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) !== 0 ||
        st.size > 131072) {
      invalid("BUYER_REVIEW_EXCLUSIONS_FILE_NOT_PRIVATE");
    }
    raw = fs.readFileSync(fd, "utf8");
  } finally { fs.closeSync(fd); }
  let doc;
  try { doc = JSON.parse(raw); }
  catch { invalid("BUYER_REVIEW_EXCLUSIONS_JSON_INVALID"); }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) ||
      Object.keys(doc).sort().join(",") !== "excluded_wallets,schema_version" ||
      doc.schema_version !== 1) {
    invalid("BUYER_REVIEW_EXCLUSIONS_SCHEMA_INVALID");
  }
  return validateExclusions(doc.excluded_wallets);
}
function buildBuyerReviewQueue(journalPath, {
  keyHex, exclusions = [], checkpoint
} = {}) {
  const key = hmacKey(keyHex);
  const excluded = validateExclusions(exclusions);
  if (!fs.existsSync(privatePath(journalPath))) {
    invalid("BUYER_REVIEW_JOURNAL_NOT_FOUND");
  }
  const journal = readLedger(journalPath);
  if (journal.legacyCount > 0) {
    invalid("BUYER_REVIEW_LEGACY_JOURNAL_REQUIRES_RECONCILIATION");
  }
  const checkpointVerified = verifyExternalCheckpoint(journal, checkpoint);
  const exclusionsByWallet = new Map(
    excluded.map(item => [item.address, item.reason])
  );
  const groups = new Map();
  for (const item of journal.records) {
    // These are on-chain transfer evidence rows, not actual sale records.
    if (item.schema_version !== 2 ||
        item.onchain_verified !== true ||
        item.external_buyer_verified !== false ||
        item.eligible_for_revenue_scoreboard !== false) {
      invalid("BUYER_REVIEW_UNTRUSTED_LEDGER_ROW");
    }
    const wallet = item.payer;
    let current = groups.get(wallet);
    if (!current) {
      current = {
        wallet,
        sequences: [],
        routes: new Set(),
        firstObserved: item.observed_at,
        lastObserved: item.observed_at
      };
      groups.set(wallet, current);
    }
    current.sequences.push(item.sequence);
    current.routes.add(item.route);
    if (item.observed_at < current.firstObserved) {
      current.firstObserved = item.observed_at;
    }
    if (item.observed_at > current.lastObserved) {
      current.lastObserved = item.observed_at;
    }
  }
  const cases = [];
  let excludedWallets = 0, excludedEvidence = 0, repeatedWalletSignals = 0;
  for (const group of groups.values()) {
    const exclusionReason = exclusionsByWallet.get(group.wallet) || null;
    if (exclusionReason) {
      excludedWallets++;
      excludedEvidence += group.sequences.length;
    }
    if (group.sequences.length > 1) repeatedWalletSignals++;
    cases.push({
      case_id: pseudonym(key, "wallet", group.wallet),
      status: exclusionReason
        ? "operator_declared_non_external"
        : "requires_independent_buyer_review",
      exclusion_reason: exclusionReason,
      transfer_evidence_count: group.sequences.length,
      repeat_wallet_signal: group.sequences.length > 1,
      routes: [...group.routes].sort(),
      journal_sequences: group.sequences,
      first_observed_at: group.firstObserved,
      last_observed_at: group.lastObserved,
      outside_buyer_proven: false,
      eligible_revenue_atomic_usdc: "0"
    });
  }
  cases.sort((a, b) => a.case_id.localeCompare(b.case_id));
  return {
    schema_version: 1,
    report_type: "wallet_review_queue_not_revenue_ledger",
    journal_head_hash: journal.head,
    journal_record_count: journal.records.length,
    checkpoint_verified: checkpointVerified,
    current_chain_reverified: false,
    operator_declared_exclusion_records_supplied: excluded.length,
    historical_transfer_evidence: journal.records.length,
    distinct_payer_wallets_not_distinct_buyers: cases.length,
    repeat_wallet_signals_not_repeat_customers: repeatedWalletSignals,
    operator_declared_non_external_wallets: excludedWallets,
    operator_declared_non_external_transfer_evidence: excludedEvidence,
    wallets_requiring_independent_review: cases.length - excludedWallets,
    independently_verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false,
    cases
  };
}
async function main() {
  const args = process.argv.slice(2);
  const optionIndex = args.indexOf("--expect-head");
  const positionals = optionIndex < 0 ? args : args.slice(0, optionIndex);
  if (positionals.length < 1 || positionals.length > 2) {
    invalid("BUYER_REVIEW_USAGE");
  }
  const checkpoint = parseCheckpointOptions(
    optionIndex < 0 ? [] : args.slice(optionIndex)
  );
  const exclusions = positionals.length === 2
    ? readPrivateExclusions(positionals[1]) : [];
  const result = buildBuyerReviewQueue(positionals[0], {
    keyHex: process.env.X402_REVIEW_HMAC_KEY,
    exclusions, checkpoint
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (require.main === module) {
  main().catch(() => {
    // Never expose private input, HMAC key, wallet, or file paths on failure.
    process.stderr.write(
      "Buyer-review queue blocked: check private journal, key, exclusions and checkpoint.\n"
    );
    process.exitCode = 1;
  });
}
module.exports = {
  EXCLUSION_REASONS, hmacKey, pseudonym, validateExclusions,
  readPrivateExclusions, buildBuyerReviewQueue
};
