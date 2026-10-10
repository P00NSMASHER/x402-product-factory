"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {
  hmacKey, pseudonym, validateExclusions,
  readPrivateExclusions, buildBuyerReviewQueue
} = require("./buyer-review-queue");
const {readLedger, appendReconciledObservations} = require("./settlement-ledger");
const {CHAIN, CHAIN_ID, USDC, RECEIVER, TRANSFER_TOPIC} = require("./reconcile-settlements");

const SECRET = "ab".repeat(32);
const OTHER_SECRET = "cd".repeat(32);
const A = "0x" + "a".repeat(64);
const B = "0x" + "b".repeat(64);
const C = "0x" + "c".repeat(64);
const HASH = "0x" + "f".repeat(64);
const WALLET_A = "0x" + "d".repeat(40);
const WALLET_B = "0x" + "e".repeat(40);

function topic(address) { return "0x" + "0".repeat(24) + address.slice(2).toLowerCase(); }
function word(number) { return "0x" + BigInt(number).toString(16).padStart(64, "0"); }
function observation(tx, payer, route="/api/domain-rdap") {
  return {
    event:"x402_settlement_succeeded",
    schema_version:2,
    product_id:route.slice(5),
    route,
    listed_price_usdc:"0.005",
    expected_amount_atomic_usdc:"5000",
    network:CHAIN,
    transaction:tx,
    payer,
    evidence_source:"facilitator_settle_response",
    onchain_verified:false,
    external_buyer_verified:false,
    eligible_for_revenue_scoreboard:false,
    settled_at:"2026-10-10T04:00:00.000Z"
  };
}
function rpc(records) {
  const index = new Map(records.map(r => [r.transaction, r]));
  return async (method,params) => {
    if (method==="eth_chainId") return CHAIN_ID;
    if (method==="eth_blockNumber") return "0x80";
    if (method==="eth_getBlockByNumber") return {number:"0x64",hash:HASH};
    if (method==="eth_getTransactionReceipt") {
      const item=index.get(params[0]);
      if (!item) throw new Error("unknown mock transaction");
      return {
        transactionHash:item.transaction,blockHash:HASH,blockNumber:"0x64",
        status:"0x1",
        logs:[{
          address:USDC,
          topics:[TRANSFER_TOPIC,topic(item.payer),topic(RECEIVER)],
          data:word(5000),
          transactionHash:item.transaction,blockHash:HASH,
          blockNumber:"0x64",logIndex:"0x2",removed:false
        }]
      };
    }
    throw new Error("unexpected RPC method");
  };
}
async function privateJournal(callback) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x402-review-private-"));
  const file=path.join(dir,"settlement.jsonl");
  const examples=[
    observation(A,WALLET_A),
    observation(B,WALLET_A,"/api/sec-filings"),
    observation(C,WALLET_B)
  ];
  try {
    const rpcCall=rpc(examples);
    for(const item of examples){
      const out=await appendReconciledObservations([item],{
        ledgerPath:file,rpcCall,
        now:()=>`2026-10-10T06:00:00.000Z`
      });
      assert.equal(out.verified_transfer_evidence_added,1);
    }
    await callback({dir,file,examples});
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
function exclusion(address,reason="operator_controlled") {
  return {
    address,
    reason,
    evidence_reference:"operator-wallet-inventory-20261010"
  };
}
test("review queue groups wallet reuse but never treats wallet counts as buyers",async()=>{
  await privateJournal(async({file})=>{
    const queue=buildBuyerReviewQueue(file,{keyHex:SECRET});
    assert.equal(queue.report_type,"wallet_review_queue_not_revenue_ledger");
    assert.equal(queue.historical_transfer_evidence,3);
    assert.equal(queue.distinct_payer_wallets_not_distinct_buyers,2);
    assert.equal(queue.repeat_wallet_signals_not_repeat_customers,1);
    assert.equal(queue.wallets_requiring_independent_review,2);
    assert.equal(queue.checkpoint_verified,false);
    assert.equal(queue.current_chain_reverified,false);
    assert.equal(queue.independently_verified_external_buyers,0);
    assert.equal(queue.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(queue.product_025_unlock_evidence,false);
    assert.equal(queue.cases.length,2);
    const repeated=queue.cases.find(row=>row.repeat_wallet_signal);
    assert.ok(repeated);
    assert.equal(repeated.status,"requires_independent_buyer_review");
    assert.equal(repeated.transfer_evidence_count,2);
    assert.deepEqual(repeated.routes,["/api/domain-rdap","/api/sec-filings"]);
    assert.deepEqual(repeated.journal_sequences,[1,2]);
    assert.equal(repeated.outside_buyer_proven,false);
    assert.equal(repeated.eligible_revenue_atomic_usdc,"0");
    assert.equal(queue.cases.every(x=>x.case_id.length===64),true);
    const printed=JSON.stringify(queue);
    assert.ok(!printed.includes(WALLET_A));
    assert.ok(!printed.includes(WALLET_B));
    assert.ok(!printed.includes(A));
    assert.ok(!printed.includes(B));
    assert.ok(!printed.includes(C));
    assert.ok(!printed.includes(SECRET));
    assert.ok(!printed.includes("operator-wallet-inventory"));
  });
});

test("operator-supplied exclusions only remove cases from pending review",async()=>{
  await privateJournal(async({file})=>{
    const ex=[exclusion(WALLET_A),exclusion("0x"+"1".repeat(40),"marketplace_probe")];
    const queue=buildBuyerReviewQueue(file,{keyHex:SECRET,exclusions:ex});
    assert.equal(queue.operator_declared_exclusion_records_supplied,2);
    assert.equal(queue.operator_declared_non_external_wallets,1);
    assert.equal(queue.operator_declared_non_external_transfer_evidence,2);
    assert.equal(queue.wallets_requiring_independent_review,1);
    const excluded=queue.cases.find(x=>x.status==="operator_declared_non_external");
    assert.ok(excluded);
    assert.equal(excluded.exclusion_reason,"operator_controlled");
    assert.equal(excluded.outside_buyer_proven,false);
    assert.equal(queue.independently_verified_external_buyers,0);
    assert.equal(queue.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(queue.product_025_unlock_evidence,false);
  });
});

test("same review key yields stable pseudonyms and another key rotates them",async()=>{
  await privateJournal(async({file})=>{
    const one=buildBuyerReviewQueue(file,{keyHex:SECRET});
    const two=buildBuyerReviewQueue(file,{keyHex:SECRET.toUpperCase()});
    const rotated=buildBuyerReviewQueue(file,{keyHex:OTHER_SECRET});
    assert.deepEqual(one,two);
    assert.notDeepEqual(one.cases.map(x=>x.case_id),rotated.cases.map(x=>x.case_id));
    assert.equal(pseudonym(hmacKey(SECRET),"wallet",WALLET_A).length,64);
    assert.notEqual(pseudonym(hmacKey(SECRET),"wallet",WALLET_A),
      pseudonym(hmacKey(SECRET),"transaction",WALLET_A));
  });
});

test("checkpoint gate prevents review queue from silently using a rewritten journal",async()=>{
  await privateJournal(async({file})=>{
    const checkpoint={head:readLedger(file).head,records:3};
    assert.equal(buildBuyerReviewQueue(file,{keyHex:SECRET,checkpoint}).checkpoint_verified,true);
    assert.throws(()=>buildBuyerReviewQueue(file,{
      keyHex:SECRET,checkpoint:{head:"0".repeat(64),records:3}
    }),/LEDGER_CHECKPOINT_MISMATCH/);
    fs.writeFileSync(file,fs.readFileSync(file,"utf8").split("\n").slice(0,2).join("\n")+"\n");
    assert.throws(()=>buildBuyerReviewQueue(file,{keyHex:SECRET,checkpoint}),
      /LEDGER_CHECKPOINT_MISMATCH/);
  });
});

test("malformed review keys and invalid exclusion claims fail closed",()=>{
  for(const value of [null,"","abc","0x"+"a".repeat(64),"z".repeat(64),"a".repeat(63)]) {
    assert.throws(()=>hmacKey(value),/BUYER_REVIEW_KEY_MUST_BE_32_BYTE_HEX/);
  }
  const failures=[
    [exclusion(WALLET_A,"external_customer")],
    [{...exclusion(WALLET_A),evidence_reference:""}],
    [{...exclusion(WALLET_A),address:"123"}],
    [exclusion(WALLET_A),exclusion(WALLET_A.toUpperCase().replace(/^0X/,"0x"))],
    Array(1001).fill(exclusion(WALLET_A))
  ];
  for(const bad of failures){
    assert.throws(()=>validateExclusions(bad),/BUYER_REVIEW_EXCLUSION/);
  }
});

test("private exclusion source enforces schema, file permissions and provenance refs",async()=>{
  await privateJournal(async({dir})=>{
    const file=path.join(dir,"exclusions.json");
    const valid={schema_version:1,excluded_wallets:[exclusion(WALLET_A)]};
    fs.writeFileSync(file,JSON.stringify(valid),{mode:0o600});
    assert.deepEqual(readPrivateExclusions(file),[
      {address:WALLET_A,reason:"operator_controlled"}
    ]);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readPrivateExclusions(file),/BUYER_REVIEW_EXCLUSIONS_FILE_NOT_PRIVATE/);
    fs.chmodSync(file,0o600);
    const link=path.join(dir,"exclusions-link.json");
    fs.symlinkSync(file,link);
    assert.throws(()=>readPrivateExclusions(link),/LEDGER_FILE_NOT_PRIVATE/);
    fs.unlinkSync(link);
    fs.writeFileSync(file,JSON.stringify({...valid,schema_version:9}));
    assert.throws(()=>readPrivateExclusions(file),/BUYER_REVIEW_EXCLUSIONS_SCHEMA_INVALID/);
    fs.writeFileSync(file,"{bad");
    assert.throws(()=>readPrivateExclusions(file),/BUYER_REVIEW_EXCLUSIONS_JSON_INVALID/);
  });
});

test("legacy evidence and missing journals do not generate a customer-review queue",async()=>{
  await privateJournal(async({file,dir})=>{
    const original=fs.readFileSync(file,"utf8");
    const rows=original.trimEnd().split("\n").map(x=>JSON.parse(x));
    const {hash,...legacy}=rows[0];
    legacy.schema_version=1;
    delete legacy.canonical_block_hash;
    const oldHash=require("./settlement-ledger").seal(legacy);
    fs.writeFileSync(file,JSON.stringify(oldHash)+"\n");
    assert.throws(()=>buildBuyerReviewQueue(file,{keyHex:SECRET}),
      /BUYER_REVIEW_LEGACY_JOURNAL_REQUIRES_RECONCILIATION/);
    assert.throws(()=>buildBuyerReviewQueue(path.join(dir,"missing.jsonl"),{keyHex:SECRET}),
      /BUYER_REVIEW_JOURNAL_NOT_FOUND/);
  });
});

test("tampered journal records cannot be classified as genuine buyers",async()=>{
  await privateJournal(async({file})=>{
    const raw=fs.readFileSync(file,"utf8");
    fs.writeFileSync(file,raw.replace('"external_buyer_verified":false',
      '"external_buyer_verified":true'));
    assert.throws(()=>buildBuyerReviewQueue(file,{keyHex:SECRET}),
      /LEDGER_CONTRACT_VIOLATION|LEDGER_HASH_MISMATCH/);
  });
});

test("CLI reports only pseudonymous review cases and preserves no secrets",async()=>{
  await privateJournal(async({file,dir})=>{
    const excl=path.join(dir,"exclusions.json");
    fs.writeFileSync(excl,JSON.stringify({
      schema_version:1,excluded_wallets:[exclusion(WALLET_A)]
    }),{mode:0o600});
    const snapshot=readLedger(file);
    const args=[
      path.join(__dirname,"buyer-review-queue.js"),
      file,excl,
      "--expect-head",snapshot.head,"--expect-records","3"
    ];
    const env={...process.env,X402_REVIEW_HMAC_KEY:SECRET};
    const child=spawnSync(process.execPath,args,{encoding:"utf8",env});
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stderr,"");
    const report=JSON.parse(child.stdout);
    assert.equal(report.checkpoint_verified,true);
    assert.equal(report.operator_declared_non_external_wallets,1);
    assert.equal(report.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(report.product_025_unlock_evidence,false);
    for(const privateValue of [WALLET_A,WALLET_B,SECRET,A,B,C,
      "operator-wallet-inventory-20261010"]){
      assert.equal(child.stdout.includes(privateValue),false);
    }
    const mismatch=spawnSync(process.execPath,[
      ...args.slice(0,4),"0".repeat(64),...args.slice(5)
    ],{encoding:"utf8",env});
    assert.notEqual(mismatch.status,0);
    assert.equal(mismatch.stdout,"");
    assert.ok(!mismatch.stderr.includes(SECRET));
  });
});
