"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {GENESIS, seal, readLedger} = require("./settlement-ledger");
const {CHAIN, USDC, RECEIVER} = require("./reconcile-settlements");
const {
  MAX_JOURNALS, validateManifest, loadPrivateManifest,
  evidenceIdentity, sameSnapshot, auditCrossJournals
} = require("./cross-journal-audit");

const KEY = "12".repeat(32);
const OTHER_KEY = "34".repeat(32);
const TX_A = "0x" + "a".repeat(64);
const TX_B = "0x" + "b".repeat(64);
const TX_C = "0x" + "c".repeat(64);
const PAYER_A = "0x" + "d".repeat(40);
const PAYER_B = "0x" + "e".repeat(40);
const HASH = "0x" + "f".repeat(64);

function withPrivateDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "x402-cross-ledger-"));
  fs.chmodSync(directory, 0o700);
  try { return callback(directory); }
  finally { fs.rmSync(directory, {recursive: true, force: true}); }
}
function makeRow(transaction, {
  payer = PAYER_A, route = "/api/domain-rdap", blockHash = HASH,
  observed = "2026-10-10T05:00:00.000Z", confirmations = "29"
} = {}) {
  return {
    schema_version: 2,
    network: CHAIN,
    route,
    transaction,
    transaction_log_index: "2",
    payer,
    receiver: RECEIVER,
    token_contract: USDC,
    amount_atomic_usdc: "5000",
    block_number: "100",
    canonical_block_hash: blockHash,
    confirmations_at_check: confirmations,
    evidence_source: "independent_base_rpc_receipt",
    observed_at: observed,
    onchain_verified: true,
    external_buyer_verified: false,
    eligible_for_revenue_scoreboard: false
  };
}
function createJournal(directory, name, rows) {
  const file = path.join(directory, name);
  let previous = GENESIS;
  const sealed = rows.map((row, index) => {
    const payload = {
      schema_version: row.schema_version,
      sequence: index + 1,
      previous_hash: previous,
      network: row.network,
      route: row.route,
      transaction: row.transaction,
      transaction_log_index: row.transaction_log_index,
      payer: row.payer,
      receiver: row.receiver,
      token_contract: row.token_contract,
      amount_atomic_usdc: row.amount_atomic_usdc,
      block_number: row.block_number,
      canonical_block_hash: row.canonical_block_hash,
      confirmations_at_check: row.confirmations_at_check,
      evidence_source: row.evidence_source,
      observed_at: row.observed_at,
      onchain_verified: row.onchain_verified,
      external_buyer_verified: row.external_buyer_verified,
      eligible_for_revenue_scoreboard: row.eligible_for_revenue_scoreboard
    };
    const entry = seal(payload);
    previous = entry.hash;
    return entry;
  });
  fs.writeFileSync(file, sealed.map(row => JSON.stringify(row) + "\n").join(""), {
    mode: 0o600
  });
  fs.chmodSync(file, 0o600);
  return {journal_path: file, expected_head: previous, expected_records: rows.length};
}
function manifest(...entries) {
  return {schema_version: 1, journals: entries};
}
function manifestFile(directory, value, filename = "manifest.json") {
  const file = path.join(directory, filename);
  fs.writeFileSync(file, JSON.stringify(value), {mode: 0o600});
  fs.chmodSync(file, 0o600);
  return file;
}

test("duplicates across separately valid journals cannot become extra sale evidence", () =>
  withPrivateDir(directory => {
    const first = createJournal(directory, "first.jsonl", [
      makeRow(TX_A), makeRow(TX_B, {payer: PAYER_B, route: "/api/sec-filings"})
    ]);
    const second = createJournal(directory, "second.jsonl", [
      makeRow(TX_A, {observed: "2026-10-10T06:00:00.000Z", confirmations: "42"}),
      makeRow(TX_C)
    ]);
    const result = auditCrossJournals(manifest(first, second), {keyHex: KEY});
    assert.equal(result.report_type, "cross_journal_transfer_evidence_not_sales");
    assert.equal(result.status, "deduplicated_evidence_requires_buyer_review");
    assert.equal(result.journal_count, 2);
    assert.equal(result.all_external_checkpoints_verified, true);
    assert.equal(result.current_chain_reverified, false);
    assert.equal(result.total_journal_transfer_evidence_rows, 4);
    assert.equal(result.unique_transaction_references, 3);
    assert.equal(result.redundant_cross_journal_references, 1);
    assert.equal(result.overlapping_transaction_cases, 1);
    assert.equal(result.conflicting_transaction_cases, 0);
    assert.equal(result.uncontested_unique_transfer_evidence_not_sales, 3);
    assert.equal(result.overlap_cases.length, 1);
    assert.equal(result.overlap_cases[0].case_id.length, 64);
    assert.deepEqual(result.overlap_cases[0].journal_indices, [1, 2]);
    assert.equal(result.overlap_cases[0].revenue_eligible, false);
    assert.equal(result.overlap_cases[0].status,
      "duplicate_transfer_evidence_not_additional_sale");
    const route = result.per_route_uncontested_evidence_not_sales
      .find(item => item.route === "/api/domain-rdap");
    assert.equal(route.transfer_evidence, 2);
    assert.equal(result.per_route_uncontested_evidence_not_sales
      .reduce((sum, row) => sum + row.transfer_evidence, 0), 3);
    assert.equal(result.independently_verified_external_buyers, 0);
    assert.equal(result.eligible_external_revenue_atomic_usdc, "0");
    assert.equal(result.product_025_unlock_evidence, false);
    const report = JSON.stringify(result);
    for (const secret of [KEY, TX_A, TX_B, TX_C, PAYER_A, PAYER_B, directory]) {
      assert.equal(report.includes(secret), false);
    }
    const different = auditCrossJournals(manifest(first, second),
      {keyHex: OTHER_KEY});
    assert.notEqual(result.overlap_cases[0].case_id,
      different.overlap_cases[0].case_id);
  }));

test("conflicting attribution for one transaction blocks route evidence", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", [makeRow(TX_A)]);
    const b = createJournal(directory, "second.jsonl", [
      makeRow(TX_A, {payer: PAYER_B, route: "/api/sec-filings"})
    ]);
    const result = auditCrossJournals(manifest(a, b), {keyHex: KEY});
    assert.equal(result.conflicting_transaction_cases, 1);
    assert.equal(result.unique_transaction_references, 1);
    assert.equal(result.redundant_cross_journal_references, 1);
    assert.equal(result.uncontested_unique_transfer_evidence_not_sales, 0);
    assert.equal(result.status, "conflicts_require_manual_review");
    assert.equal(result.overlap_cases[0].status,
      "conflicting_evidence_manual_review_required");
    assert.equal(result.per_route_uncontested_evidence_not_sales
      .reduce((sum, row) => sum + row.transfer_evidence, 0), 0);
    assert.equal(result.eligible_external_revenue_atomic_usdc, "0");
  }));

test("block placement mismatches are conflicts; observation timestamps are not", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", [makeRow(TX_A)]);
    const b = createJournal(directory, "second.jsonl", [
      makeRow(TX_A, {blockHash: "0x" + "1".repeat(64)})
    ]);
    assert.equal(auditCrossJournals(manifest(a,b), {keyHex:KEY})
      .conflicting_transaction_cases, 1);
    assert.equal(evidenceIdentity(makeRow(TX_A, {observed: "2026-10-11T02:00:00.000Z"})),
      evidenceIdentity(makeRow(TX_A)));
  }));

test("missing or stale external checkpoints fail rather than infer independent provenance", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", [makeRow(TX_A)]);
    const b = createJournal(directory, "second.jsonl", [makeRow(TX_B)]);
    assert.throws(() => auditCrossJournals(manifest(
      {...a, expected_head: GENESIS}, b), {keyHex:KEY}), /CHECKPOINT_MISMATCH/);
    assert.throws(() => auditCrossJournals(manifest(
      {...a, expected_records: 0}, b), {keyHex:KEY}), /CHECKPOINT_MISMATCH/);
    const raw = fs.readFileSync(a.journal_path, "utf8");
    fs.writeFileSync(a.journal_path, raw.replace('"5000"','"5001"'));
    assert.throws(() => auditCrossJournals(manifest(a,b), {keyHex:KEY}),
      /LEDGER_(HASH_MISMATCH|CONTRACT_VIOLATION)/);
  }));

test("duplicate transaction inside one journal is rejected by existing ledger validator", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", [makeRow(TX_A),makeRow(TX_A)]);
    const b = createJournal(directory, "second.jsonl", [makeRow(TX_B)]);
    assert.throws(() => auditCrossJournals(manifest(a,b), {keyHex:KEY}),
      /LEDGER_DUPLICATE_TRANSACTION/);
  }));

test("manifest schema is strict and prevents path aliasing and excessive journals", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", []);
    const b = createJournal(directory, "second.jsonl", []);
    const valid = manifest(a,b);
    assert.deepEqual(validateManifest(valid), [a,b]);
    assert.throws(() => validateManifest({...valid, approved_buyers: 10}),
      /MANIFEST_INVALID/);
    assert.throws(() => validateManifest(manifest(a)), /MANIFEST_INVALID/);
    assert.throws(() => validateManifest({schema_version: 1, journals:
      Array(MAX_JOURNALS+1).fill(a)}), /MANIFEST_INVALID/);
    assert.throws(() => validateManifest(manifest(a, {...a})), /DUPLICATE_PATH/);
    assert.throws(() => validateManifest(manifest(
      a, {...b, journal_path: b.journal_path.replace("second", "./second")})
    ), /ENTRY_INVALID/);
    assert.throws(() => validateManifest(manifest(
      a, {...b, expected_head: "invalid"})
    ), /ENTRY_INVALID/);
    assert.throws(() => validateManifest(manifest(
      a, {...b, eligible_external_revenue: "999"})
    ), /ENTRY_INVALID/);
    assert.throws(() => auditCrossJournals(valid, {}), /KEY_MUST_BE_32_BYTE_HEX/);
  }));

test("private manifest rejects public permissions, symlinks, and missing files", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", []);
    const b = createJournal(directory, "second.jsonl", []);
    const filename = manifestFile(directory, manifest(a,b));
    assert.deepEqual(loadPrivateManifest(filename), manifest(a,b));
    fs.chmodSync(filename, 0o644);
    assert.throws(() => loadPrivateManifest(filename), /LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(filename, 0o600);
    const alias = path.join(directory, "link.json");
    fs.symlinkSync(filename, alias);
    assert.throws(() => loadPrivateManifest(alias), /LEDGER_FILE_NOT_PRIVATE/);
    assert.throws(() => loadPrivateManifest(path.join(directory, "absent.json")),
      /MANIFEST_MISSING/);
  }));

test("empty journals never synthesize activity; snapshots include file identity", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", []);
    const b = createJournal(directory, "second.jsonl", []);
    const output = auditCrossJournals(manifest(a,b), {keyHex:KEY});
    assert.equal(output.status, "no_evidence");
    assert.equal(output.unique_transaction_references, 0);
    assert.equal(output.eligible_external_revenue_atomic_usdc, "0");
    const old = readLedger(a.journal_path);
    const replacement = path.join(directory, "replacement.jsonl");
    fs.writeFileSync(replacement, "", {mode:0o600});
    fs.renameSync(replacement, a.journal_path);
    const newer = readLedger(a.journal_path);
    assert.equal(sameSnapshot(old, newer), false);
    assert.equal(sameSnapshot(newer, newer), true);
  }));

test("CLI is offline, refuses absent key, and never prints raw payment evidence", () =>
  withPrivateDir(directory => {
    const a = createJournal(directory, "first.jsonl", [makeRow(TX_A)]);
    const b = createJournal(directory, "second.jsonl", [makeRow(TX_A)]);
    const mf = manifestFile(directory, manifest(a,b));
    const binary = path.join(__dirname, "cross-journal-audit.js");
    const before = [
      fs.readFileSync(a.journal_path, "utf8"),
      fs.readFileSync(b.journal_path, "utf8")
    ];
    const missingKey = spawnSync(process.execPath, [binary,mf], {
      encoding:"utf8", env:{...process.env, X402_REVIEW_HMAC_KEY:""}
    });
    assert.equal(missingKey.status, 1);
    assert.ok(!missingKey.stderr.includes(TX_A));
    assert.ok(!missingKey.stderr.includes(directory));
    const cli = spawnSync(process.execPath, [binary,mf], {
      encoding:"utf8", env:{...process.env, X402_REVIEW_HMAC_KEY:KEY}
    });
    assert.equal(cli.status,0,cli.stderr);
    const result = JSON.parse(cli.stdout);
    assert.equal(result.overlapping_transaction_cases,1);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
    assert.ok(!cli.stdout.includes(TX_A));
    assert.ok(!cli.stdout.includes(PAYER_A));
    assert.deepEqual([
      fs.readFileSync(a.journal_path,"utf8"),
      fs.readFileSync(b.journal_path,"utf8")
    ],before);
  }));
