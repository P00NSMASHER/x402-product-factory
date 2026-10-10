"use strict";

// Read-only reconciliation for the five canonical Supabase x402 routes.
// A corroborated Base transfer is NOT automatically a genuine external sale.
const fs = require("node:fs");
const path = require("node:path");
const topology = require("../../production-topology.json");

const CHAIN = "eip155:8453";
const CHAIN_ID = "0x2105";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const RECEIVER = "0x708f7b52b56eafd7fc1de65fc7752ed732914021";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const EXPECTED_AMOUNT = "5000";
const PRICE = "0.005";
const routes = topology.canonical_sellers.find(item => item.id === "supabase_data_tools");
if (!routes || !Array.isArray(routes.routes)) throw new Error("missing canonical Supabase route ownership");
const ROUTE_IDS = new Map(routes.routes.map(route => [route.path, route.id]));

function isHash(value) { return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value); }
function isAddress(value) { return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value); }
function norm(value) { return value.toLowerCase(); }
function quantity(value) {
  if (typeof value !== "string" || !/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new Error("invalid_rpc_quantity");
  }
  return BigInt(value);
}
function topicAddress(value) {
  return typeof value === "string" &&
    /^0x0{24}[0-9a-fA-F]{40}$/i.test(value) ? "0x" + value.slice(-40).toLowerCase() : null;
}
function record(event, status, details = {}) {
  return {
    route: typeof event?.route === "string" ? event.route : null,
    transaction: isHash(event?.transaction) ? norm(event.transaction) : null,
    status,
    onchain_verified: false,
    external_buyer_verified: false,
    eligible_for_revenue_scoreboard: false,
    ...details
  };
}
function validObservation(event) {
  return event && event.schema_version === 2 &&
    event.event === "x402_settlement_succeeded" &&
    event.evidence_source === "facilitator_settle_response" &&
    event.network === CHAIN &&
    event.onchain_verified === false &&
    event.external_buyer_verified === false &&
    event.eligible_for_revenue_scoreboard === false &&
    ROUTE_IDS.has(event.route) &&
    event.product_id === ROUTE_IDS.get(event.route) &&
    event.listed_price_usdc === PRICE &&
    event.expected_amount_atomic_usdc === EXPECTED_AMOUNT &&
    isHash(event.transaction) &&
    isAddress(event.payer);
}
function relevantTransfer(log, receipt, tx, payer) {
  if (!log || norm(String(log.address || "")) !== USDC ||
      !Array.isArray(log.topics) || log.topics.length !== 3 ||
      norm(String(log.topics[0])) !== TRANSFER_TOPIC ||
      topicAddress(log.topics[1]) !== payer ||
      topicAddress(log.topics[2]) !== RECEIVER ||
      log.removed === true ||
      !isHash(log.transactionHash) || norm(log.transactionHash) !== tx ||
      !isHash(log.blockHash) || norm(log.blockHash) !== norm(receipt.blockHash) ||
      log.blockNumber !== receipt.blockNumber ||
      !/^0x[a-fA-F0-9]{64}$/.test(log.data || "")) return null;
  try {
    const logIndex = quantity(log.logIndex);
    return { amount: BigInt(log.data), logIndex: logIndex.toString() };
  } catch { return null; }
}
async function reconcileEvents(events, { rpcCall, minConfirmations = 12 } = {}) {
  if (!Array.isArray(events) || events.length > 250) throw new TypeError("expected 0-250 observations");
  if (typeof rpcCall !== "function") throw new TypeError("read-only RPC client required");
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1 || minConfirmations > 5000) {
    throw new TypeError("invalid confirmation requirement");
  }
  // Validate chain before interpreting any transaction receipt.
  const chainId = await rpcCall("eth_chainId", []);
  if (chainId !== CHAIN_ID) throw new Error("wrong_rpc_chain");
  const latest = quantity(await rpcCall("eth_blockNumber", []));
  const frequencies = new Map();
  for (const event of events) {
    if (isHash(event?.transaction)) {
      const hash = norm(event.transaction);
      frequencies.set(hash, (frequencies.get(hash) || 0) + 1);
    }
  }
  const output = [];
  for (const event of events) {
    if (!validObservation(event)) {
      output.push(record(event, "invalid_observation")); continue;
    }
    const tx = norm(event.transaction);
    if (frequencies.get(tx) !== 1) {
      output.push(record(event, "duplicate_observation")); continue;
    }
    let receipt;
    try {
      receipt = await rpcCall("eth_getTransactionReceipt", [tx]);
    } catch {
      output.push(record(event, "rpc_unavailable")); continue;
    }
    if (receipt === null) {
      output.push(record(event, "receipt_pending")); continue;
    }
    if (!receipt || !isHash(receipt.transactionHash) ||
        norm(receipt.transactionHash) !== tx ||
        !isHash(receipt.blockHash) || !Array.isArray(receipt.logs)) {
      output.push(record(event, "malformed_receipt")); continue;
    }
    if (receipt.status !== "0x1") {
      output.push(record(event, "transaction_not_successful")); continue;
    }
    let block;
    try { block = quantity(receipt.blockNumber); }
    catch { output.push(record(event, "malformed_receipt")); continue; }
    if (block > latest || latest - block + 1n < BigInt(minConfirmations)) {
      output.push(record(event, "insufficient_confirmations")); continue;
    }
    // Detect any matching payer -> recipient USDC transfer before checking
    // its amount; multiple matches make attribution ambiguous.
    const matches = receipt.logs
      .map(log => relevantTransfer(log, receipt, tx, norm(event.payer)))
      .filter(Boolean);
    if (matches.length !== 1) {
      output.push(record(event, matches.length > 1 ? "ambiguous_transfers" : "transfer_not_found"));
      continue;
    }
    if (matches[0].amount !== BigInt(EXPECTED_AMOUNT)) {
      output.push(record(event, "amount_mismatch")); continue;
    }
    output.push(record(event, "verified_onchain_transfer", {
      onchain_verified: true,
      confirmed_transfer_amount_atomic_usdc: EXPECTED_AMOUNT,
      payer: norm(event.payer),
      receiver: RECEIVER,
      token_contract: USDC,
      block_number: block.toString(),
      transaction_log_index: matches[0].logIndex,
      confirmations_at_check: (latest - block + 1n).toString(),
      evidence_source: "independent_base_rpc_receipt"
    }));
  }
  return {
    schema_version: 1,
    chain: CHAIN,
    block_number_at_check: latest.toString(),
    minimum_confirmations: minConfirmations,
    events: output,
    // An on-chain transfer does not establish customer independence.
    verified_external_buyers: 0,
    eligible_external_revenue_atomic_usdc: "0",
    product_025_unlock_evidence: false
  };
}
function makeRpc(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new TypeError("invalid BASE_RPC_URL"); }
  if (parsed.protocol !== "https:" || !parsed.hostname ||
      parsed.username || parsed.password || parsed.hash) {
    throw new TypeError("BASE_RPC_URL must be a trusted HTTPS endpoint without URL credentials");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new TypeError("invalid RPC timeout");
  }
  let nextId = 0;
  return async (method, params) => {
    if (!["eth_chainId", "eth_blockNumber", "eth_getTransactionReceipt"].includes(method)) {
      throw new TypeError("unsupported read-only RPC method");
    }
    const id = ++nextId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(parsed.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("rpc_http_failure");
      const result = await response.json();
      if (!result || result.jsonrpc !== "2.0" || result.id !== id ||
          result.error || !Object.hasOwn(result, "result")) {
        throw new Error("rpc_invalid_response");
      }
      return result.result;
    } finally {
      clearTimeout(timer);
    }
  };
}
async function main() {
  const inputPath = process.argv[2];
  if (!inputPath || process.argv.length !== 3) {
    throw new Error("usage: BASE_RPC_URL=https://trusted-rpc node reconcile-settlements.js observations.json");
  }
  const stat = fs.statSync(inputPath);
  if (stat.size > 1000000) throw new Error("observation_file_too_large");
  const events = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL required");
  const result = await reconcileEvents(events, { rpcCall: makeRpc(process.env.BASE_RPC_URL) });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (require.main === module) {
  main().catch(error => {
    // Never print sensitive provider URLs or untrusted RPC bodies.
    process.stderr.write("reconciliation failed: " +
      (["wrong_rpc_chain", "invalid_rpc_quantity"].includes(error.message) ?
        error.message : "invalid_input_or_unavailable_rpc") + "\n");
    process.exitCode = 1;
  });
}
module.exports = {
  CHAIN, CHAIN_ID, USDC, RECEIVER, TRANSFER_TOPIC, ROUTE_IDS,
  makeRpc, validObservation, reconcileEvents, relevantTransfer
};
