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
const {pseudonym, hmacKey} = require("./buyer-review-queue");
const {messageForClaim} = require("./signed-delivery-audit");
const {
  canonicalClientClaim, messageForClientClaim, validateClientReceipts,
  loadPrivateClientReceipts, equalResponseIdentity, auditClientReceipts
} = require("./client-receipt-audit");

const HMAC = "ba".repeat(32);
const TX_A = "0x" + "a".repeat(64);
const TX_B = "0x" + "b".repeat(64);
const TX_C = "0x" + "c".repeat(64);
const TX_D = "0x" + "d".repeat(64);
const PAYER_A = "0x" + "1".repeat(40);
const PAYER_B = "0x" + "2".repeat(40);
const BLOCK = "0x" + "3".repeat(64);
const DATA_HASH = crypto.createHash("sha256").update('{"answer":"synthetic"}').digest("hex");
const SERVER_ID = "server_delivery_01";
const CLIENT_ID = "client_observer_01";
const ROUTE_A = "/api/domain-rdap";
const ROUTE_B = "/api/sec-filings";
const SCOPE = "not-used";

function inPrivateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x402-dual-attestation-"));
  fs.chmodSync(dir,0o700);
  try { return fn(dir); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
function journalRow(transaction,{payer=PAYER_A,route=ROUTE_A,confirmations="29"}={}) {
  return {
    schema_version:2,network:CHAIN,route,transaction,
    transaction_log_index:"2",payer,receiver:RECEIVER,token_contract:USDC,
    amount_atomic_usdc:"5000",block_number:"100",canonical_block_hash:BLOCK,
    confirmations_at_check:confirmations,
    evidence_source:"independent_base_rpc_receipt",
    observed_at:"2026-10-10T05:00:00.000Z",
    onchain_verified:true,external_buyer_verified:false,
    eligible_for_revenue_scoreboard:false
  };
}
function journal(dir,name,rows) {
  let previous=GENESIS;
  const saved=rows.map((row,index)=>{
    const item={
      schema_version:row.schema_version,sequence:index+1,
      previous_hash:previous,network:row.network,route:row.route,
      transaction:row.transaction,transaction_log_index:row.transaction_log_index,
      payer:row.payer,receiver:row.receiver,token_contract:row.token_contract,
      amount_atomic_usdc:row.amount_atomic_usdc,block_number:row.block_number,
      canonical_block_hash:row.canonical_block_hash,
      confirmations_at_check:row.confirmations_at_check,
      evidence_source:row.evidence_source,observed_at:row.observed_at,
      onchain_verified:row.onchain_verified,
      external_buyer_verified:row.external_buyer_verified,
      eligible_for_revenue_scoreboard:row.eligible_for_revenue_scoreboard
    };
    const sealed=seal(item);
    previous=sealed.hash;
    return sealed;
  });
  const filename=path.join(dir,name);
  fs.writeFileSync(filename,saved.map(x=>JSON.stringify(x)+"\n").join(""),{mode:0o600});
  fs.chmodSync(filename,0o600);
  return {journal_path:filename,expected_head:previous,expected_records:saved.length};
}
function keyPair(issuer) {
  const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
  const der=publicKey.export({format:"der",type:"spki"});
  return {
    privateKey,signer:{
      schema_version:1,issuer_id:issuer,spki_der_base64:der.toString("base64")
    },
    fingerprint:crypto.createHash("sha256").update(der).digest("hex")
  };
}
function serverClaim(tx=TX_A,payer=PAYER_A,route=ROUTE_A,request="a".repeat(32)) {
  return {
    schema_version:1,issuer_id:SERVER_ID,network:CHAIN,transaction:tx,payer,
    route,request_id:request,response_status:200,response_body_sha256:DATA_HASH,
    response_stream_completed_at:"2026-10-10T05:00:00.000Z",
    transport_observation:"server_response_stream_completed"
  };
}
function clientClaim(tx=TX_A,payer=PAYER_A,route=ROUTE_A,request="a".repeat(32)) {
  return {
    schema_version:1,issuer_id:CLIENT_ID,network:CHAIN,transaction:tx,payer,
    route,request_id:request,response_status:200,response_body_sha256:DATA_HASH,
    client_received_at:"2026-10-10T05:00:03.000Z",
    client_observation:"full_response_body_received"
  };
}
function sign(claim,key,message) {
  return {
    claim,
    signature_base64:crypto.sign(null,message(claim),key).toString("base64")
  };
}
function docs(f,server=[],client=[]) {
  return {
    serverClaims:{schema_version:1,journal_scope_id:f.scope,signed_claims:server},
    clientReceipts:{schema_version:1,journal_scope_id:f.scope,signed_receipts:client}
  };
}
function setup(dir){
  const first=journal(dir,"first.jsonl",[
    journalRow(TX_A),journalRow(TX_B,{route:ROUTE_B})
  ]);
  const second=journal(dir,"second.jsonl",[
    journalRow(TX_A,{confirmations:"33"}),journalRow(TX_C,{payer:PAYER_B})
  ]);
  const manifest={schema_version:1,journals:[first,second]};
  const scope=scopeIdentifier(manifest,HMAC);
  return {dir,first,second,manifest,scope,server:keyPair(SERVER_ID),client:keyPair(CLIENT_ID)};
}
function serverSign(f,claim){return sign(claim,f.server.privateKey,messageForClaim);}
function clientSign(f,claim){return sign(claim,f.client.privateKey,messageForClientClaim);}
function audit(f,server=[],client=[],extra={}){
  return auditClientReceipts(f.manifest,{
    keyHex:HMAC,
    serverSigner:f.server.signer,
    serverFingerprint:f.server.fingerprint,
    clientSigner:f.client.signer,
    clientFingerprint:f.client.fingerprint,
    ...docs(f,server,client),
    ...extra
  });
}
function privateJson(dir,name,data){
  const file=path.join(dir,name);
  fs.writeFileSync(file,JSON.stringify(data),{mode:0o600});
  fs.chmodSync(file,0o600);
  return file;
}

test("matching client and server signatures are correlated but never become verified sales",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const report=audit(f,
      [serverSign(f,serverClaim())],
      [clientSign(f,clientClaim())]);
    assert.equal(report.report_type,
      "dual_signed_client_acknowledgments_not_verified_buyers_or_sales");
    assert.equal(report.authenticated_server_claims,1);
    assert.equal(report.valid_client_acknowledgment_signatures,1);
    assert.equal(report.uncontested_transfer_evidence_not_sales,3);
    assert.equal(report.matched_client_signatures_requiring_review,1);
    assert.equal(report.server_claims_missing_client_acknowledgment,0);
    assert.equal(report.transactions_missing_server_claim,2);
    assert.equal(report.both_out_of_band_fingerprints_matched,true);
    assert.equal(report.distinct_signer_public_keys_and_issuer_labels,true);
    assert.equal(report.independent_issuer_ownership_verified,false);
    assert.equal(report.actual_client_delivery_independently_proven,false);
    assert.equal(report.client_recipient_identity_independently_verified,false);
    assert.equal(report.response_body_bytes_independently_compared,false);
    assert.equal(report.current_chain_reverified,false);
    assert.equal(report.independently_verified_external_buyers,0);
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(report.product_025_unlock_evidence,false);
    const id=pseudonym(hmacKey(HMAC),"cross-journal-transaction",CHAIN+":"+TX_A);
    const matched=report.cases.find(x=>x.transaction_case_id===id);
    assert.equal(matched.status,"matched_signatures_independent_review_required");
    assert.equal(matched.server_signature_verified,true);
    assert.equal(matched.client_signature_matched,true);
    assert.equal(matched.actual_client_delivery_independently_proven,false);
    const output=JSON.stringify(report);
    for(const sensitive of [TX_A,TX_B,TX_C,PAYER_A,PAYER_B,HMAC,DATA_HASH,dir,
      f.server.signer.spki_der_base64,f.client.signer.spki_der_base64]){
      assert.equal(output.includes(sensitive),false);
    }
  }));

test("server-only, missing-server and empty client sets remain explicitly unresolved",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const report=audit(f,[serverSign(f,serverClaim())],[]);
    assert.equal(report.authenticated_server_claims,1);
    assert.equal(report.valid_client_acknowledgment_signatures,0);
    assert.equal(report.server_claims_missing_client_acknowledgment,1);
    assert.equal(report.transactions_missing_server_claim,2);
    assert.equal(report.cases.filter(x=>
      x.status==="server_claim_only_missing_client_receipt").length,1);
    assert.equal(report.cases.filter(x=>
      x.status==="missing_authenticated_server_claim").length,2);
    const none=audit(f,[],[]);
    assert.equal(none.authenticated_server_claims,0);
    assert.equal(none.valid_client_acknowledgment_signatures,0);
    assert.equal(none.transactions_missing_server_claim,3);
    assert.equal(none.eligible_external_revenue_atomic_usdc,"0");
  }));

test("three fully signed synthetic receipts stay below commercial verification",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const a=serverClaim();
    const b=serverClaim(TX_B,PAYER_A,ROUTE_B,"b".repeat(32));
    const c=serverClaim(TX_C,PAYER_B,ROUTE_A,"c".repeat(32));
    const report=audit(f,[a,b,c].map(x=>serverSign(f,x)),[
      clientClaim(),clientClaim(TX_B,PAYER_A,ROUTE_B,"b".repeat(32)),
      clientClaim(TX_C,PAYER_B,ROUTE_A,"c".repeat(32))
    ].map(x=>clientSign(f,x)));
    assert.equal(report.authenticated_server_claims,3);
    assert.equal(report.valid_client_acknowledgment_signatures,3);
    assert.equal(report.matched_client_signatures_requiring_review,3);
    assert.equal(report.server_claims_missing_client_acknowledgment,0);
    assert.equal(report.transactions_missing_server_claim,0);
    assert.equal(report.independently_verified_external_buyers,0);
    assert.equal(report.product_025_unlock_evidence,false);
    assert.ok(report.cases.every(x=>x.eligible_revenue_atomic_usdc==="0"));
  }));

test("modifying signed client receipt bytes or signature after signing is rejected",()=>
  inPrivateDir(dir=>{
    const f=setup(dir),s=serverSign(f,serverClaim());
    const genuine=clientSign(f,clientClaim());
    for(const mutation of [
      {response_body_sha256:"f".repeat(64)},
      {client_received_at:"2026-10-10T05:01:00.000Z"},
      {request_id:"e".repeat(32)}
    ]){
      assert.throws(()=>audit(f,[s],[{
        ...genuine,claim:{...genuine.claim,...mutation}
      }]),/CLIENT_RECEIPT_SIGNATURE_INVALID/);
    }
    assert.throws(()=>audit(f,[s],[{
      ...genuine,signature_base64:Buffer.alloc(64,1).toString("base64")
    }]),/CLIENT_RECEIPT_SIGNATURE_INVALID/);
  }));

test("attacker-controlled client key and false out-of-band pin fail",()=>
  inPrivateDir(dir=>{
    const f=setup(dir),attacker=keyPair(CLIENT_ID);
    const server=serverSign(f,serverClaim());
    const receipt=clientSign(f,clientClaim());
    assert.throws(()=>audit(f,[server],[receipt],{
      clientFingerprint:attacker.fingerprint
    }),/DELIVERY_SIGNER_FINGERPRINT_MISMATCH/);
    assert.throws(()=>audit(f,[server],[receipt],{
      clientSigner:attacker.signer
    }),/DELIVERY_SIGNER_FINGERPRINT_MISMATCH/);
    assert.throws(()=>audit(f,[server],[
      sign(clientClaim(),attacker.privateKey,messageForClientClaim)
    ]),/CLIENT_RECEIPT_SIGNATURE_INVALID/);
    assert.throws(()=>audit(f,[server],[receipt],{
      clientFingerprint:""
    }),/DELIVERY_SIGNER_NOT_PINNED/);
  }));

test("identical signer key or issuer label is rejected, even with valid signatures",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const s=serverSign(f,serverClaim()),r=clientSign(f,clientClaim());
    assert.throws(()=>audit(f,[s],[r],{
      clientSigner:f.server.signer,
      clientFingerprint:f.server.fingerprint
    }),/CLIENT_RECEIPT_SIGNER_NOT_DISTINCT/);
    const sharedName={
      ...f.client.signer,issuer_id:SERVER_ID
    };
    assert.throws(()=>audit(f,[s],[r],{
      clientSigner:sharedName
    }),/CLIENT_RECEIPT_SIGNER_NOT_DISTINCT/);
  }));

test("signed wallet, route, request ID, response digest and status must all agree",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const s=serverSign(f,serverClaim());
    for(const mutation of [
      {payer:PAYER_B},
      {route:ROUTE_B},
      {request_id:"b".repeat(32)},
      {response_body_sha256:"f".repeat(64)}
    ]){
      assert.throws(()=>audit(f,[s],[
        clientSign(f,{...clientClaim(),...mutation})
      ]),/CLIENT_RECEIPT_SERVER_IDENTITY_MISMATCH/);
    }
    assert.equal(equalResponseIdentity(clientClaim(),serverClaim()),true);
    assert.equal(equalResponseIdentity({...clientClaim(),response_status:204},
      serverClaim()),false);
    assert.throws(()=>canonicalClientClaim({
      ...clientClaim(),response_status:204
    }),/CLIENT_RECEIPT_CLAIM_INVALID/);
  }));

test("client receipt without authenticated server completion cannot pass",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    assert.throws(()=>audit(f,[],[clientSign(f,clientClaim())]),
      /CLIENT_RECEIPT_AUTHENTICATED_SERVER_CLAIM_MISSING/);
    assert.throws(()=>audit(f,[serverSign(f,serverClaim())],[
      clientSign(f,clientClaim(TX_C,PAYER_B,ROUTE_A,"c".repeat(32)))
    ]),/CLIENT_RECEIPT_AUTHENTICATED_SERVER_CLAIM_MISSING/);
    assert.throws(()=>audit(f,[serverSign(f,serverClaim())],[
      clientSign(f,clientClaim(TX_D,PAYER_A,ROUTE_A,"d".repeat(32)))
    ]),/CLIENT_RECEIPT_AUTHENTICATED_SERVER_CLAIM_MISSING/);
  }));

test("conflicted settlement cannot be matched by two valid signatures",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const one=journal(dir,"conflict-one.jsonl",[journalRow(TX_A)]);
    const two=journal(dir,"conflict-two.jsonl",[
      journalRow(TX_A,{payer:PAYER_B,route:ROUTE_B})
    ]);
    const manifest={schema_version:1,journals:[one,two]};
    const scope=scopeIdentifier(manifest,HMAC);
    const result= auditClientReceipts(manifest,{
      keyHex:HMAC,serverSigner:f.server.signer,
      serverFingerprint:f.server.fingerprint,
      clientSigner:f.client.signer,
      clientFingerprint:f.client.fingerprint,
      serverClaims:{schema_version:1,journal_scope_id:scope,signed_claims:[]},
      clientReceipts:{schema_version:1,journal_scope_id:scope,signed_receipts:[]}
    });
    assert.equal(result.conflicting_transactions_quarantined,1);
    assert.equal(result.uncontested_transfer_evidence_not_sales,0);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
    assert.throws(()=>auditClientReceipts(manifest,{
      keyHex:HMAC,serverSigner:f.server.signer,
      serverFingerprint:f.server.fingerprint,
      clientSigner:f.client.signer,
      clientFingerprint:f.client.fingerprint,
      serverClaims:{schema_version:1,journal_scope_id:scope,
        signed_claims:[serverSign(f,serverClaim())]},
      clientReceipts:{schema_version:1,journal_scope_id:scope,
        signed_receipts:[clientSign(f,clientClaim())]}
    }),/DELIVERY_TRANSACTION_NOT_UNCONTESTED_IN_SCOPE/);
  }));

test("replayed transaction acknowledgments are rejected across one input batch",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const server=serverSign(f,serverClaim());
    const client=clientSign(f,clientClaim());
    assert.throws(()=>audit(f,[server],[client,client]),
      /CLIENT_RECEIPT_REPLAYED_TRANSACTION/);
    const diffClient=clientSign(f,{
      ...clientClaim(),client_received_at:"2026-10-10T05:00:04.000Z"
    });
    assert.throws(()=>audit(f,[server],[client,diffClient]),
      /CLIENT_RECEIPT_REPLAYED_TRANSACTION/);
  }));

test("operator-controlled wallet acknowledgment remains explicitly non-external",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const report=audit(f,[serverSign(f,serverClaim())],
      [clientSign(f,clientClaim())],{
        exclusions:[{
          address:PAYER_A,reason:"operator_controlled",
          evidence_reference:"private_operator_wallet_record"
        }]
      });
    assert.equal(report.matched_client_signatures_requiring_review,0);
    assert.equal(report.matched_operator_declared_non_external_signatures,1);
    assert.equal(report.cases.filter(x=>
      x.status==="operator_declared_non_external" &&
      x.client_signature_matched).length,1);
    assert.equal(report.independently_verified_external_buyers,0);
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
  }));

test("stale journal head, mismatched client scope or invalid server signature fail closed",()=>
  inPrivateDir(dir=>{
    const f=setup(dir),s=serverSign(f,serverClaim()),c=clientSign(f,clientClaim());
    const invalidClient={
      schema_version:1,journal_scope_id:"1".repeat(64),
      signed_receipts:[c]
    };
    assert.throws(()=>audit(f,[s],[c],{clientReceipts:invalidClient}),
      /CLIENT_RECEIPT_JOURNAL_SCOPE_MISMATCH/);
    assert.throws(()=>audit(f,[s],[c],{
      manifest:undefined,
      serverClaims:{
        schema_version:1,journal_scope_id:"2".repeat(64),signed_claims:[s]
      }
    }),/DELIVERY_JOURNAL_SCOPE_MISMATCH/);
    const changed={
      schema_version:1,
      journals:[{...f.first,expected_head:GENESIS},f.second]
    };
    assert.throws(()=>auditClientReceipts(changed,{
      keyHex:HMAC,serverSigner:f.server.signer,
      serverFingerprint:f.server.fingerprint,
      clientSigner:f.client.signer,
      clientFingerprint:f.client.fingerprint,
      ...docs(f,[s],[c])
    }),/LEDGER_CHECKPOINT_MISMATCH/);
    assert.throws(()=>audit(f,[{
      ...s,signature_base64:Buffer.alloc(64,2).toString("base64")
    }],[c]),/DELIVERY_SIGNATURE_VERIFICATION_FAILED/);
  }));

test("strict schema rejects optional approval flags and malformed client receipt fields",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const valid=clientClaim();
    for(const mutation of [
      {response_status:201},
      {transaction:TX_A.toUpperCase()},
      {payer:PAYER_A.toUpperCase()},
      {network:"eip155:1"},
      {route:"/api/nonexistent"},
      {request_id:"wrong"},
      {response_body_sha256:"0".repeat(64)},
      {client_received_at:"2026-02-30T05:00:00.000Z"},
      {client_received_at:"2026-10-10T05:00:00+00:00"},
      {client_observation:"response_started"},
      {issuer_id:"__proto__"},
      {eligible_external_revenue_atomic_usdc:"5000"}
    ]){
      assert.throws(()=>canonicalClientClaim({...valid,...mutation}),
        /CLIENT_RECEIPT_CLAIM_INVALID/);
    }
    const entry=clientSign(f,valid);
    assert.throws(()=>validateClientReceipts({
      ...docs(f,[],[entry]).clientReceipts,
      independently_verified_external_buyers:4
    }),/CLIENT_RECEIPT_DOCUMENT_INVALID/);
    assert.throws(()=>validateClientReceipts({
      schema_version:1,journal_scope_id:f.scope,
      signed_receipts:[{...entry,verified:true}]
    }),/CLIENT_RECEIPT_ENTRY_INVALID/);
    assert.throws(()=>validateClientReceipts({
      schema_version:1,journal_scope_id:f.scope,
      signed_receipts:[{...entry,signature_base64:"***"}]
    }),/DELIVERY_BASE64_INVALID/);
    const unordered=Object.fromEntries(Object.entries(valid).reverse());
    assert.deepEqual(messageForClientClaim(valid),messageForClientClaim(unordered));
    assert.notDeepEqual(messageForClientClaim(valid),
      messageForClaim(serverClaim()));
  }));

test("private input protections reject public permissions and symlinked receipts",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const source=privateJson(dir,"client.json",
      docs(f,[],[clientSign(f,clientClaim())]).clientReceipts);
    assert.equal(loadPrivateClientReceipts(source).signed_receipts.length,1);
    fs.chmodSync(source,0o644);
    assert.throws(()=>loadPrivateClientReceipts(source),
      /LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(source,0o600);
    const alias=path.join(dir,"alias.json");
    fs.symlinkSync(source,alias);
    assert.throws(()=>loadPrivateClientReceipts(alias),
      /LEDGER_FILE_NOT_PRIVATE/);
    assert.throws(()=>loadPrivateClientReceipts(path.join(dir,"absent.json")),
      /CLIENT_RECEIPT_FILE_MISSING/);
  }));

test("CLI validates two independent pins and never exposes raw evidence or mutates inputs",()=>
  inPrivateDir(dir=>{
    const f=setup(dir);
    const files=[
      privateJson(dir,"manifest.json",f.manifest),
      privateJson(dir,"server.json",docs(f,[
        serverSign(f,serverClaim())],[]).serverClaims),
      privateJson(dir,"server-signer.json",f.server.signer),
      privateJson(dir,"client.json",docs(f,[],[
        clientSign(f,clientClaim())]).clientReceipts),
      privateJson(dir,"client-signer.json",f.client.signer)
    ];
    const contents=files.concat([f.first.journal_path,f.second.journal_path])
      .map(filename=>fs.readFileSync(filename,"utf8"));
    const binary=path.join(__dirname,"client-receipt-audit.js");
    const env={...process.env,
      X402_REVIEW_HMAC_KEY:HMAC,
      X402_DELIVERY_KEY_SHA256:f.server.fingerprint,
      X402_CLIENT_KEY_SHA256:f.client.fingerprint};
    const ok=spawnSync(process.execPath,[binary,...files],{
      encoding:"utf8",env
    });
    assert.equal(ok.status,0,ok.stderr);
    const report=JSON.parse(ok.stdout);
    assert.equal(report.matched_client_signatures_requiring_review,1);
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
    for(const sensitive of [TX_A,TX_B,TX_C,PAYER_A,PAYER_B,HMAC,DATA_HASH,dir,
      f.server.signer.spki_der_base64,f.client.signer.spki_der_base64]){
      assert.equal(ok.stdout.includes(sensitive),false);
    }
    assert.deepEqual(files.concat([f.first.journal_path,f.second.journal_path])
      .map(filename=>fs.readFileSync(filename,"utf8")),contents);
    const bad=spawnSync(process.execPath,[binary,...files],{
      encoding:"utf8",env:{...env,X402_CLIENT_KEY_SHA256:""}
    });
    assert.equal(bad.status,1);
    assert.equal(bad.stderr.includes(dir),false);
    assert.equal(bad.stderr.includes(TX_A),false);
  }));
