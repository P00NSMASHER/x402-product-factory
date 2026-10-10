"use strict";

// Operator-local, append-only, cross-batch ledger of RPC-corroborated transfers.
// Never equate a transfer with external buyers, booked revenue, or Product 025 unlock.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const {
  CHAIN, USDC, RECEIVER, ROUTE_IDS, makeRpc, reconcileEvents
} = require("./reconcile-settlements");

const GENESIS = "0".repeat(64);
const MAX_BYTES = 8 * 1024 * 1024;
const ROOT = path.resolve(__dirname, "../..");
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
function isHash(value) {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value);
}
function isAddress(value) {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value);
}
function positiveDigits(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}
function privatePath(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) fail("LEDGER_ABSOLUTE_PATH_REQUIRED");
  const resolved = path.resolve(file);
  if (resolved === ROOT || resolved.startsWith(ROOT + path.sep)) fail("LEDGER_MUST_BE_OUTSIDE_REPOSITORY");
  const parent = path.dirname(resolved);
  if (!fs.existsSync(parent)) fail("LEDGER_DIRECTORY_MISSING");
  const dir = fs.lstatSync(parent);
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) !== 0) {
    fail("LEDGER_DIRECTORY_NOT_PRIVATE");
  }
  // Reject indirect symlinked parent components and their alias paths.
  if (fs.realpathSync(parent) !== parent) fail("LEDGER_PARENT_SYMLINK");
  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
      fail("LEDGER_FILE_NOT_PRIVATE");
    }
  }
  return resolved;
}
function appendOnlyPayload(row, sequence, previous_hash, checkedAt) {
  // V2 anchors evidence to the RPC canonical block hash; V1 remains read-only.
  // Intentionally minimal metadata; no source queries, auth, or signed payloads.
  return {
    schema_version: 2,
    sequence,
    previous_hash,
    network: CHAIN,
    route: row.route,
    transaction: row.transaction,
    transaction_log_index: row.transaction_log_index,
    payer: row.payer,
    receiver: RECEIVER,
    token_contract: USDC,
    amount_atomic_usdc: row.confirmed_transfer_amount_atomic_usdc,
    block_number: row.block_number,
    canonical_block_hash: row.canonical_block_hash,
    confirmations_at_check: row.confirmations_at_check,
    evidence_source: "independent_base_rpc_receipt",
    observed_at: checkedAt,
    onchain_verified: true,
    external_buyer_verified: false,
    eligible_for_revenue_scoreboard: false
  };
}
function validatePayload(item, sequence, previous) {
  if (!item || typeof item !== "object" || Array.isArray(item)) fail("LEDGER_INVALID_RECORD");
  const legacy = item.schema_version === 1;
  if (!legacy && item.schema_version !== 2) fail("LEDGER_UNSUPPORTED_VERSION");
  if (Object.keys(item).join(",") !== [
    "schema_version", "sequence", "previous_hash", "network", "route",
    "transaction", "transaction_log_index", "payer", "receiver", "token_contract",
    "amount_atomic_usdc", "block_number",
    ...(legacy ? [] : ["canonical_block_hash"]), "confirmations_at_check",
    "evidence_source", "observed_at", "onchain_verified",
    "external_buyer_verified", "eligible_for_revenue_scoreboard"
  ].join(",")) fail("LEDGER_RECORD_SHAPE");
  if (item.sequence !== sequence ||
      item.previous_hash !== previous || item.network !== CHAIN ||
      !ROUTE_IDS.has(item.route) || !isHash(item.transaction) ||
      !positiveDigits(item.transaction_log_index) || !isAddress(item.payer) ||
      item.receiver !== RECEIVER || item.token_contract !== USDC ||
      item.amount_atomic_usdc !== "5000" || !positiveDigits(item.block_number) ||
      (!legacy && !isHash(item.canonical_block_hash)) ||
      !positiveDigits(item.confirmations_at_check) ||
      BigInt(item.confirmations_at_check) < 12n ||
      item.evidence_source !== "independent_base_rpc_receipt" ||
      typeof item.observed_at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.observed_at) ||
      !Number.isFinite(Date.parse(item.observed_at)) ||
      item.onchain_verified !== true ||
      item.external_buyer_verified !== false ||
      item.eligible_for_revenue_scoreboard !== false) {
    fail("LEDGER_CONTRACT_VIOLATION");
  }
}
function seal(payload) {
  return { ...payload, hash: sha256(JSON.stringify(payload)) };
}
function readLedger(file) {
  const location = privatePath(file);
  if (!fs.existsSync(location)) return { records: [], head: GENESIS, seen: new Set(), bytes: 0, legacyCount: 0 };
  const fd = fs.openSync(location, fs.constants.O_RDONLY | O_NOFOLLOW);
  let raw;
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || st.size > MAX_BYTES) fail("LEDGER_TOO_LARGE_OR_NOT_FILE");
    raw = fs.readFileSync(fd, "utf8");
  } finally { fs.closeSync(fd); }
  if (raw.length && !raw.endsWith("\n")) fail("LEDGER_INCOMPLETE_WRITE");
  const lines = raw ? raw.slice(0, -1).split("\n") : [];
  const records = [], seen = new Set();
  let head = GENESIS, legacyCount = 0;
  for (const line of lines) {
    if (!line || line.length > 10000) fail("LEDGER_INVALID_LINE");
    let parsed;
    try { parsed = JSON.parse(line); } catch { fail("LEDGER_INVALID_JSON"); }
    if (line !== JSON.stringify(parsed)) fail("LEDGER_NONCANONICAL_LINE");
    const { hash, ...payload } = parsed || {};
    validatePayload(payload, records.length + 1, head);
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) ||
        hash !== sha256(JSON.stringify(payload))) fail("LEDGER_HASH_MISMATCH");
    // This is intentionally transaction-level, not merely in-batch/log-index.
    if (seen.has(payload.transaction)) fail("LEDGER_DUPLICATE_TRANSACTION");
    seen.add(payload.transaction);
    if (payload.schema_version === 1) legacyCount++;
    records.push(parsed);
    head = hash;
  }
  return { records, head, seen, bytes: Buffer.byteLength(raw), legacyCount };
}
function lock(file) {
  const name = file + ".lock";
  let fd;
  try {
    fd = fs.openSync(name,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW,
      0o600);
  } catch (error) {
    if (error.code === "EEXIST") fail("LEDGER_LOCKED_REVIEW_REQUIRED");
    throw error;
  }
  try {
    fs.writeSync(fd, String(process.pid) + "\n");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return () => fs.unlinkSync(name);
}
function appendRows(file, rows, priorBytes) {
  if (!rows.length) return;
  const buffer = Buffer.from(rows.map(row => JSON.stringify(row) + "\n").join(""), "utf8");
  if (buffer.length + priorBytes > MAX_BYTES) fail("LEDGER_SIZE_LIMIT");
  const fd = fs.openSync(file,
    fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | O_NOFOLLOW,
    0o600);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) !== 0 || st.size !== priorBytes) {
      fail("LEDGER_CHANGED_DURING_WRITE");
    }
    let offset = 0;
    while (offset < buffer.length) {
      const wrote = fs.writeSync(fd, buffer, offset, buffer.length - offset);
      if (wrote < 1) fail("LEDGER_WRITE_FAILED");
      offset += wrote;
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  // Flush the directory entry for newly created files where supported.
  let dirFd;
  try {
    dirFd = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
    fs.fsyncSync(dirFd);
  } finally { if (dirFd !== undefined) fs.closeSync(dirFd); }
}
function checkVerifiedRow(row) {
  return row?.status === "verified_onchain_transfer" &&
    row.onchain_verified === true &&
    row.external_buyer_verified === false &&
    row.eligible_for_revenue_scoreboard === false &&
    ROUTE_IDS.has(row.route) &&
    isHash(row.transaction) && isAddress(row.payer) &&
    row.receiver === RECEIVER && row.token_contract === USDC &&
    row.confirmed_transfer_amount_atomic_usdc === "5000" &&
    positiveDigits(row.block_number) &&
    isHash(row.canonical_block_hash) &&
    positiveDigits(row.transaction_log_index) &&
    positiveDigits(row.confirmations_at_check) &&
    BigInt(row.confirmations_at_check) >= 12n &&
    row.evidence_source === "independent_base_rpc_receipt";
}
function verifyExternalCheckpoint(journal, checkpoint) {
  if (checkpoint === undefined) return false;
  if (!checkpoint || typeof checkpoint !== "object" ||
      !/^[0-9a-f]{64}$/.test(checkpoint.head || "") ||
      !Number.isSafeInteger(checkpoint.records) || checkpoint.records < 0) {
    fail("LEDGER_CHECKPOINT_INVALID");
  }
  if (journal.head !== checkpoint.head ||
      journal.records.length !== checkpoint.records) {
    fail("LEDGER_CHECKPOINT_MISMATCH");
  }
  return true;
}
function auditReplay(journal, checkpoint) {
  const verified = verifyExternalCheckpoint(journal, checkpoint);
  return {
    schema_version: 1,
    integrity: "validated_local_hash_chain",
    checkpoint_verified: verified,
    records: journal.records.length,
    head_hash: journal.head,
    legacy_records_requiring_review: journal.legacyCount,
    external_buyer_verified: false,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false
  };
}
async function appendReconciledObservations(events, {
  ledgerPath, rpcCall, now = () => new Date().toISOString(), checkpoint
} = {}) {
  const location = privatePath(ledgerPath);
  // Do NOT accept a supplied "verified" report. The library derives all proof
  // from raw observations and a read-only RPC call in the same operation.
  const report = await reconcileEvents(events, { rpcCall, minConfirmations: 12 });
  const release = lock(location);
  try {
    const journal = readLedger(location);
    const checkpointVerified = verifyExternalCheckpoint(journal, checkpoint);
    if (journal.legacyCount) fail("LEDGER_LEGACY_REVIEW_REQUIRED");
    const pending = [], seen = new Set(journal.seen);
    let head = journal.head, duplicates = 0, unverified = 0;
    const checkedAt = now();
    if (typeof checkedAt !== "string" || !Number.isFinite(Date.parse(checkedAt))) {
      fail("LEDGER_INVALID_OBSERVATION_TIME");
    }
    for (const row of report.events) {
      if (row.status !== "verified_onchain_transfer") { unverified++; continue; }
      if (!checkVerifiedRow(row)) fail("LEDGER_INVALID_RECONCILIATION");
      if (seen.has(row.transaction)) { duplicates++; continue; }
      const payload = appendOnlyPayload(row, journal.records.length + pending.length + 1, head, checkedAt);
      validatePayload(payload, payload.sequence, head);
      const saved = seal(payload);
      pending.push(saved);
      seen.add(row.transaction);
      head = saved.hash;
    }
    appendRows(location, pending, journal.bytes);
    // This total is transfer evidence, *never* confirmed outside revenue.
    return {
      schema_version: 1,
      verified_transfer_evidence_added: pending.length,
      previously_recorded_transactions: duplicates,
      unresolved_or_rejected_observations: unverified,
      total_verified_transfer_evidence: journal.records.length + pending.length,
      head_hash: head,
      prior_checkpoint_verified: checkpointVerified,
      eligible_external_revenue_atomic_usdc: "0",
      verified_external_buyers: 0,
      product_025_unlock_evidence: false
    };
  } finally { release(); }
}
function auditLedger(file, { checkpoint } = {}) {
  const location = privatePath(file);
  if (!fs.existsSync(location)) fail("LEDGER_NOT_FOUND");
  return auditReplay(readLedger(location), checkpoint);
}
async function auditLedgerAgainstChain(file, { rpcCall, checkpoint } = {}) {
  if (typeof rpcCall !== "function") fail("LEDGER_RPC_REQUIRED");
  const location = privatePath(file);
  if (!fs.existsSync(location)) fail("LEDGER_NOT_FOUND");
  // One validated immutable in-memory snapshot for both journal and RPC audit.
  const journal = readLedger(location);
  const local = auditReplay(journal, checkpoint);
  const chain = await rpcCall("eth_chainId", []);
  if (chain !== "0x2105") fail("wrong_rpc_chain");
  const current = await rpcCall("eth_blockNumber", []);
  if (typeof current !== "string" ||
      !/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(current)) {
    fail("LEDGER_INVALID_CHAIN_HEAD");
  }
  const height = BigInt(current);
  const statuses = {
    canonical: 0,
    block_mismatch: 0,
    block_unavailable: 0,
    insufficient_confirmations: 0,
    legacy_records_requiring_review: 0
  };
  for (const row of journal.records) {
    if (row.schema_version === 1) {
      statuses.legacy_records_requiring_review++;
      continue;
    }
    const blockNumber = BigInt(row.block_number);
    if (blockNumber > height || height - blockNumber + 1n < 12n) {
      statuses.insufficient_confirmations++;
      continue;
    }
    let block;
    try {
      block = await rpcCall("eth_getBlockByNumber", [
        "0x" + blockNumber.toString(16), false
      ]);
    } catch {
      statuses.block_unavailable++;
      continue;
    }
    if (!block || typeof block.hash !== "string" ||
        !isHash(block.hash.toLowerCase()) ||
        typeof block.number !== "string" ||
        !/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(block.number)) {
      statuses.block_unavailable++;
    } else if (BigInt(block.number) !== blockNumber ||
               block.hash.toLowerCase() !== row.canonical_block_hash) {
      statuses.block_mismatch++;
    } else {
      statuses.canonical++;
    }
  }
  return {
    schema_version: 1,
    integrity: local.integrity,
    records: local.records,
    head_hash: local.head_hash,
    checkpoint_verified: local.checkpoint_verified,
    chain: CHAIN,
    chain_head_at_check: height.toString(),
    ...statuses,
    all_recorded_blocks_still_canonical:
      local.records > 0 &&
      statuses.canonical === local.records &&
      statuses.block_mismatch === 0 &&
      statuses.block_unavailable === 0 &&
      statuses.insufficient_confirmations === 0 &&
      statuses.legacy_records_requiring_review === 0,
    external_buyer_verified: false,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false
  };
}
async function main() {
  if (process.argv.length === 4 && process.argv[2] === "--audit-chain") {
    if (!process.env.BASE_RPC_URL) fail("BASE_RPC_URL_REQUIRED");
    process.stdout.write(JSON.stringify(
      await auditLedgerAgainstChain(process.argv[3], {
        rpcCall: makeRpc(process.env.BASE_RPC_URL)
      }), null, 2) + "\n");
    return;
  }
  if (process.argv.length === 4 && process.argv[2] === "--audit") {
    process.stdout.write(JSON.stringify(auditLedger(process.argv[3]), null, 2) + "\n");
    return;
  }
  if (process.argv.length !== 4 || !process.env.BASE_RPC_URL) {
    fail("USAGE_PRIVATE_LEDGER_AND_BASE_RPC_URL_REQUIRED");
  }
  const observationsFile = process.argv[2];
  if (!path.isAbsolute(observationsFile)) fail("OBSERVATIONS_ABSOLUTE_PATH_REQUIRED");
  const observationSize = fs.statSync(observationsFile).size;
  if (observationSize > 1000000) fail("OBSERVATIONS_TOO_LARGE");
  const observations = JSON.parse(fs.readFileSync(observationsFile, "utf8"));
  const summary = await appendReconciledObservations(observations, {
    ledgerPath: process.argv[3],
    rpcCall: makeRpc(process.env.BASE_RPC_URL)
  });
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}
if (require.main === module) {
  main().catch(() => {
    // Never disclose RPC keys, customer addresses or untrusted contents on error.
    process.stderr.write("Private settlement ledger operation failed; inspect local inputs and existing lock.\n");
    process.exitCode = 1;
  });
}
module.exports = {
  GENESIS, MAX_BYTES, sha256, seal, readLedger, privatePath,
  checkVerifiedRow, appendReconciledObservations, auditLedger,
  auditLedgerAgainstChain
};
