"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CHAIN, CHAIN_ID, USDC, RECEIVER, TRANSFER_TOPIC,
  validObservation, reconcileEvents, makeRpc
} = require("./reconcile-settlements");

const TX = "0x" + "a".repeat(64);
const BLOCK_HASH = "0x" + "c".repeat(64);
const PAYER = "0x" + "b".repeat(40);
const ROUTE = "/api/domain-rdap";

function observation(change = {}) {
  return {
    event: "x402_settlement_succeeded",
    schema_version: 2,
    product_id: "domain-rdap",
    route: ROUTE,
    listed_price_usdc: "0.005",
    expected_amount_atomic_usdc: "5000",
    network: CHAIN,
    transaction: TX,
    payer: PAYER,
    evidence_source: "facilitator_settle_response",
    onchain_verified: false,
    external_buyer_verified: false,
    eligible_for_revenue_scoreboard: false,
    settled_at: "2026-10-10T04:00:00.000Z",
    ...change
  };
}
function word(value) {
  return "0x" + BigInt(value).toString(16).padStart(64, "0");
}
function addressTopic(value) { return "0x" + "0".repeat(24) + value.slice(2).toLowerCase(); }
function transfer(change = {}) {
  return {
    address: USDC,
    topics: [TRANSFER_TOPIC, addressTopic(PAYER), addressTopic(RECEIVER)],
    data: word(5000),
    transactionHash: TX,
    blockHash: BLOCK_HASH,
    blockNumber: "0x64",
    logIndex: "0x3",
    removed: false,
    ...change
  };
}
function receipt(change = {}) {
  return {
    transactionHash: TX,
    blockHash: BLOCK_HASH,
    blockNumber: "0x64",
    status: "0x1",
    logs: [transfer()],
    ...change
  };
}
function mockRpc({ chain = CHAIN_ID, latest = "0x80", found = receipt(), fail = false } = {}) {
  const calls = [];
  return {
    calls,
    rpcCall: async (method, params) => {
      calls.push([method, params]);
      if (method === "eth_chainId") return chain;
      if (method === "eth_blockNumber") return latest;
      if (method === "eth_getTransactionReceipt") {
        if (fail) throw new Error("provider down");
        return found;
      }
      throw new Error("unexpected RPC");
    }
  };
}
async function one(change = {}, rpcConfig = {}, options = {}) {
  const { rpcCall } = mockRpc(rpcConfig);
  const result = await reconcileEvents([observation(change)], { rpcCall, ...options });
  return { row: result.events[0], report: result };
}

test("confirms one canonical USDC transfer without treating it as a real external sale", async () => {
  const h = mockRpc();
  const result = await reconcileEvents([observation()], { rpcCall: h.rpcCall });
  const row = result.events[0];
  assert.equal(row.status, "verified_onchain_transfer");
  assert.equal(row.onchain_verified, true);
  assert.equal(row.confirmed_transfer_amount_atomic_usdc, "5000");
  assert.equal(row.payer, PAYER);
  assert.equal(row.receiver, RECEIVER);
  assert.equal(row.token_contract, USDC);
  assert.equal(row.block_number, "100");
  assert.equal(row.transaction_log_index, "3");
  assert.equal(row.external_buyer_verified, false);
  assert.equal(row.eligible_for_revenue_scoreboard, false);
  assert.equal(result.verified_external_buyers, 0);
  assert.equal(result.eligible_external_revenue_atomic_usdc, "0");
  assert.equal(result.product_025_unlock_evidence, false);
  assert.deepEqual(h.calls.map(x => x[0]), ["eth_chainId", "eth_blockNumber", "eth_getTransactionReceipt"]);
});

test("all repeated transaction observations are rejected independent of ordering", async () => {
  const h = mockRpc();
  const rows = [
    observation(),
    observation({ route: "/api/sec-filings", product_id: "sec-filings", transaction: TX.toUpperCase().replace(/^0X/, "0x") })
  ];
  const result = await reconcileEvents(rows, { rpcCall: h.rpcCall });
  assert.deepEqual(result.events.map(x => x.status), ["duplicate_observation", "duplicate_observation"]);
  assert.equal(h.calls.filter(x => x[0] === "eth_getTransactionReceipt").length, 0);
});

test("invalid route, metadata, unsupported schema and price never reach an RPC receipt", async () => {
  const variants = [
    { route: "/_api/domain-rdap" },
    { product_id: "wrong-id" },
    { expected_amount_atomic_usdc: "4999" },
    { listed_price_usdc: "0.050" },
    { evidence_source: "untrusted_input" },
    { schema_version: 3 },
    { network: "eip155:1" },
    { transaction: null },
    { payer: null },
    { eligible_for_revenue_scoreboard: true }
  ];
  for (const variant of variants) {
    const h = mockRpc();
    const result = await reconcileEvents([observation(variant)], { rpcCall: h.rpcCall });
    assert.equal(result.events[0].status, "invalid_observation", JSON.stringify(variant));
    assert.equal(h.calls.length, 2);
  }
  assert.equal(validObservation(observation()), true);
});

test("wrong chain aborts fail closed before inspecting receipts", async () => {
  const h = mockRpc({ chain: "0x1" });
  await assert.rejects(
    reconcileEvents([observation()], { rpcCall: h.rpcCall }),
    /wrong_rpc_chain/
  );
  assert.equal(h.calls.length, 1);
});

test("not mined, reverted, malformed, or insufficiently confirmed never verifies", async () => {
  const cases = [
    [{ found: null }, "receipt_pending"],
    [{ found: receipt({ status: "0x0" }) }, "transaction_not_successful"],
    [{ found: receipt({ transactionHash: "0x" + "d".repeat(64) }) }, "malformed_receipt"],
    [{ found: receipt({ blockHash: null }) }, "malformed_receipt"],
    [{ found: receipt({ blockNumber: "one-hundred" }) }, "malformed_receipt"],
    [{ latest: "0x69" }, "insufficient_confirmations"],
    [{ latest: "0x63" }, "insufficient_confirmations"],
    [{ fail: true }, "rpc_unavailable"]
  ];
  for (const [config, expected] of cases) {
    const { row } = await one({}, config);
    assert.equal(row.status, expected);
    assert.equal(row.onchain_verified, false);
  }
});

test("wrong token, payer, receiver, amount, log integrity and ambiguous transfers fail", async () => {
  const cases = [
    [[transfer({ address: "0x" + "f".repeat(40) })], "transfer_not_found"],
    [[transfer({ topics: [TRANSFER_TOPIC, addressTopic("0x" + "f".repeat(40)), addressTopic(RECEIVER)] })], "transfer_not_found"],
    [[transfer({ topics: [TRANSFER_TOPIC, addressTopic(PAYER), addressTopic("0x" + "f".repeat(40))] })], "transfer_not_found"],
    [[transfer({ data: word(4999) })], "amount_mismatch"],
    [[transfer({ removed: true })], "transfer_not_found"],
    [[transfer({ blockHash: "0x" + "f".repeat(64) })], "transfer_not_found"],
    [[transfer({ transactionHash: "0x" + "f".repeat(64) })], "transfer_not_found"],
    [[transfer({ data: "0x5" })], "transfer_not_found"],
    [[transfer(), transfer({ logIndex: "0x4" })], "ambiguous_transfers"],
    [[transfer({ data: word(0) }), transfer({ logIndex: "0x4" })], "ambiguous_transfers"]
  ];
  for (const [logs, status] of cases) {
    const { row } = await one({}, { found: receipt({ logs }) });
    assert.equal(row.status, status);
    assert.equal(row.onchain_verified, false);
    assert.equal(row.eligible_for_revenue_scoreboard, false);
  }
});

test("amount cannot be taken from app telemetry rather than canonical terms", async () => {
  const altered = observation({ listed_price_usdc: "9.999" });
  const result = await reconcileEvents([altered], { rpcCall: mockRpc().rpcCall });
  assert.equal(result.events[0].status, "invalid_observation");
});

test("batch size and confirmation policy are bounded", async () => {
  const { rpcCall } = mockRpc();
  await assert.rejects(reconcileEvents(Array(251).fill(observation()), { rpcCall }), /0-250/);
  for (const count of [-1, 0, 1.2, 5001]) {
    await assert.rejects(reconcileEvents([], { rpcCall, minConfirmations: count }), /confirmation requirement/);
  }
});

test("RPC transport only permits read methods and validates chain response envelope", async () => {
  assert.throws(() => makeRpc("http://localhost:8545"), /trusted HTTPS/);
  assert.throws(() => makeRpc("https://user:password@example.com/path"), /trusted HTTPS/);
  const requests = [];
  const call = makeRpc("https://rpc.example.invalid", {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ method: body.method, methodHTTP: options.method, params: body.params });
      return {
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: body.id, result: CHAIN_ID })
      };
    }
  });
  assert.equal(await call("eth_chainId", []), CHAIN_ID);
  await assert.rejects(call("eth_sendRawTransaction", ["0xdead"]), /read-only/);
  assert.deepEqual(requests, [{ method: "eth_chainId", methodHTTP: "POST", params: [] }]);
});

test("RPC errors and malformed JSON-RPC envelopes do not pass", async () => {
  const call = makeRpc("https://rpc.example.invalid", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32000 } }) })
  });
  await assert.rejects(call("eth_chainId", []), /rpc_invalid_response/);
});
