"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  GENESIS, readLedger, appendReconciledObservations
} = require("./settlement-ledger");
const {
  CHAIN, CHAIN_ID, USDC, RECEIVER, TRANSFER_TOPIC
} = require("./reconcile-settlements");

const A = "0x" + "a".repeat(64);
const B = "0x" + "b".repeat(64);
const BLOCK = "0x" + "c".repeat(64);
const PAYER = "0x" + "d".repeat(40);
function word(n) { return "0x" + BigInt(n).toString(16).padStart(64, "0"); }
function topicAddress(a) { return "0x" + "0".repeat(24) + a.slice(2).toLowerCase(); }
function observation(tx = A, extra = {}) {
  return {
    event: "x402_settlement_succeeded",
    schema_version: 2,
    product_id: "domain-rdap",
    route: "/api/domain-rdap",
    listed_price_usdc: "0.005",
    expected_amount_atomic_usdc: "5000",
    network: CHAIN,
    transaction: tx,
    payer: PAYER,
    evidence_source: "facilitator_settle_response",
    onchain_verified: false,
    external_buyer_verified: false,
    eligible_for_revenue_scoreboard: false,
    settled_at: "2026-10-10T00:00:00.000Z",
    secret_payment_payload: "must-not-persist",
    query_input: "must-not-persist",
    ...extra
  };
}
function receipt(tx, { amount = 5000, statuses = "0x1" } = {}) {
  return {
    transactionHash: tx,
    blockHash: BLOCK,
    blockNumber: "0x64",
    status: statuses,
    logs: [{
      address: USDC,
      topics: [TRANSFER_TOPIC, topicAddress(PAYER), topicAddress(RECEIVER)],
      data: word(amount),
      transactionHash: tx,
      blockHash: BLOCK,
      blockNumber: "0x64",
      logIndex: "0x3",
      removed: false
    }]
  };
}
function rpc({ chain = CHAIN_ID, amount = 5000, failures = [], latest = "0x90" } = {}) {
  return async (method, params) => {
    if (method === "eth_chainId") {
      if (failures.includes(method)) throw new Error("RPC unavailable");
      return chain;
    }
    if (method === "eth_blockNumber") return latest;
    if (method === "eth_getTransactionReceipt") {
      if (failures.includes(method)) throw new Error("RPC unavailable");
      return receipt(params[0], {amount});
    }
    throw new Error("unexpected method");
  };
}
async function privateLedger(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x402-private-ledger-"));
  try { await fn({dir, ledgerPath:path.join(dir, "evidence.jsonl")}); }
  finally { fs.rmSync(dir, {recursive:true,force:true}); }
}
const commit = (event, ledgerPath, rpcCall = rpc()) =>
  appendReconciledObservations([event], {ledgerPath,rpcCall,now:()=>"2026-10-10T01:02:03.000Z"});

test("records corroborated transfer, validates hash chain and omits sensitive inputs", async()=>{
  await privateLedger(async ({ledgerPath})=>{
    assert.equal(readLedger(ledgerPath).head, GENESIS);
    const out=await commit(observation(A),ledgerPath);
    assert.equal(out.verified_transfer_evidence_added,1);
    assert.equal(out.verified_external_buyers,0);
    assert.equal(out.eligible_external_revenue_atomic_usdc,"0");
    assert.equal(out.product_025_unlock_evidence,false);
    const replay=readLedger(ledgerPath);
    assert.equal(replay.records.length,1);
    assert.equal(replay.head,out.head_hash);
    assert.equal(replay.records[0].transaction,A);
    assert.equal(replay.records[0].sequence,1);
    assert.equal(replay.records[0].previous_hash,GENESIS);
    assert.equal(replay.records[0].external_buyer_verified,false);
    assert.equal(replay.records[0].eligible_for_revenue_scoreboard,false);
    const raw=fs.readFileSync(ledgerPath,"utf8");
    assert.ok(!raw.includes("must-not-persist"));
    assert.ok(!raw.includes("query_input"));
    assert.equal(fs.statSync(ledgerPath).mode & 0o777,0o600);
  });
});

test("repeat observation across separate sessions is not appended twice", async()=>{
  await privateLedger(async ({ledgerPath})=>{
    await commit(observation(A),ledgerPath);
    const repeated=await commit(observation(A),ledgerPath);
    assert.equal(repeated.verified_transfer_evidence_added,0);
    assert.equal(repeated.previously_recorded_transactions,1);
    assert.equal(readLedger(ledgerPath).records.length,1);
  });
});

test("two unique transactions from separate invocations link hashes in order", async()=>{
  await privateLedger(async ({ledgerPath})=>{
    const first=await commit(observation(A),ledgerPath);
    const second=await commit(observation(B),ledgerPath);
    assert.equal(second.verified_transfer_evidence_added,1);
    assert.equal(second.total_verified_transfer_evidence,2);
    const rows=readLedger(ledgerPath).records;
    assert.equal(rows[1].previous_hash,rows[0].hash);
    assert.equal(rows[1].sequence,2);
    assert.notEqual(rows[0].hash,rows[1].hash);
    assert.equal(first.head_hash,rows[0].hash);
  });
});

test("bad source proof never creates ledger evidence", async()=>{
  await privateLedger(async ({ledgerPath})=>{
    const rejected=await commit(observation(A),ledgerPath,rpc({amount:4999}));
    assert.equal(rejected.unresolved_or_rejected_observations,1);
    assert.equal(rejected.verified_transfer_evidence_added,0);
    assert.equal(fs.existsSync(ledgerPath),false);
    const falseExternal=await commit(observation(A,{eligible_for_revenue_scoreboard:true}),ledgerPath);
    assert.equal(falseExternal.verified_transfer_evidence_added,0);
    assert.equal(falseExternal.unresolved_or_rejected_observations,1);
    assert.equal(fs.existsSync(ledgerPath),false);
    await assert.rejects(commit(observation(A),ledgerPath,rpc({chain:"0x1"})),/wrong_rpc_chain/);
    assert.equal(fs.existsSync(ledgerPath),false);
  });
});

test("a manually fabricated verified report cannot be admitted as an observation", async()=>{
  await privateLedger(async ({ledgerPath})=>{
    const fake={
      transaction:A,route:"/api/domain-rdap",payer:PAYER,
      status:"verified_onchain_transfer",onchain_verified:true,
      external_buyer_verified:true,eligible_for_revenue_scoreboard:true
    };
    const result=await commit(fake,ledgerPath);
    assert.equal(result.verified_transfer_evidence_added,0);
    assert.equal(readLedger(ledgerPath).records.length,0);
  });
});

test("detects hash mutation, truncation and duplicate records without repairing", async()=>{
  await privateLedger(async ({ledgerPath})=>{
    await commit(observation(A),ledgerPath);
    const original=fs.readFileSync(ledgerPath,"utf8");
    const corrupted=original.replace(/"amount_atomic_usdc":"5000"/,'"amount_atomic_usdc":"5999"');
    fs.writeFileSync(ledgerPath,corrupted);
    assert.throws(()=>readLedger(ledgerPath),/LEDGER_CONTRACT_VIOLATION/);
    await assert.rejects(commit(observation(B),ledgerPath),/LEDGER_CONTRACT_VIOLATION/);
    fs.writeFileSync(ledgerPath,original.slice(0,-3));
    assert.throws(()=>readLedger(ledgerPath),/LEDGER_INCOMPLETE_WRITE/);
    fs.writeFileSync(ledgerPath,original+original);
    assert.throws(()=>readLedger(ledgerPath),/LEDGER_CONTRACT_VIOLATION|LEDGER_DUPLICATE_TRANSACTION/);
    fs.writeFileSync(ledgerPath,original);
    assert.equal(readLedger(ledgerPath).records.length,1);
  });
});

test("holding a lock prevents even a valid concurrent append",async()=>{
  await privateLedger(async ({ledgerPath})=>{
    fs.writeFileSync(ledgerPath+".lock","other writer",{mode:0o600});
    await assert.rejects(commit(observation(A),ledgerPath),/LEDGER_LOCKED_REVIEW_REQUIRED/);
    assert.equal(fs.readFileSync(ledgerPath+".lock","utf8"),"other writer");
    assert.equal(fs.existsSync(ledgerPath),false);
    fs.unlinkSync(ledgerPath+".lock");
    assert.equal((await commit(observation(A),ledgerPath)).verified_transfer_evidence_added,1);
    assert.equal(fs.existsSync(ledgerPath+".lock"),false);
  });
});

test("lock is released after a corrupted ledger blocks the write",async()=>{
  await privateLedger(async ({ledgerPath})=>{
    fs.writeFileSync(ledgerPath,"{invalid\n",{mode:0o600});
    await assert.rejects(commit(observation(A),ledgerPath),/LEDGER_INVALID_JSON/);
    assert.equal(fs.existsSync(ledgerPath+".lock"),false);
  });
});

test("rejects ledger paths inside repository and non-private directories",async()=>{
  await privateLedger(async ({dir,ledgerPath})=>{
    assert.throws(()=>readLedger(path.join(__dirname,"public-ledger.jsonl")) ,/LEDGER_MUST_BE_OUTSIDE_REPOSITORY/);
    assert.throws(()=>readLedger("ledger.jsonl"),/LEDGER_ABSOLUTE_PATH_REQUIRED/);
    fs.chmodSync(dir,0o755);
    assert.throws(()=>readLedger(ledgerPath),/LEDGER_DIRECTORY_NOT_PRIVATE/);
    fs.chmodSync(dir,0o700);
  });
});

test("does not follow ledger symlinks or overwrite foreign files",async()=>{
  await privateLedger(async ({dir,ledgerPath})=>{
    const foreign=path.join(dir,"foreign-data");
    fs.writeFileSync(foreign,"secret",{mode:0o600});
    fs.symlinkSync(foreign,ledgerPath);
    await assert.rejects(commit(observation(A),ledgerPath),/LEDGER_FILE_NOT_PRIVATE/);
    assert.equal(fs.readFileSync(foreign,"utf8"),"secret");
  });
});

test("pre-existing ledger permissions must be owner-only",async()=>{
  await privateLedger(async ({ledgerPath})=>{
    fs.writeFileSync(ledgerPath,"",{mode:0o644});
    assert.throws(()=>readLedger(ledgerPath),/LEDGER_FILE_NOT_PRIVATE/);
  });
});

test("RPC outage cannot append a new settlement or damage existing journal",async()=>{
  await privateLedger(async ({ledgerPath})=>{
    await commit(observation(A),ledgerPath);
    const before=fs.readFileSync(ledgerPath,"utf8");
    await assert.rejects(commit(observation(B),ledgerPath,rpc({failures:["eth_chainId"]})),/RPC unavailable/);
    assert.equal(fs.readFileSync(ledgerPath,"utf8"),before);
    assert.equal(readLedger(ledgerPath).records.length,1);
  });
});
