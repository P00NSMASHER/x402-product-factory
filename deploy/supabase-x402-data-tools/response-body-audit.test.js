"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {spawnSync} = require("node:child_process");
const {seal, GENESIS} = require("./settlement-ledger");
const {CHAIN, USDC, RECEIVER} = require("./reconcile-settlements");
const {scopeIdentifier} = require("./buyer-provenance-preflight");
const {pseudonym, hmacKey} = require("./buyer-review-queue");
const {messageForClaim} = require("./signed-delivery-audit");
const {messageForClientClaim} = require("./client-receipt-audit");
const {
  MAX_CAPTURE_RECORDS, MAX_CAPTURE_FILE_BYTES,
  CAPTURE_KIND, validateCaptureManifest, loadPrivateCaptureManifest,
  readPrivateBodyDigest, readPrivateCaptureSnapshot, verifyCaptureSnapshots,
  auditResponseBodies
} = require("./response-body-audit");

const KEY = "8a".repeat(32);
const TX_A = "0x"+"a".repeat(64);
const TX_B = "0x"+"b".repeat(64);
const TX_C = "0x"+"c".repeat(64);
const WALLET_A = "0x"+"1".repeat(40);
const WALLET_B = "0x"+"2".repeat(40);
const BLOCK = "0x"+"f".repeat(64);
const ROUTE_A = "/api/domain-rdap";
const ROUTE_B = "/api/sec-filings";
const SERVER_ID = "server_receipt_01";
const CLIENT_ID = "client_receipt_01";
const RESPONSE_BYTES = Buffer.from('{"answer":"synthetic"}', "utf8");

function inPrivateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"x402-payload-audit-"));
  fs.chmodSync(dir,0o700);
  try { return fn(dir); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
function row(transaction, payer=WALLET_A, route=ROUTE_A, depth="29") {
  return {
    schema_version:2,network:CHAIN,route,transaction,
    transaction_log_index:"2",payer,receiver:RECEIVER,token_contract:USDC,
    amount_atomic_usdc:"5000",block_number:"100",canonical_block_hash:BLOCK,
    confirmations_at_check:depth,
    evidence_source:"independent_base_rpc_receipt",
    observed_at:"2026-10-10T05:00:00.000Z",
    onchain_verified:true,external_buyer_verified:false,
    eligible_for_revenue_scoreboard:false
  };
}
function writeJournal(dir,name,rows) {
  let prev=GENESIS;
  const entries=rows.map((r,i)=>{
    const p={
      schema_version:r.schema_version,sequence:i+1,previous_hash:prev,
      network:r.network,route:r.route,transaction:r.transaction,
      transaction_log_index:r.transaction_log_index,payer:r.payer,
      receiver:r.receiver,token_contract:r.token_contract,
      amount_atomic_usdc:r.amount_atomic_usdc,block_number:r.block_number,
      canonical_block_hash:r.canonical_block_hash,
      confirmations_at_check:r.confirmations_at_check,
      evidence_source:r.evidence_source,observed_at:r.observed_at,
      onchain_verified:r.onchain_verified,
      external_buyer_verified:r.external_buyer_verified,
      eligible_for_revenue_scoreboard:r.eligible_for_revenue_scoreboard
    };
    const signed=seal(p);
    prev=signed.hash;
    return signed;
  });
  const file=path.join(dir,name);
  fs.writeFileSync(file,entries.map(e=>JSON.stringify(e)+"\n").join(""),
    {mode:0o600});
  fs.chmodSync(file,0o600);
  return {journal_path:file,expected_head:prev,expected_records:rows.length};
}
function makeSigner(issuer) {
  const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
  const der=publicKey.export({format:"der",type:"spki"});
  return {
    privateKey,
    signer:{schema_version:1,issuer_id:issuer,spki_der_base64:der.toString("base64")},
    fingerprint:crypto.createHash("sha256").update(der).digest("hex")
  };
}
function serverClaim(tx=TX_A, payer=WALLET_A, route=ROUTE_A, requestId="a".repeat(32),body=RESPONSE_BYTES) {
  return {
    schema_version:1,issuer_id:SERVER_ID,network:CHAIN,transaction:tx,payer,route,
    request_id:requestId,response_status:200,
    response_body_sha256:crypto.createHash("sha256").update(body).digest("hex"),
    response_stream_completed_at:"2026-10-10T05:00:00.000Z",
    transport_observation:"server_response_stream_completed"
  };
}
function clientClaim(tx=TX_A,payer=WALLET_A,route=ROUTE_A,requestId="a".repeat(32),body=RESPONSE_BYTES) {
  return {
    schema_version:1,issuer_id:CLIENT_ID,network:CHAIN,transaction:tx,payer,route,
    request_id:requestId,response_status:200,
    response_body_sha256:crypto.createHash("sha256").update(body).digest("hex"),
    client_received_at:"2026-10-10T05:00:03.000Z",
    client_observation:"full_response_body_received"
  };
}
function sign(claim,privateKey,message) {
  return {
    claim,
    signature_base64:crypto.sign(null,message(claim),privateKey).toString("base64")
  };
}
function makeFixture(dir) {
  const one=writeJournal(dir,"one.jsonl",[
    row(TX_A),row(TX_B,WALLET_A,ROUTE_B)
  ]);
  const two=writeJournal(dir,"two.jsonl",[
    row(TX_A,WALLET_A,ROUTE_A,"35"),row(TX_C,WALLET_B)
  ]);
  const manifest={schema_version:1,journals:[one,two]};
  return {
    dir,one,two,manifest,scope:scopeIdentifier(manifest,KEY),
    server:makeSigner(SERVER_ID),client:makeSigner(CLIENT_ID)
  };
}
function captureCase(tx) {
  return pseudonym(hmacKey(KEY),"cross-journal-transaction",CHAIN+":"+tx);
}
function record(tx,file) {
  return {
    transaction_case_id:captureCase(tx),
    capture_kind:CAPTURE_KIND,
    body_file:file
  };
}
function captureDoc(f, records=[]) {
  return {schema_version:1,journal_scope_id:f.scope,captures:records};
}
function doc(f,servers=[],clients=[]) {
  return {
    serverClaims:{schema_version:1,journal_scope_id:f.scope,signed_claims:servers},
    clientReceipts:{schema_version:1,journal_scope_id:f.scope,signed_receipts:clients}
  };
}
function makePair(f,tx=TX_A,payer=WALLET_A,route=ROUTE_A,requestId="a".repeat(32),body=RESPONSE_BYTES) {
  return {
    server:sign(serverClaim(tx,payer,route,requestId,body),
      f.server.privateKey,messageForClaim),
    client:sign(clientClaim(tx,payer,route,requestId,body),
      f.client.privateKey,messageForClientClaim)
  };
}
function putFile(dir,name,bytes) {
  const file=path.join(dir,name);
  fs.writeFileSync(file,bytes,{mode:0o600});
  fs.chmodSync(file,0o600);
  return file;
}
function privateJson(dir,name,data) {
  return putFile(dir,name,Buffer.from(JSON.stringify(data),"utf8"));
}
function audit(f,pairs,captures,extra={}) {
  const source=doc(f,pairs.map(x=>x.server),pairs.map(x=>x.client));
  return auditResponseBodies(f.manifest,{
    keyHex:KEY,serverSigner:f.server.signer,
    serverFingerprint:f.server.fingerprint,
    clientSigner:f.client.signer,
    clientFingerprint:f.client.fingerprint,
    ...source,captureManifest:captureDoc(f,captures),...extra
  });
}

test("original client-captured bytes match two authenticated signatures and unique settlement",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const body=putFile(dir,"response.bin",RESPONSE_BYTES);
    const result=audit(f,[makePair(f)],[record(TX_A,body)]);
    assert.equal(result.scoped_uncontested_settlements_not_sales,3);
    assert.equal(result.signed_client_server_claim_pairs,1);
    assert.equal(result.private_capture_files_checked,1);
    assert.equal(result.private_capture_bytes_read,RESPONSE_BYTES.length);
    assert.equal(result.capture_digest_matches,1);
    assert.equal(result.capture_digest_mismatches_quarantined,0);
    assert.equal(result.signed_client_acknowledgments_missing_capture,0);
    assert.equal(result.actual_response_body_locally_compared_to_signed_hash,true);
    assert.equal(result.independent_capture_provenance_verified,false);
    assert.equal(result.original_client_receipt_independently_verified,false);
    assert.equal(result.independently_verified_external_buyers,0);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(result.product_025_unlock_evidence,false);
    const item=result.cases.find(x=>x.transaction_case_id===captureCase(TX_A));
    assert.equal(item.status,"private_body_digest_matches_signed_claims_review_required");
    assert.equal(item.private_body_locally_compared,true);
    assert.equal(item.private_body_digest_matches_signed_claims,true);
    assert.equal(item.client_delivery_independently_proven,false);
    const printed=JSON.stringify(result);
    for(const sensitive of [TX_A,TX_B,TX_C,WALLET_A,WALLET_B,dir,KEY,
      f.client.signer.spki_der_base64,RESPONSE_BYTES.toString("utf8")]){
      assert.equal(printed.includes(sensitive),false);
    }
  }));

test("changed payload bytes are quarantined while signatures remain valid",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const changed=Buffer.from('{"answer":"modified!"}',"utf8");
    const file=putFile(dir,"changed.bin",changed);
    const result=audit(f,[makePair(f)],[record(TX_A,file)]);
    assert.equal(result.capture_digest_matches,0);
    assert.equal(result.capture_digest_mismatches_quarantined,1);
    const entry=result.cases.find(x=>x.transaction_case_id===captureCase(TX_A));
    assert.equal(entry.status,"private_body_digest_mismatch_quarantined");
    assert.equal(entry.private_body_digest_matches_signed_claims,false);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
  }));

test("re-serialized JSON with equivalent semantics is NOT identical byte evidence",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const equivalent=putFile(dir,"reserialized.json",
      Buffer.from('{\n "answer": "synthetic"\n}',"utf8"));
    const result=audit(f,[makePair(f)],[record(TX_A,equivalent)]);
    assert.equal(result.capture_digest_mismatches_quarantined,1);
    assert.equal(result.capture_digest_matches,0);
  }));

test("missing captures and absent signed receipts cannot be mistaken for body checks",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const noCapture=audit(f,[makePair(f)],[]);
    assert.equal(noCapture.signed_client_acknowledgments_missing_capture,1);
    assert.equal(noCapture.actual_response_body_locally_compared_to_signed_hash,false);
    assert.equal(noCapture.private_capture_files_checked,0);
    const noSigned=audit(f,[],[]);
    assert.equal(noSigned.private_capture_files_checked,0);
    assert.equal(noSigned.signed_client_server_claim_pairs,0);
    assert.equal(noSigned.eligible_external_revenue_atomic_usdc,"0");
  }));

test("unmatched, out-of-scope or server-only claim cannot receive a capture",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"body.bin",RESPONSE_BYTES);
    assert.throws(()=>audit(f,[],[record(TX_A,body)]),
      /RESPONSE_BODY_WITHOUT_MATCHED_SIGNED_CLIENT_SERVER_CLAIMS/);
    assert.throws(()=>audit(f,[makePair(f)],[record(TX_C,body)]),
      /RESPONSE_BODY_WITHOUT_MATCHED_SIGNED_CLIENT_SERVER_CLAIMS/);
    assert.throws(()=>audit(f,[makePair(f)],[{
      ...record(TX_A,body),transaction_case_id:"4".repeat(64)
    }]),/RESPONSE_BODY_WITHOUT_MATCHED_SIGNED_CLIENT_SERVER_CLAIMS/);
  }));

test("conflicting settlement is quarantined even with a captured matching response",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const first=writeJournal(dir,"conflict-one.jsonl",[row(TX_A)]);
    const second=writeJournal(dir,"conflict-two.jsonl",[
      row(TX_A,WALLET_B,ROUTE_B)
    ]);
    const manifest={schema_version:1,journals:[first,second]};
    const scope=scopeIdentifier(manifest,KEY);
    const pair=makePair(f);
    const body=putFile(dir,"body.bin",RESPONSE_BYTES);
    assert.throws(()=>auditResponseBodies(manifest,{
      keyHex:KEY,serverSigner:f.server.signer,
      serverFingerprint:f.server.fingerprint,
      clientSigner:f.client.signer,
      clientFingerprint:f.client.fingerprint,
      serverClaims:{schema_version:1,journal_scope_id:scope,
        signed_claims:[pair.server]},
      clientReceipts:{schema_version:1,journal_scope_id:scope,
        signed_receipts:[pair.client]},
      captureManifest:{schema_version:1,journal_scope_id:scope,
        captures:[record(TX_A,body)]}
    }),/DELIVERY_TRANSACTION_NOT_UNCONTESTED_IN_SCOPE/);
  }));

test("negative operator wallet exclusions persist even on matching body bytes",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"body.bin",RESPONSE_BYTES);
    const result=audit(f,[makePair(f)],[record(TX_A,body)],{
      exclusions:[{
        address:WALLET_A,reason:"operator_controlled",
        evidence_reference:"private_operator_inventory"
      }]
    });
    assert.equal(result.capture_digest_matches,1);
    assert.equal(result.matched_captures_from_operator_declared_non_external_wallets,1);
    const caseA=result.cases.find(x=>x.transaction_case_id===captureCase(TX_A));
    assert.equal(caseA.status,"operator_declared_non_external");
    assert.equal(caseA.eligible_revenue_atomic_usdc,"0");
    assert.equal(result.independently_verified_external_buyers,0);
  }));

test("duplicate transaction capture and reused private file are rejected",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"body.bin",RESPONSE_BYTES);
    const rowA=record(TX_A,body);
    assert.throws(()=>validateCaptureManifest(captureDoc(f,[rowA,rowA])),
      /RESPONSE_BODY_DUPLICATE_TRANSACTION_CAPTURE/);
    assert.throws(()=>validateCaptureManifest(captureDoc(f,[
      rowA,record(TX_B,body)
    ])),/RESPONSE_BODY_REUSED_CAPTURE_FILE/);
  }));

test("manifest schema rejects revenue approval flags and noncanonical paths",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"body.bin",RESPONSE_BYTES);
    const valid=record(TX_A,body);
    assert.equal(validateCaptureManifest(captureDoc(f,[valid])).captures.length,1);
    const alternatives=[
      {...valid,capture_kind:"independent_verified_buyer"},
      {...valid,body_file:"relative.json"},
      {...valid,body_file:body.replace("body.bin","./body.bin")},
      {...valid,transaction_case_id:TX_A},
      {...valid,eligible_external_revenue_atomic_usdc:"999"}
    ];
    for(const invalidRecord of alternatives){
      assert.throws(()=>validateCaptureManifest(captureDoc(f,[invalidRecord])),
        /RESPONSE_BODY_CAPTURE_INVALID/);
    }
    assert.throws(()=>validateCaptureManifest({
      ...captureDoc(f,[valid]),external_buyer_verified:true
    }),/RESPONSE_BODY_MANIFEST_INVALID/);
    assert.throws(()=>validateCaptureManifest(captureDoc(f,
      Array(MAX_CAPTURE_RECORDS+1).fill(valid))),
      /RESPONSE_BODY_MANIFEST_INVALID/);
    assert.throws(()=>validateCaptureManifest(captureDoc(f,[{
      ...valid,body_file:1234567
    }])),/RESPONSE_BODY_CAPTURE_INVALID/);
  }));

test("stale journal scope, stale checkpoint or wrong signed bytes block the operation",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"body.bin",RESPONSE_BYTES);
    const pair=makePair(f);
    assert.throws(()=>audit(f,[pair],[record(TX_A,body)],{
      captureManifest:{schema_version:1,journal_scope_id:"5".repeat(64),
        captures:[record(TX_A,body)]}
    }),/RESPONSE_BODY_JOURNAL_SCOPE_MISMATCH/);
    const stale={schema_version:1,journals:[
      {...f.one,expected_head:GENESIS},f.two
    ]};
    const sources=doc(f,[pair.server],[pair.client]);
    assert.throws(()=>auditResponseBodies(stale,{
      keyHex:KEY,serverSigner:f.server.signer,
      serverFingerprint:f.server.fingerprint,
      clientSigner:f.client.signer,
      clientFingerprint:f.client.fingerprint,
      ...sources,captureManifest:captureDoc(f,[record(TX_A,body)])
    }),/LEDGER_CHECKPOINT_MISMATCH/);
    const forged={...pair.client,
      signature_base64:Buffer.alloc(64,1).toString("base64")};
    assert.throws(()=>audit(f,[{
      server:pair.server,client:forged
    }],[record(TX_A,body)]),/CLIENT_RECEIPT_SIGNATURE_INVALID/);
  }));

test("unsafe permissions, symlinks and hardlinks for captured bytes are rejected",()=>
  inPrivateDir(dir=>{
    const file=putFile(dir,"body.bin",RESPONSE_BYTES);
    assert.equal(readPrivateBodyDigest(file).bytes,RESPONSE_BYTES.length);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readPrivateBodyDigest(file),/LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(file,0o600);
    const symlink=path.join(dir,"symlink.bin");
    fs.symlinkSync(file,symlink);
    assert.throws(()=>readPrivateBodyDigest(symlink),/LEDGER_FILE_NOT_PRIVATE/);
    const second=path.join(dir,"hardlink.bin");
    fs.linkSync(file,second);
    assert.throws(()=>readPrivateBodyDigest(file),/LEDGER_FILE_NOT_PRIVATE/);
    fs.unlinkSync(second);
    assert.throws(()=>readPrivateBodyDigest(path.join(dir,"missing.bin")),
      /RESPONSE_BODY_CAPTURE_MISSING/);
    const huge=putFile(dir,"huge.bin",Buffer.alloc(MAX_CAPTURE_FILE_BYTES+1));
    assert.throws(()=>readPrivateBodyDigest(huge),
      /RESPONSE_BODY_FILE_NOT_PRIVATE_OR_TOO_LARGE/);
  }));

test("private capture manifest rejects public permissions and symlinks",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"body.bin",RESPONSE_BYTES);
    const file=privateJson(dir,"manifest.json",captureDoc(f,[record(TX_A,body)]));
    assert.equal(loadPrivateCaptureManifest(file).captures.length,1);
    fs.chmodSync(file,0o644);
    assert.throws(()=>loadPrivateCaptureManifest(file),/LEDGER_FILE_NOT_PRIVATE/);
    fs.chmodSync(file,0o600);
    const alias=path.join(dir,"symlink.json");
    fs.symlinkSync(file,alias);
    assert.throws(()=>loadPrivateCaptureManifest(alias),/LEDGER_FILE_NOT_PRIVATE/);
  }));

test("CLI reads original private bytes, emits no customer data and preserves inputs",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir),body=putFile(dir,"client-capture.bin",RESPONSE_BYTES);
    const pair=makePair(f);
    const docs=doc(f,[pair.server],[pair.client]);
    const sources=[
      privateJson(dir,"journal-manifest.json",f.manifest),
      privateJson(dir,"server-claims.json",docs.serverClaims),
      privateJson(dir,"server-public.json",f.server.signer),
      privateJson(dir,"client-receipts.json",docs.clientReceipts),
      privateJson(dir,"client-public.json",f.client.signer),
      privateJson(dir,"captures.json",captureDoc(f,[record(TX_A,body)]))
    ];
    const watched=sources.concat([f.one.journal_path,f.two.journal_path,body]);
    const before=watched.map(p=>fs.readFileSync(p));
    const exe=path.join(__dirname,"response-body-audit.js");
    const env={...process.env,
      X402_REVIEW_HMAC_KEY:KEY,
      X402_DELIVERY_KEY_SHA256:f.server.fingerprint,
      X402_CLIENT_KEY_SHA256:f.client.fingerprint};
    const res=spawnSync(process.execPath,[exe,...sources],{
      encoding:"utf8",env
    });
    assert.equal(res.status,0,res.stderr);
    const report=JSON.parse(res.stdout);
    assert.equal(report.capture_digest_matches,1);
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
    for(const forbidden of [TX_A,WALLET_A,WALLET_B,KEY,dir,body,
      RESPONSE_BYTES.toString("utf8"),f.server.signer.spki_der_base64]){
      assert.equal(res.stdout.includes(forbidden),false);
    }
    const after=watched.map(p=>fs.readFileSync(p));
    assert.deepEqual(after,before);
    const invalid=spawnSync(process.execPath,[exe,...sources],{
      encoding:"utf8",env:{...env,X402_CLIENT_KEY_SHA256:""}
    });
    assert.equal(invalid.status,1);
    assert.ok(!invalid.stderr.includes(dir));
    assert.ok(!invalid.stderr.includes(WALLET_A));
  }));
test("binary response bytes are hashed without UTF-8 decoding or JSON normalization",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const binary=Buffer.from([0,255,128,13,10,0,1,2,254,123,125]);
    const file=putFile(dir,"binary.bin",binary);
    const pair=makePair(f,TX_A,WALLET_A,ROUTE_A,"a".repeat(32),binary);
    const result=audit(f,[pair],[record(TX_A,file)]);
    assert.equal(result.capture_digest_matches,1);
    assert.equal(result.capture_digest_mismatches_quarantined,0);
    assert.equal(result.private_capture_bytes_read,binary.length);
    assert.equal(result.eligible_external_revenue_atomic_usdc,"0");
  }));

test("aggregate 8 MiB cap blocks otherwise valid separately signed captures",()=>
  inPrivateDir(dir=>{
    const f=makeFixture(dir);
    const transactions=["4","5","6","7","8"].map(hex=>"0x"+hex.repeat(64));
    const first=writeJournal(dir,"large-one.jsonl",
      transactions.map(tx=>row(tx)));
    const second=writeJournal(dir,"large-two.jsonl",[]);
    const manifest={schema_version:1,journals:[first,second]};
    const scope=scopeIdentifier(manifest,KEY);
    const large=Buffer.alloc(1_800_000,0x5a);
    const pairs=transactions.map((tx,index)=>makePair(f,tx,WALLET_A,ROUTE_A,
      String(index).repeat(32),large));
    const sources={
      keyHex:KEY,serverSigner:f.server.signer,
      serverFingerprint:f.server.fingerprint,
      clientSigner:f.client.signer,
      clientFingerprint:f.client.fingerprint,
      serverClaims:{schema_version:1,journal_scope_id:scope,
        signed_claims:pairs.map(p=>p.server)},
      clientReceipts:{schema_version:1,journal_scope_id:scope,
        signed_receipts:pairs.map(p=>p.client)},
      captureManifest:{schema_version:1,journal_scope_id:scope,
        captures:transactions.map((tx,index)=>record(tx,
          putFile(dir,"capture-"+index+".bin",large)))}
    };
    assert.throws(()=>auditResponseBodies(manifest,sources),
      /RESPONSE_BODY_TOTAL_SIZE_LIMIT/);
    assert.ok(large.length<MAX_CAPTURE_FILE_BYTES);
  }));
test("unchanged private capture snapshots survive end-of-batch revalidation", () =>
  inPrivateDir(dir => {
    const file=putFile(dir,"unchanged.bin",RESPONSE_BYTES);
    const original=readPrivateCaptureSnapshot(file);
    assert.equal(original.bytes,RESPONSE_BYTES.length);
    assert.match(original.digest,/^[0-9a-f]{64}$/);
    assert.equal(typeof original.identity,"string");
    assert.doesNotThrow(()=>verifyCaptureSnapshots([
      {filename:file,snapshot:original}
    ]));
    assert.deepEqual(readPrivateBodyDigest(file),{
      digest:original.digest,bytes:original.bytes
    });
    assert.throws(()=>verifyCaptureSnapshots(Array(33).fill({
      filename:file,snapshot:original
    })),/RESPONSE_BODY_SNAPSHOT_BATCH_INVALID/);
  }));

test("same-length in-place mutations invalidate the stored capture snapshot", () =>
  inPrivateDir(dir => {
    const file=putFile(dir,"in-place.bin",Buffer.from("first-capture"));
    const initial=readPrivateCaptureSnapshot(file);
    fs.writeFileSync(file,Buffer.from("other-capture"));
    assert.equal(fs.statSync(file).size,initial.bytes);
    assert.throws(()=>verifyCaptureSnapshots([
      {filename:file,snapshot:initial}
    ]),/RESPONSE_BODY_CHANGED_AFTER_INITIAL_CAPTURE/);
  }));

test("identical bytes in a replacement inode invalidate the capture snapshot", () =>
  inPrivateDir(dir => {
    const file=putFile(dir,"original.bin",RESPONSE_BYTES);
    const initial=readPrivateCaptureSnapshot(file);
    const replacement=putFile(dir,"replacement.bin",RESPONSE_BYTES);
    assert.equal(readPrivateBodyDigest(replacement).digest,initial.digest);
    fs.renameSync(replacement,file);
    assert.throws(()=>verifyCaptureSnapshots([
      {filename:file,snapshot:initial}
    ]),/RESPONSE_BODY_CHANGED_AFTER_INITIAL_CAPTURE/);
  }));

test("truncated capture cannot silently pass snapshot revalidation", () =>
  inPrivateDir(dir => {
    const file=putFile(dir,"truncated.bin",RESPONSE_BYTES);
    const initial=readPrivateCaptureSnapshot(file);
    fs.truncateSync(file,0);
    assert.throws(()=>verifyCaptureSnapshots([
      {filename:file,snapshot:initial}
    ]),/RESPONSE_BODY_CHANGED_AFTER_INITIAL_CAPTURE/);
  }));

test("multi-file audit catches earlier byte mutation while later capture is read", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const first=putFile(dir,"first-body.bin",RESPONSE_BYTES);
    const second=putFile(dir,"second-body.bin",RESPONSE_BYTES);
    const firstIdentity=fs.statSync(first,{bigint:true});
    const secondIdentity=fs.statSync(second,{bigint:true});
    assert.notEqual(firstIdentity.ino,secondIdentity.ino);
    const pairs=[
      makePair(f,TX_A,WALLET_A,ROUTE_A,"a".repeat(32)),
      makePair(f,TX_B,WALLET_A,ROUTE_B,"b".repeat(32))
    ];
    const originalRead=fs.readSync;
    let changed=false;
    fs.readSync=function(fd,...rest) {
      const bytes=originalRead.call(fs,fd,...rest);
      const stat=fs.fstatSync(fd,{bigint:true});
      if(!changed && bytes>0 && stat.dev===secondIdentity.dev &&
          stat.ino===secondIdentity.ino) {
        changed=true;
        // Keep the same length and inode while changing content.
        fs.writeFileSync(first,Buffer.from("X".repeat(RESPONSE_BYTES.length)));
      }
      return bytes;
    };
    try {
      assert.throws(()=>audit(f,pairs,[
        record(TX_A,first),record(TX_B,second)
      ]),/RESPONSE_BODY_CHANGED_AFTER_INITIAL_CAPTURE/);
      assert.equal(changed,true);
    } finally {
      fs.readSync=originalRead;
    }
  }));

test("multi-file audit catches identical-byte path replacement while checking later file", () =>
  inPrivateDir(dir => {
    const f=makeFixture(dir);
    const first=putFile(dir,"first-body.bin",RESPONSE_BYTES);
    const second=putFile(dir,"second-body.bin",RESPONSE_BYTES);
    const replacement=putFile(dir,"replacement.bin",RESPONSE_BYTES);
    const secondIdentity=fs.statSync(second,{bigint:true});
    const pairs=[
      makePair(f,TX_A,WALLET_A,ROUTE_A,"a".repeat(32)),
      makePair(f,TX_B,WALLET_A,ROUTE_B,"b".repeat(32))
    ];
    const originalRead=fs.readSync;
    let replaced=false;
    fs.readSync=function(fd,...rest) {
      const bytes=originalRead.call(fs,fd,...rest);
      const stat=fs.fstatSync(fd,{bigint:true});
      if(!replaced && bytes>0 && stat.dev===secondIdentity.dev &&
          stat.ino===secondIdentity.ino) {
        replaced=true;
        // Same bytes and digest, but a different inode.
        fs.renameSync(replacement,first);
      }
      return bytes;
    };
    try {
      assert.throws(()=>audit(f,pairs,[
        record(TX_A,first),record(TX_B,second)
      ]),/RESPONSE_BODY_CHANGED_AFTER_INITIAL_CAPTURE/);
      assert.equal(replaced,true);
    } finally {
      fs.readSync=originalRead;
    }
  }));

