"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 019 catalog has resource-level 7000 atomic accepts",()=>{
  const r=catalogResource("https://example.test/");
  assert.equal(r.resource,"https://example.test/api/pa-vendor-maturity-review");
  assert.equal(r.price,"$0.007");assert.equal(r.accepts[0].amount,"7000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI exposes both maturity thresholds",()=>{
  const p=openApiPath().get;
  assert.equal(p.operationId,"reviewPennsylvaniaVendorMaturity");
  assert.deepEqual(p.parameters.map(x=>x.name),["company","domain","minEntityAgeDays","minDomainAgeDays"]);
  assert.equal(p["x-payment-info"].price.amount,"0.007000");
  assert.ok(p.responses[502]);assert.ok(p.responses[503]);
});

test("agent text states maturity-only boundary",()=>{
  const t=llmsText("https://example.test");
  assert.match(t,/maturity\/history workflow signal only/i);
  assert.match(t,/not proof of legitimacy/i);
  assert.match(t,/same PAYMENT-SIGNATURE/i);
});
