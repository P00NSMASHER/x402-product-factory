"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 020 catalog has resource-level 6000 atomic accepts",()=>{
  const r=catalogResource("https://example.test/");
  assert.equal(r.resource,"https://example.test/api/pa-vendor-domain-continuity-review");
  assert.equal(r.price,"$0.006");assert.equal(r.accepts[0].amount,"6000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI exposes expiration and stability thresholds",()=>{
  const p=openApiPath().get;
  assert.equal(p.operationId,"reviewPennsylvaniaVendorDomainContinuity");
  assert.deepEqual(p.parameters.map(x=>x.name),["company","domain","minExpirationDays","minStableDays"]);
  assert.equal(p["x-payment-info"].price.amount,"0.006000");
  assert.ok(p.responses[502]);assert.ok(p.responses[503]);
});

test("agent text states continuity-only boundary",()=>{
  const t=llmsText("https://example.test");
  assert.match(t,/continuity\/timing workflow signal only/i);
  assert.match(t,/does not prove ownership/i);
  assert.match(t,/same PAYMENT-SIGNATURE/i);
});
