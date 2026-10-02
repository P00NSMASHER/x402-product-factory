"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 017 catalog has resource-level accepts",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/pa-vendor-new-domain-review");
  assert.equal(r.price,"$0.005");
  assert.equal(r.accepts[0].amount,"5000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI exposes company domain and age threshold",()=>{
  const p=openApiPath().get;
  assert.deepEqual(p.parameters.map(x=>x.name),["company","domain","minDomainAgeDays"]);
  assert.equal(p["x-payment-info"].price.amount,"0.005000");
  assert.ok(p.responses[502]);
  assert.ok(p.responses[503]);
});

test("agent text states resolved-name alignment and fraud boundary",()=>{
  const text=llmsText("https://example.test");
  assert.match(text,/resolves the Pennsylvania legal entity first/i);
  assert.match(text,/not proof of fraud/i);
  assert.match(text,/does not prove ownership or control/i);
  assert.match(text,/same PAYMENT-SIGNATURE/i);
});
