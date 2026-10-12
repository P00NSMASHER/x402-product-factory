"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSpecs}=require("../scripts/generate-spec-artifacts");
const {PAID_HANDLER_MODULES:HAND}=require("../generated/product-modules");
const {PAID_HANDLER_MODULES:GENERATED}=require("../generated/spec-paid-handlers");
const {encodeHeader}=require("../packages/x402/payment");
const {casesFor,coverage,serialize,execute}=require("./adversarial-contracts");

const specs=loadSpecs();
const SIGNATURE=encodeHeader({x402Version:2,payload:{signed:true}});
const BASE="https://candidate.example";

function factory(exports,productId){
  const named=Object.entries(exports||{}).filter(([name,value])=>
    typeof value==="function"&&/^createPaid.*Handler$/.test(name));
  assert.equal(named.length,1,productId+" must have exactly one paid handler");
  return named[0][1];
}
async function runOne(product,implementation,attack){
  let sourceCalls=0,networkCalls=0;
  const f=factory(implementation==="generated"?GENERATED[product.id]:HAND[product.id],product.id);
  const handler=f({
    service:{async check(){sourceCalls++;throw new Error("source must not run");}},
    publicApiBase:BASE,
    fetchImpl:async()=>{networkCalls++;throw new Error("facilitator must not run");}
  });
  const response=await handler({
    query:attack.query,
    event:{headers:{"payment-signature":SIGNATURE}}
  });
  return {status:response.statusCode,sourceCalls,networkCalls,
    body:response.body===undefined?null:JSON.parse(response.body)};
}
test("hostile query mutation coverage spans all 22 products",()=>{
  const report=coverage(specs);
  assert.equal(report.products_reviewed,22);
  assert.ok(report.hostile_queries_per_implementation>=90);
  assert.ok(report.products.every(p=>p.hostile_case_count>=3));
  assert.equal(report.real_upstream_requests_permitted,false);
  assert.equal(report.real_payment_submission_permitted,false);
  assert.equal(serialize(specs),serialize([...specs].reverse()));
  assert.doesNotThrow(()=>execute("check",serialize(specs)));
  assert.throws(()=>execute("check",serialize(specs)+"corruption"),/stale generated hostile query coverage/);
});
for(const product of specs){
  test(product.number+" "+product.id+" hostile input must never verify, read sources or settle",async()=>{
    const variants=casesFor(product);
    assert.ok(variants.length>=3);
    for(const variant of variants){
      const hand=await runOne(product,"hand",variant);
      const generated=await runOne(product,"generated",variant);
      assert.equal(hand.status,400,product.id+" hand "+variant.kind+" "+variant.field);
      assert.equal(generated.status,400,product.id+" generated "+variant.kind+" "+variant.field);
      assert.equal(hand.networkCalls,0,product.id+" hand early verification");
      assert.equal(generated.networkCalls,0,product.id+" generated early verification");
      assert.equal(hand.sourceCalls,0,product.id+" hand source on invalid request");
      assert.equal(generated.sourceCalls,0,product.id+" generated source on invalid request");
      assert.equal(hand.body?.error,"invalid_request");
      assert.equal(generated.body?.error,"invalid_request");
      assert.deepEqual(generated.body,hand.body,product.id+" invalid-input response parity "+variant.kind+" "+variant.field);
    }
  });
}
test("an injected Product 025 cannot enter the hostile test matrix",()=>{
  const cloned=structuredClone(specs);
  cloned[0].number="025";
  assert.throws(()=>coverage(cloned),/missing product/);
});
