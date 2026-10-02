"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NETWORK,
  USDC,
  PAY_TO,
  MAX_PAYMENT_HEADER_LENGTH,
  encodeHeader,
  decodePayment,
  requirements,
  paymentDocument,
  paymentRequiredResponse,
  verifyPayment,
  settleSamePayment,
} = require("./payment");

function response(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

test("requirements are exact Base USDC to the proven seller wallet", () => {
  const r=requirements("5000");
  assert.equal(r.scheme,"exact");
  assert.equal(r.network,NETWORK);
  assert.equal(r.asset,USDC);
  assert.equal(r.payTo,PAY_TO);
  assert.equal(r.amount,"5000");
  assert.deepEqual(r.extra,{name:"USD Coin",version:"2"});
});

test("payment header round-trips a v2 payload", () => {
  const payload={x402Version:2,payload:{test:true}};
  assert.deepEqual(decodePayment(encodeHeader(payload)),payload);
});

test("oversized payment header is rejected", () => {
  assert.throws(
    ()=>decodePayment("a".repeat(MAX_PAYMENT_HEADER_LENGTH+1)),
    /payment_header_too_large/
  );
});

test("wrong x402 version is rejected", () => {
  const encoded=encodeHeader({x402Version:1});
  assert.throws(()=>decodePayment(encoded),/invalid_payment_payload/);
});

test("payment-required response advertises exact resource terms", () => {
  const doc=paymentDocument({
    resourceUrl:"https://example.test/api/check",
    amountAtomic:"5000",
    description:"Check something",
    serviceName:"Example",
    tags:["verification"]
  });
  const res=paymentRequiredResponse({document:doc,price:"$0.005"});
  const body=JSON.parse(res.body);
  assert.equal(res.statusCode,402);
  assert.equal(body.accepts[0].amount,"5000");
  assert.equal(body.network,NETWORK);
  assert.equal(body.payTo,PAY_TO);
  assert.equal(res.headers["x402-price"],"$0.005");
});

test("verification distinguishes valid, terminal, and unresolved", async () => {
  const req=requirements("5000");
  const paymentPayload={x402Version:2};

  const valid=await verifyPayment({
    paymentPayload,paymentRequirements:req,
    fetchImpl:async()=>response({isValid:true})
  });
  assert.equal(valid.kind,"valid");

  const terminal=await verifyPayment({
    paymentPayload,paymentRequirements:req,
    fetchImpl:async()=>response({isValid:false,invalidReason:"bad_signature"},400)
  });
  assert.deepEqual(terminal,{kind:"terminal",reason:"bad_signature"});

  const unresolved=await verifyPayment({
    paymentPayload,paymentRequirements:req,
    fetchImpl:async()=>{throw new Error("network");}
  });
  assert.equal(unresolved.kind,"unresolved");
});

test("settlement retries pending state and returns receipt", async () => {
  const replies=[
    response({success:false,errorReason:"settlement_pending"},202),
    response({success:true,transaction:"0xabc"},200)
  ];
  let calls=0;
  const result=await settleSamePayment({
    paymentPayload:{x402Version:2},
    paymentRequirements:requirements("5000"),
    fetchImpl:async()=>replies[calls++],
    sleepImpl:async()=>{}
  });
  assert.equal(calls,2);
  assert.equal(result.kind,"settled");
  assert.equal(result.receipt.transaction,"0xabc");
});

test("terminal settlement error does not retry", async () => {
  let calls=0;
  const result=await settleSamePayment({
    paymentPayload:{x402Version:2},
    paymentRequirements:requirements("5000"),
    fetchImpl:async()=>{calls++;return response({success:false,errorReason:"insufficient_funds"},400);},
    sleepImpl:async()=>{}
  });
  assert.equal(calls,1);
  assert.deepEqual(result,{kind:"terminal",reason:"insufficient_funds"});
});
