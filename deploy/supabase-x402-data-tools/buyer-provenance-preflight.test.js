"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {GENESIS, seal} = require("./settlement-ledger");
const {CHAIN, USDC, RECEIVER} = require("./reconcile-settlements");
const {hmacKey, pseudonym} = require("./buyer-review-queue");
const {auditCrossJournals} = require("./cross-journal-audit");
const {
  WALLET_EVIDENCE, TRANSACTION_EVIDENCE,
  validateDossiers, loadPrivateDossiers, scopeIdentifier,
  buildProvenancePreflight
} = require("./buyer-provenance-preflight");

const KEY = "19".repeat(32);
const ROTATED_KEY = "83".repeat(32);
const A = "0x" + "a".repeat(64);
const B = "0x" + "b".repeat(64);
const C = "0x" + "c".repeat(64);
const PAYER_A = "0x" + "d".repeat(40);
const PAYER_B = "0x" + "e".repeat(40);
const BLOCK = "0x" + "f".repeat(64);

function inPrivateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x402-provenance-"));
  fs.chmodSync(dir, 0o700);
  try { return fn(dir); }
  finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
function row(transaction, opts = {}) {
  return {
    schema_version: 2,
    network: CHAIN,
    route: opts.route || "/api/domain-rdap",
    transaction,
    transaction_log_index: "2",
    payer: opts.payer || PAYER_A,
    receiver: RECEIVER,
    token_contract: USDC,
    amount_atomic_usdc: "5000",
    block_number: "100",
    canonical_block_hash: opts.block || BLOCK,
    confirmations_at_check: opts.confirmations || "29",
    evidence_source: "independent_base_rpc_receipt",
    observed_at: opts.observed || "2026-10-10T05:00:00.000Z",
    onchain_verified: true,
    external_buyer_verified: false,
    eligible_for_revenue_scoreboard: false
  };
}
function journal(dir, filename, rows) {
  let previous = GENESIS;
  const records = rows.map((item,index) => {
    const payload = {
      schema_version: item.schema_version,
      sequence: index + 1,
      previous_hash: previous,
      network: item.network,
      route: item.route,
      transaction: item.transaction,
      transaction_log_index: item.transaction_log_index,
      payer: item.payer,
      receiver: item.receiver,
      token_contract: item.token_contract,
      amount_atomic_usdc: item.amount_atomic_usdc,
      block_number: item.block_number,
      canonical_block_hash: item.canonical_block_hash,
      confirmations_at_check: item.confirmations_at_check,
      evidence_source: item.evidence_source,
      observed_at: item.observed_at,
      onchain_verified: item.onchain_verified,
      external_buyer_verified: item.external_buyer_verified,
      eligible_for_revenue_scoreboard: item.eligible_for_revenue_scoreboard
    };
    const record = seal(payload);
    previous = record.hash;
    return record;
  });
  const journalPath = path.join(dir, filename);
  fs.writeFileSync(journalPath,
    records.map(item => JSON.stringify(item) + "\n").join(""), {mode:0o600});
  fs.chmodSync(journalPath, 0o600);
  return {
    journal_path: journalPath,
    expected_head: previous,
    expected_records: records.length
  };
}
function makeFixture(dir) {
  const first = journal(dir, "first.jsonl", [
    row(A), row(B, {route:"/api/sec-filings"})
  ]);
  const second = journal(dir, "second.jsonl", [
    row(A, {confirmations:"31"}), row(C, {payer:PAYER_B})
  ]);
  const manifest = {schema_version:1,journals:[first,second]};
  const scope = scopeIdentifier(manifest, KEY);
  const report = auditCrossJournals(manifest,{
    keyHex:KEY,includeTransactionCaseIds:true
  });
  const caseA = report.global_wallet_review.cases.find(item =>
    item.case_id === pseudonym(hmacKey(KEY), "wallet", PAYER_A));
  const caseB = report.global_wallet_review.cases.find(item =>
    item.case_id === pseudonym(hmacKey(KEY), "wallet", PAYER_B));
  assert.ok(caseA);
  assert.ok(caseB);
  return {dir,first,second,manifest,scope,caseA,caseB};
}
function document(scope,cases=[]) {
  return {schema_version:1,journal_scope_id:scope,cases};
}
function evidenceFor(walletCase, {omit=[]}={}) {
  const all = [];
  for (const [type,source_kind] of Object.entries(WALLET_EVIDENCE)) {
    if (omit.includes(type)) continue;
    all.push({
      type,subject_case_id:walletCase.case_id,source_kind,
      private_reference:"private_"+type+"_wallet"
    });
  }
  for(const [index,txId] of walletCase.transaction_case_ids.entries()) {
    for (const [type,source_kind] of Object.entries(TRANSACTION_EVIDENCE)) {
      if(omit.includes(type) && index===0) continue;
      all.push({
        type,subject_case_id:txId,source_kind,
        private_reference:"private_"+type+"_transaction_"+index
      });
    }
  }
  return all;
}
function packet(walletCase,evidence = evidenceFor(walletCase)) {
  return {
    case_id:walletCase.case_id,
    operator_reference:"operator_record_0001",
    reviewer_reference:"separate_reviewer_0001",
    evidence
  };
}
function privateJson(dir,name,doc) {
  const filename = path.join(dir,name);
  fs.writeFileSync(filename,JSON.stringify(doc),{mode:0o600});
  fs.chmodSync(filename,0o600);
  return filename;
}

test("opt-in transaction cases are keyed and cross-journal duplicates appear once", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const defaultAudit=auditCrossJournals(f.manifest,{keyHex:KEY});
    assert.equal(Object.hasOwn(defaultAudit.global_wallet_review.cases[0],
      "transaction_case_ids"),false);
    assert.equal(f.caseA.unique_transaction_evidence_not_sales,2);
    assert.equal(f.caseA.transaction_case_ids.length,2);
    assert.equal(f.caseB.transaction_case_ids.length,1);
    assert.equal(new Set(f.caseA.transaction_case_ids).size,2);
    const expected=pseudonym(hmacKey(KEY),"cross-journal-transaction",CHAIN+":"+A);
    assert.ok(f.caseA.transaction_case_ids.includes(expected));
    assert.ok(!f.caseB.transaction_case_ids.includes(expected));
    assert.deepEqual(f.caseA.transaction_case_ids,
      [...f.caseA.transaction_case_ids].sort());
    const text=JSON.stringify(f.caseA);
    assert.ok(!text.includes(A));
    assert.ok(!text.includes(PAYER_A));
    assert.ok(!text.includes(KEY));
  }));

test("zero dossiers produces explicit reference gaps rather than manufactured buyers", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const result=buildProvenancePreflight(f.manifest,{
      keyHex:KEY,dossier:document(f.scope)
    });
    assert.equal(result.source_journal_count,2);
    assert.equal(result.source_unique_transactions_not_sales,3);
    assert.equal(result.reviewed_wallet_cases_not_buyers,2);
    assert.equal(result.missing_dossiers,2);
    assert.equal(result.complete_reference_catalogs_not_verified,0);
    assert.equal(result.incomplete_reference_packets,0);
    assert.equal(result.supplied_reference_items,0);
    assert.equal(result.missing_reference_items,17); // (4+3*2) + (4+3*1)
    assert.equal(result.cases.every(x=>x.status==="no_private_dossier_supplied"),true);
    const a=result.cases.find(x=>x.case_id===f.caseA.case_id);
    assert.equal(a.missing_wallet_evidence.length,4);
    assert.equal(a.missing_transaction_evidence.length,2);
    assert.equal(a.missing_transaction_evidence[0].missing_evidence.length,3);
    assert.equal(result.source_references_independently_examined,false);
    assert.equal(result.reviewer_identity_independently_authenticated,false);
    assert.equal(result.current_chain_reverified,false);
    assert.equal(result.independently_verified_external_buyers,0);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(result.product_025_unlock_evidence,false);
  }));

test("full catalog remains unverified; partial catalog specifies only missing evidence", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const result=buildProvenancePreflight(f.manifest,{
      keyHex:KEY,dossier:document(f.scope,[
        packet(f.caseA),packet(f.caseB,evidenceFor(f.caseB,{
          omit:["buyer_independence","refund_reversal_check"]
        }))
      ])
    });
    assert.equal(result.missing_dossiers,0);
    assert.equal(result.complete_reference_catalogs_not_verified,1);
    assert.equal(result.incomplete_reference_packets,1);
    const complete=result.cases.find(x=>x.case_id===f.caseA.case_id);
    assert.equal(complete.status,
      "reference_catalog_complete_independent_validation_required");
    assert.equal(complete.evidence_references_supplied,10);
    assert.deepEqual(complete.missing_wallet_evidence,[]);
    assert.deepEqual(complete.missing_transaction_evidence,[]);
    assert.equal(complete.independent_buyer_verified,false);
    assert.equal(complete.eligible_revenue_atomic_usdc,"0");
    const partial=result.cases.find(x=>x.case_id===f.caseB.case_id);
    assert.equal(partial.status,"evidence_references_incomplete");
    assert.deepEqual(partial.missing_wallet_evidence,["buyer_independence"]);
    assert.deepEqual(partial.missing_transaction_evidence,[{
      transaction_case_id:f.caseB.transaction_case_ids[0],
      missing_evidence:["refund_reversal_check"]
    }]);
    assert.equal(result.missing_reference_items,2);
    assert.equal(result.supplied_reference_items,15);
    assert.equal(result.independently_verified_external_buyers,0);
    const printed=JSON.stringify(result);
    for(const secret of [
      A,B,C,PAYER_A,PAYER_B,KEY,dir,"operator_record_0001",
      "separate_reviewer_0001","private_refund_reversal_check_transaction_0"
    ]) {
      assert.equal(printed.includes(secret),false);
    }
  }));

test("dossiers are scope-bound and cannot be reused after manifest reordering", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    assert.notEqual(scopeIdentifier({
      schema_version:1,journals:[f.second,f.first]
    },KEY),f.scope);
    assert.notEqual(scopeIdentifier(f.manifest,ROTATED_KEY),f.scope);
    const dossiers=document(f.scope,[packet(f.caseA)]);
    assert.throws(() => buildProvenancePreflight({
      schema_version:1,journals:[f.second,f.first]
    },{keyHex:KEY,dossier:dossiers}),/JOURNAL_SCOPE_CHECKPOINT_MISMATCH/);
    assert.throws(() => buildProvenancePreflight(f.manifest,{
      keyHex:ROTATED_KEY,dossier:dossiers
    }),/JOURNAL_SCOPE_CHECKPOINT_MISMATCH/);
    assert.throws(() => buildProvenancePreflight({
      schema_version:1,journals:[
        {...f.first,expected_head:GENESIS},f.second
      ]
    },{keyHex:KEY,dossier:dossiers}),/LEDGER_CHECKPOINT_MISMATCH/);
  }));

test("cross-wallet transaction evidence linkage is rejected even when source kinds match", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const wrong=packet(f.caseB);
    wrong.evidence.find(item=>item.type==="service_delivery")
      .subject_case_id=f.caseA.transaction_case_ids[0];
    assert.throws(() => buildProvenancePreflight(f.manifest,{
      keyHex:KEY,dossier:document(f.scope,[wrong])
    }),/PROVENANCE_TRANSACTION_NOT_IN_WALLET_CASE/);
    const wrongWallet=packet(f.caseB);
    wrongWallet.evidence.find(item=>item.type==="buyer_independence")
      .subject_case_id=f.caseA.case_id;
    assert.throws(() => buildProvenancePreflight(f.manifest,{
      keyHex:KEY,dossier:document(f.scope,[wrongWallet])
    }),/PROVENANCE_WALLET_EVIDENCE_WRONG_SUBJECT/);
  }));

test("operator-excluded wallets cannot be promoted via dossier references", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const exclusions=[{
      address:PAYER_A,reason:"operator_controlled",
      evidence_reference:"operator_inventory_record_001"
    }];
    const report=buildProvenancePreflight(f.manifest,{
      keyHex:KEY,exclusions,dossier:document(f.scope)
    });
    assert.equal(report.operator_declared_non_external_wallet_cases,1);
    assert.equal(report.missing_dossiers,1);
    const excluded=report.cases.find(x=>x.case_id===f.caseA.case_id);
    assert.equal(excluded.status,"operator_declared_non_external");
    assert.equal(excluded.evidence_references_supplied,0);
    assert.equal(excluded.eligible_revenue_atomic_usdc,"0");
    assert.equal(report.independently_verified_external_buyers,0);
    assert.throws(() => buildProvenancePreflight(f.manifest,{
      keyHex:KEY,exclusions,dossier:document(f.scope,[packet(f.caseA)])
    }),/PROVENANCE_EXCLUDED_WALLET_CANNOT_BE_SUBMITTED/);
  }));

test("unknown wallet or conflicting on-chain attribution can never receive a packet", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const unknown=packet(f.caseA);
    unknown.case_id="4".repeat(64);
    assert.throws(() => buildProvenancePreflight(f.manifest,{
      keyHex:KEY,dossier:document(f.scope,[unknown])
    }),/PROVENANCE_UNKNOWN_WALLET_CASE/);
    const otherA=journal(dir,"conflict1.jsonl",[row(A)]);
    const otherB=journal(dir,"conflict2.jsonl",[
      row(A,{payer:PAYER_B,route:"/api/sec-filings"})
    ]);
    const manifest={schema_version:1,journals:[otherA,otherB]};
    const scope=scopeIdentifier(manifest,KEY);
    const clean=buildProvenancePreflight(manifest,{
      keyHex:KEY,dossier:document(scope)
    });
    assert.equal(clean.source_conflicting_transactions_quarantined,1);
    assert.equal(clean.reviewed_wallet_cases_not_buyers,0);
    assert.equal(clean.complete_reference_catalogs_not_verified,0);
    assert.equal(clean.eligible_external_revenue_atomic_usdc,"0");
    const fakePacket=packet(f.caseA);
    assert.throws(() => buildProvenancePreflight(manifest,{
      keyHex:KEY,dossier:document(scope,[fakePacket])
    }),/PROVENANCE_UNKNOWN_WALLET_CASE/);
  }));

test("strict schema blocks unknown approval fields, coercions and impersonated reviewer", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const valid=packet(f.caseA);
    assert.equal(validateDossiers(document(f.scope,[valid])).cases.length,1);
    assert.throws(()=>validateDossiers({
      ...document(f.scope,[valid]),external_buyer_verified:true
    }),/PROVENANCE_DOSSIER_DOCUMENT_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[
      valid,{...valid}
    ])),/PROVENANCE_CASE_DUPLICATE/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid, reviewer_reference:valid.operator_reference
    }])),/PROVENANCE_CASE_SCHEMA_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid, operator_reference:12345678
    }])),/PROVENANCE_CASE_SCHEMA_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid,eligible_revenue_atomic_usdc:"999"
    }])),/PROVENANCE_CASE_SCHEMA_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid,evidence:[...valid.evidence,valid.evidence[0]]
    }])),/PROVENANCE_DUPLICATE_EVIDENCE_REFERENCE/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid,evidence:[{...valid.evidence[0],source_kind:"self_report"}]
    }])),/PROVENANCE_EVIDENCE_SOURCE_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid,evidence:[{...valid.evidence[0],type:"__proto__"}]
    }])),/PROVENANCE_EVIDENCE_SOURCE_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid,evidence:[{...valid.evidence[0],private_reference:12345678}]
    }])),/PROVENANCE_EVIDENCE_SCHEMA_INVALID/);
    assert.throws(()=>validateDossiers(document(f.scope,[{
      ...valid,evidence:[{...valid.evidence[0],buyer_verified:true}]
    }])),/PROVENANCE_EVIDENCE_SCHEMA_INVALID/);
  }));

test("private dossier loader refuses world-readable files, symlinks and excess size", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const filename=privateJson(dir,"dossier.json",document(f.scope,[]));
    assert.deepEqual(loadPrivateDossiers(filename),document(f.scope,[]));
    fs.chmodSync(filename,0o644);
    assert.throws(()=>loadPrivateDossiers(filename),/LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(filename,0o600);
    const alias=path.join(dir,"symlink.json");
    fs.symlinkSync(filename,alias);
    assert.throws(()=>loadPrivateDossiers(alias),/LEDGER_FILE_NOT_PRIVATE/);
    const oversized=path.join(dir,"oversized.json");
    fs.writeFileSync(oversized,"x".repeat(512*1024+1),{mode:0o600});
    assert.throws(()=>loadPrivateDossiers(oversized),
      /PROVENANCE_DOSSIER_FILE_NOT_PRIVATE/);
    assert.throws(()=>loadPrivateDossiers(path.join(dir,"missing.json")),
      /PROVENANCE_DOSSIER_FILE_MISSING/);
  }));

test("CLI is strictly offline, prints no evidence references, and leaves input unchanged", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const manifestPath=privateJson(dir,"manifest.json",f.manifest);
    const dossierPath=privateJson(dir,"dossiers.json",
      document(f.scope,[packet(f.caseA)]));
    const exclusionPath=privateJson(dir,"excluded.json",{
      schema_version:1,excluded_wallets:[{
        address:PAYER_B,reason:"marketplace_probe",
        evidence_reference:"private_marketplace_inventory"
      }]
    });
    const baseline=[f.first.journal_path,f.second.journal_path,
      dossierPath,exclusionPath].map(filename=>fs.readFileSync(filename,"utf8"));
    const binary=path.join(__dirname,"buyer-provenance-preflight.js");
    const run=spawnSync(process.execPath,[
      binary,manifestPath,dossierPath,exclusionPath
    ],{encoding:"utf8",env:{...process.env,X402_REVIEW_HMAC_KEY:KEY}});
    assert.equal(run.status,0,run.stderr);
    const parsed=JSON.parse(run.stdout);
    assert.equal(parsed.complete_reference_catalogs_not_verified,1);
    assert.equal(parsed.operator_declared_non_external_wallet_cases,1);
    assert.equal(parsed.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(parsed.product_025_unlock_evidence,false);
    for(const value of [A,B,C,PAYER_A,PAYER_B,KEY,dir,
      "private_buyer_independence_wallet","operator_record_0001",
      "separate_reviewer_0001","private_marketplace_inventory"]) {
      assert.equal(run.stdout.includes(value),false);
    }
    assert.deepEqual([f.first.journal_path,f.second.journal_path,
      dossierPath,exclusionPath].map(filename=>fs.readFileSync(filename,"utf8")),
      baseline);
    const fail=spawnSync(process.execPath,[binary,manifestPath,dossierPath],{
      encoding:"utf8",env:{...process.env,X402_REVIEW_HMAC_KEY:""}
    });
    assert.equal(fail.status,1);
    assert.equal(fail.stderr.includes(dir),false);
    assert.equal(fail.stderr.includes(A),false);
    assert.equal(fail.stderr.includes(KEY),false);
  }));

test("case and transaction IDs never become independently certified by attestation references", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const all=buildProvenancePreflight(f.manifest,{
      keyHex:KEY,dossier:document(f.scope,[
        packet(f.caseA),packet(f.caseB)
      ])
    });
    assert.equal(all.complete_reference_catalogs_not_verified,2);
    assert.equal(all.missing_reference_items,0);
    assert.equal(all.source_references_independently_examined,false);
    assert.equal(all.reviewer_identity_independently_authenticated,false);
    assert.equal(all.current_chain_reverified,false);
    assert.equal(all.independently_verified_external_buyers,0);
    assert.equal(all.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(all.product_025_unlock_evidence,false);
    assert.ok(all.cases.every(item=>item.independent_buyer_verified===false));
    assert.ok(all.cases.every(item=>item.eligible_revenue_atomic_usdc==="0"));
  }));
