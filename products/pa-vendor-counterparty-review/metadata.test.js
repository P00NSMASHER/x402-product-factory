"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 018 catalog has resource-level accepts at 10000 atomic",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/pa-vendor-counterparty-review");
  assert.equal(r.price,"$0.010");
  assert.equal(r.accepts[0].amount,"10000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI exposes thresholds and payment/failure states",()=>{
  const p=openApiPath().get;
  assert.equal(p.operationId,"reviewPennsylvaniaVendorCounterparty");
  assert.deepEqual(p.parameters.map(x=>x.name),["company","domain","minScore","minDomainAgeDays"]);
  assert.equal(p["x-payment-info"].price.amount,"0.010000");
  assert.ok(p.responses[502]);assert.ok(p.responses[503]);
  assert.match(p.description,/not legal\/compliance approval/i);
});

test("llms text states legal-name-first flow and claim boundary",()=>{
  const t=llmsText("https://example.test");
  assert.match(t,/resolves the Pennsylvania legal entity first/i);
  assert.match(t,/not sanctions clearance/i);
  assert.match(t,/same PAYMENT-SIGNATURE/i);
});
