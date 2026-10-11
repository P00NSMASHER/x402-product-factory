"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {GENESIS, seal} = require("./settlement-ledger");
const {CHAIN, USDC, RECEIVER} = require("./reconcile-settlements");
const {scopeIdentifier} = require("./buyer-provenance-preflight");
const {hmacKey, pseudonym} = require("./buyer-review-queue");
const {
  MAX_CLAIMS, canonicalClaim, messageForClaim, validateSignedClaims,
  validateSigner, loadPrivateSignedClaims, loadPrivateSigner, auditSignedDelivery
} = require("./signed-delivery-audit");

const HMAC = "ba".repeat(32);
const TX_A = "0x" + "a".repeat(64);
const TX_B = "0x" + "b".repeat(64);
const TX_C = "0x" + "c".repeat(64);
const TX_D = "0x" + "d".repeat(64);
const PAYER_A = "0x" + "1".repeat(40);
const PAYER_B = "0x" + "2".repeat(40);
const BLOCK = "0x" + "3".repeat(64);
const ISSUER = "delivery_logger_01";
const ROUTE_A = "/api/domain-rdap";
const ROUTE_B = "/api/sec-filings";
const DATA_HASH = crypto.createHash("sha256")
  .update('{"answer":"generated"}').digest("hex");

function inPrivateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x402-signed-delivery-"));
  fs.chmodSync(dir, 0o700);
  try { return fn(dir); }
  finally { fs.rmSync(dir, {recursive:true,force:true}); }
}
function row(transaction, {payer=PAYER_A,route=ROUTE_A,confirmations="29"}={}) {
  return {
    schema_version:2, network:CHAIN, route, transaction,
    transaction_log_index:"2", payer, receiver:RECEIVER,
    token_contract:USDC, amount_atomic_usdc:"5000",
    block_number:"100", canonical_block_hash:BLOCK,
    confirmations_at_check:confirmations,
    evidence_source:"independent_base_rpc_receipt",
    observed_at:"2026-10-10T05:00:00.000Z",
    onchain_verified:true, external_buyer_verified:false,
    eligible_for_revenue_scoreboard:false
  };
}
function journal(dir,name,rows) {
  let previous=GENESIS;
  const records=rows.map((item,index)=>{
    const payload={
      schema_version:item.schema_version,sequence:index+1,
      previous_hash:previous,network:item.network,route:item.route,
      transaction:item.transaction,
      transaction_log_index:item.transaction_log_index,payer:item.payer,
      receiver:item.receiver,token_contract:item.token_contract,
      amount_atomic_usdc:item.amount_atomic_usdc,block_number:item.block_number,
      canonical_block_hash:item.canonical_block_hash,
      confirmations_at_check:item.confirmations_at_check,
      evidence_source:item.evidence_source,observed_at:item.observed_at,
      onchain_verified:item.onchain_verified,
      external_buyer_verified:item.external_buyer_verified,
      eligible_for_revenue_scoreboard:item.eligible_for_revenue_scoreboard
    };
    const sealed=seal(payload);
    previous=sealed.hash;
    return sealed;
  });
  const filename=path.join(dir,name);
  fs.writeFileSync(filename,
    records.map(x=>JSON.stringify(x)+"\n").join(""),{mode:0o600});
  fs.chmodSync(filename,0o600);
  return {journal_path:filename,expected_head:previous,expected_records:rows.length};
}
function privateJson(dir,name,doc) {
  const filename=path.join(dir,name);
  fs.writeFileSync(filename,JSON.stringify(doc),{mode:0o600});
  fs.chmodSync(filename,0o600);
  return filename;
}
function signerKeys(type="ed25519") {
  const {privateKey,publicKey} = crypto.generateKeyPairSync(type,
    type==="rsa" ? {modulusLength:2048} : undefined);
  const der=publicKey.export({format:"der",type:"spki"});
  return {
    privateKey,
    signer:{schema_version:1,issuer_id:ISSUER,spki_der_base64:der.toString("base64")},
    fingerprint:crypto.createHash("sha256").update(der).digest("hex")
  };
}
function makeClaim(transaction=TX_A,payer=PAYER_A,route=ROUTE_A,requestId="a".repeat(32)) {
  return {
    schema_version:1,
    issuer_id:ISSUER,
    network:CHAIN,
    transaction,
    payer,
    route,
    request_id:requestId,
    response_status:200,
    response_body_sha256:DATA_HASH,
    response_stream_completed_at:"2026-10-10T05:00:00.000Z",
    transport_observation:"server_response_stream_completed"
  };
}
function signed(claim,privateKey) {
  return {
    claim,
    signature_base64:crypto.sign(null,messageForClaim(claim),privateKey)
      .toString("base64")
  };
}
function doc(scope, claims=[]) {
  return {schema_version:1,journal_scope_id:scope,signed_claims:claims};
}
function fixture(dir) {
  const one=journal(dir,"one.jsonl",[row(TX_A),row(TX_B,{route:ROUTE_B})]);
  const two=journal(dir,"two.jsonl",[
    row(TX_A,{confirmations:"45"}),row(TX_C,{payer:PAYER_B})
  ]);
  const manifest={schema_version:1,journals:[one,two]};
  const key=signerKeys();
  return {dir,one,two,manifest,scope:scopeIdentifier(manifest,HMAC),...key};
}
function audit(f, claims, extra={}) {
  return auditSignedDelivery(f.manifest,{
    keyHex:HMAC,
    signer:f.signer,
    expectedFingerprint:f.fingerprint,
    signedClaims:doc(f.scope,claims),
    ...extra
  });
}

test("signed server response is cryptographically checked but never treated as customer delivery",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const report=audit(f,[signed(makeClaim(),f.privateKey)]);
    assert.equal(report.report_type,
      "signed_server_delivery_claims_not_client_receipts_or_sales");
    assert.equal(report.journal_scope_id,f.scope);
    assert.equal(report.externally_supplied_key_fingerprint_matched,true);
    assert.equal(report.signer_control_independently_authenticated,false);
    assert.equal(report.signed_claims_cryptographically_valid,1);
    assert.equal(report.uncontested_transfer_evidence_not_sales,3);
    assert.equal(report.signed_claims_for_wallets_requiring_review,1);
    assert.equal(report.missing_signed_server_delivery_claims,2);
    const txid=pseudonym(hmacKey(HMAC),"cross-journal-transaction",CHAIN+":"+TX_A);
    const match=report.cases.find(x=>x.transaction_case_id===txid);
    assert.equal(match.status,
      "signed_server_delivery_claim_independent_review_required");
    assert.equal(match.signed_claim_integrity_verified,true);
    assert.equal(match.client_receipt_independently_confirmed,false);
    assert.equal(report.actual_response_body_independently_compared,false);
    assert.equal(report.actual_client_receipt_independently_confirmed,false);
    assert.equal(report.current_chain_reverified,false);
    assert.equal(report.independently_verified_external_buyers,0);
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(report.product_025_unlock_evidence,false);
    const printed=JSON.stringify(report);
    for(const secret of [TX_A,TX_B,TX_C,PAYER_A,PAYER_B,HMAC,DATA_HASH,dir]){
      assert.equal(printed.includes(secret),false);
    }
  }));

test("all unique transactions can have signed claims without promoting revenue",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const claims=[
      signed(makeClaim(TX_A,PAYER_A,ROUTE_A,"a".repeat(32)),f.privateKey),
      signed(makeClaim(TX_B,PAYER_A,ROUTE_B,"b".repeat(32)),f.privateKey),
      signed(makeClaim(TX_C,PAYER_B,ROUTE_A,"c".repeat(32)),f.privateKey)
    ];
    const report=audit(f,claims);
    assert.equal(report.signed_claims_cryptographically_valid,3);
    assert.equal(report.uncontested_transfer_evidence_not_sales,3);
    assert.equal(report.missing_signed_server_delivery_claims,0);
    assert.equal(report.cases.length,3);
    assert.ok(report.cases.every(x=>x.signed_claim_integrity_verified===true));
    assert.ok(report.cases.every(x=>x.eligible_revenue_atomic_usdc==="0"));
    assert.equal(report.independently_verified_external_buyers,0);
    assert.equal(report.product_025_unlock_evidence,false);
  }));

test("no signed records means exactly zero observed delivery claims",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const report=audit(f,[]);
    assert.equal(report.signed_claims_cryptographically_valid,0);
    assert.equal(report.missing_signed_server_delivery_claims,3);
    assert.ok(report.cases.every(x=>
      x.status==="missing_signed_server_delivery_claim"));
    assert.ok(report.cases.every(x=>x.signed_claim_integrity_verified===false));
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
  }));

test("mutating any signed field after signing invalidates the attestation",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const receipt=signed(makeClaim(),f.privateKey);
    for(const field of ["response_body_sha256","request_id","response_stream_completed_at"]){
      const tampered={...receipt,claim:{...receipt.claim}};
      tampered.claim[field]=field==="response_body_sha256"
        ? "f".repeat(64)
        : field==="request_id" ? "d".repeat(32) : "2026-10-10T05:01:00.000Z";
      assert.throws(()=>audit(f,[tampered]),/DELIVERY_SIGNATURE_VERIFICATION_FAILED/);
    }
    const altered={...receipt,signature_base64:Buffer.alloc(64,4).toString("base64")};
    assert.throws(()=>audit(f,[altered]),/DELIVERY_SIGNATURE_VERIFICATION_FAILED/);
  }));

test("forged signer or wrong out-of-band public key fingerprint fails closed",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const attacker=signerKeys();
    const genuine=signed(makeClaim(),f.privateKey);
    assert.throws(()=>audit(f,[genuine],{
      expectedFingerprint:attacker.fingerprint
    }),/DELIVERY_SIGNER_FINGERPRINT_MISMATCH/);
    assert.throws(()=>audit(f,[
      signed(makeClaim(),attacker.privateKey)
    ]),/DELIVERY_SIGNATURE_VERIFICATION_FAILED/);
    assert.throws(()=>audit(f,[genuine],{
      signer:attacker.signer
    }),/DELIVERY_SIGNER_FINGERPRINT_MISMATCH/);
    assert.throws(()=>audit(f,[genuine],{
      expectedFingerprint:undefined
    }),/DELIVERY_SIGNER_NOT_PINNED/);
    const rsa=signerKeys("rsa");
    assert.throws(()=>audit(f,[genuine],{
      signer:rsa.signer,expectedFingerprint:rsa.fingerprint
    }),/DELIVERY_PUBLIC_KEY_MUST_BE_CANONICAL_ED25519/);
  }));

test("valid signature cannot switch payer or canonical product route",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    assert.throws(()=>audit(f,[signed(
      makeClaim(TX_A,PAYER_B,ROUTE_A),f.privateKey
    )]),/DELIVERY_TRANSACTION_WALLET_ROUTE_MISMATCH/);
    assert.throws(()=>audit(f,[signed(
      makeClaim(TX_A,PAYER_A,ROUTE_B),f.privateKey
    )]),/DELIVERY_TRANSACTION_WALLET_ROUTE_MISMATCH/);
  }));

test("unknown transaction and quarantined conflicting evidence are both blocked",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    assert.throws(()=>audit(f,[signed(
      makeClaim(TX_D),f.privateKey
    )]),/DELIVERY_TRANSACTION_NOT_UNCONTESTED_IN_SCOPE/);
    const j1=journal(dir,"conflict-one.jsonl",[row(TX_A)]);
    const j2=journal(dir,"conflict-two.jsonl",[
      row(TX_A,{payer:PAYER_B,route:ROUTE_B})
    ]);
    const conflictManifest={schema_version:1,journals:[j1,j2]};
    assert.throws(()=>auditSignedDelivery(conflictManifest,{
      keyHex:HMAC,signer:f.signer,expectedFingerprint:f.fingerprint,
      signedClaims:doc(scopeIdentifier(conflictManifest,HMAC),[
        signed(makeClaim(TX_A),f.privateKey)
      ])
    }),/DELIVERY_TRANSACTION_NOT_UNCONTESTED_IN_SCOPE/);
    const noClaims=auditSignedDelivery(conflictManifest,{
      keyHex:HMAC,signer:f.signer,expectedFingerprint:f.fingerprint,
      signedClaims:doc(scopeIdentifier(conflictManifest,HMAC))
    });
    assert.equal(noClaims.conflicting_transactions_quarantined,1);
    assert.equal(noClaims.uncontested_transfer_evidence_not_sales,0);
    assert.equal(noClaims.eligible_external_revenue_atomic_usdc,"0");
  }));

test("duplicate signed receipts for one payment cannot inflate delivery signals",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const first=signed(makeClaim(TX_A,PAYER_A,ROUTE_A,"a".repeat(32)),f.privateKey);
    assert.throws(()=>audit(f,[first,first]),
      /DELIVERY_DUPLICATE_TRANSACTION_CLAIM/);
    const another=signed(makeClaim(TX_A,PAYER_A,ROUTE_A,"f".repeat(32)),
      f.privateKey);
    assert.throws(()=>audit(f,[first,another]),
      /DELIVERY_DUPLICATE_TRANSACTION_CLAIM/);
  }));

test("reused request ID across different transactions fails even with valid signatures",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const claims=[
      signed(makeClaim(TX_A,PAYER_A,ROUTE_A,"a".repeat(32)),f.privateKey),
      signed(makeClaim(TX_B,PAYER_A,ROUTE_B,"a".repeat(32)),f.privateKey)
    ];
    assert.throws(()=>audit(f,claims),/DELIVERY_REQUEST_ID_REUSED/);
  }));

test("negative operator-wallet exclusions still apply to authentic signed claims",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const exclusions=[{
      address:PAYER_A,reason:"operator_controlled",
      evidence_reference:"operator_wallet_inventory_20261010"
    }];
    const report=audit(f,[signed(makeClaim(),f.privateKey)],{exclusions});
    assert.equal(report.signed_claims_for_wallets_requiring_review,0);
    assert.equal(report.signed_claims_for_operator_declared_non_external_wallets,1);
    const excluded=report.cases.find(x=>
      x.wallet_case_id===pseudonym(hmacKey(HMAC),"wallet",PAYER_A) &&
      x.signed_claim_integrity_verified);
    assert.equal(excluded.status,"operator_declared_non_external");
    assert.equal(excluded.eligible_revenue_atomic_usdc,"0");
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(report.product_025_unlock_evidence,false);
  }));

test("journal checkpoint rollbacks and journal-scope mismatch both fail",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const entry=signed(makeClaim(),f.privateKey);
    assert.throws(()=>audit(f,[entry],{
      signedClaims:doc("8".repeat(64),[entry])
    }),/DELIVERY_JOURNAL_SCOPE_MISMATCH/);
    const stale={
      schema_version:1,
      journals:[{...f.one,expected_head:GENESIS},f.two]
    };
    assert.throws(()=>auditSignedDelivery(stale,{
      keyHex:HMAC,signer:f.signer,expectedFingerprint:f.fingerprint,
      signedClaims:doc(f.scope,[entry])
    }),/LEDGER_CHECKPOINT_MISMATCH/);
    assert.notEqual(scopeIdentifier({schema_version:1,
      journals:[f.two,f.one]},HMAC),f.scope);
  }));

test("strict signed-claim validation rejects malformed or impossible service outcomes",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const valid=makeClaim();
    for(const change of [
      {response_status:202},
      {response_status:500},
      {transport_observation:"response_constructed"},
      {response_stream_completed_at:"2026-02-30T05:00:00.000Z"},
      {response_stream_completed_at:"2026-10-10T05:00:00+00:00"},
      {request_id:"a"},
      {transaction:TX_A.toUpperCase()},
      {payer:PAYER_A.toUpperCase()},
      {route:"/api/noncanonical"},
      {response_body_sha256:"0".repeat(64)},
      {schema_version:2},
      {approved_external_buyer:true},
      {issuer_id:"__proto__"}
    ]) {
      assert.throws(()=>canonicalClaim({...valid,...change}),
        /DELIVERY_CLAIM_SCHEMA_INVALID/);
    }
    const receipt=signed(valid,f.privateKey);
    assert.throws(()=>validateSignedClaims({
      ...doc(f.scope,[receipt]),eligible_revenue_atomic_usdc:"999"
    }),/DELIVERY_SIGNED_CLAIMS_DOCUMENT_INVALID/);
    assert.throws(()=>validateSignedClaims(doc(f.scope,Array(MAX_CLAIMS+1).fill(receipt))),
      /DELIVERY_SIGNED_CLAIMS_DOCUMENT_INVALID/);
    assert.throws(()=>validateSignedClaims(doc(f.scope,[{
      claim:valid,signature_base64:"aaaa"
    }])),/DELIVERY_SIGNATURE_LENGTH_INVALID/);
    assert.throws(()=>validateSignedClaims(doc(f.scope,[{
      claim:valid,signature_base64:"not canonical***"
    }])),/DELIVERY_BASE64_INVALID/);
    assert.throws(()=>validateSignedClaims(doc(f.scope,[{
      claim:valid,signature_base64:receipt.signature_base64,client_verified:true
    }])),/DELIVERY_SIGNED_ENTRY_INVALID/);
  }));

test("signature canonicalization is invariant to arbitrary JSON key ordering",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const normal=makeClaim();
    const reverse=Object.fromEntries(Object.entries(normal).reverse());
    assert.deepEqual(messageForClaim(normal),messageForClaim(reverse));
    const receipt=signed(normal,f.privateKey);
    const result=audit(f,[{claim:reverse,signature_base64:receipt.signature_base64}]);
    assert.equal(result.signed_claims_cryptographically_valid,1);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
  }));

test("private signed claims and public key files refuse unsafe permissions and links",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const signedFile=privateJson(dir,"claims.json",doc(f.scope,[]));
    const signerFile=privateJson(dir,"signer.json",f.signer);
    assert.deepEqual(loadPrivateSignedClaims(signedFile),doc(f.scope,[]));
    assert.equal(loadPrivateSigner(signerFile,f.fingerprint).issuer_id,ISSUER);
    fs.chmodSync(signedFile,0o644);
    assert.throws(()=>loadPrivateSignedClaims(signedFile),/LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(signedFile,0o600);
    const link=path.join(dir,"link.json");
    fs.symlinkSync(signedFile,link);
    assert.throws(()=>loadPrivateSignedClaims(link),/LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(signerFile,0o644);
    assert.throws(()=>loadPrivateSigner(signerFile,f.fingerprint),
      /LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(signerFile,0o600);
    assert.throws(()=>loadPrivateSigner(signerFile,"1".repeat(64)),
      /DELIVERY_SIGNER_FINGERPRINT_MISMATCH/);
    assert.throws(()=>loadPrivateSignedClaims(path.join(dir,"missing.json")),
      /DELIVERY_CLAIMS_FILE_MISSING/);
  }));

test("CLI validates key pin, emits no raw wallet or receipt data, and is read-only",()=>
  inPrivateDir(dir=>{
    const f=fixture(dir);
    const manifestPath=privateJson(dir,"manifest.json",f.manifest);
    const claimsPath=privateJson(dir,"claims.json",doc(f.scope,[
      signed(makeClaim(),f.privateKey)
    ]));
    const signerPath=privateJson(dir,"signer.json",f.signer);
    const filenames=[manifestPath,claimsPath,signerPath,
      f.one.journal_path,f.two.journal_path];
    const before=filenames.map(x=>fs.readFileSync(x,"utf8"));
    const binary=path.join(__dirname,"signed-delivery-audit.js");
    const env={...process.env,
      X402_REVIEW_HMAC_KEY:HMAC, X402_DELIVERY_KEY_SHA256:f.fingerprint};
    const executed=spawnSync(process.execPath,[
      binary,manifestPath,claimsPath,signerPath
    ],{encoding:"utf8",env});
    assert.equal(executed.status,0,executed.stderr);
    const output=JSON.parse(executed.stdout);
    assert.equal(output.signed_claims_cryptographically_valid,1);
    assert.equal(output.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(output.product_025_unlock_evidence,false);
    for(const secret of [TX_A,TX_B,TX_C,PAYER_A,PAYER_B,HMAC,dir,DATA_HASH,
      f.signer.spki_der_base64]) {
      assert.equal(executed.stdout.includes(secret),false);
    }
    assert.deepEqual(filenames.map(x=>fs.readFileSync(x,"utf8")),before);
    const noPin=spawnSync(process.execPath,[
      binary,manifestPath,claimsPath,signerPath
    ],{encoding:"utf8",env:{...env,X402_DELIVERY_KEY_SHA256:""}});
    assert.equal(noPin.status,1);
    assert.equal(noPin.stderr.includes(TX_A),false);
    assert.equal(noPin.stderr.includes(dir),false);
    assert.equal(noPin.stderr.includes(HMAC),false);
  }));
