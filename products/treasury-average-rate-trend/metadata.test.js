"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 014 catalog has resource-level accepts",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/treasury-average-rate-trend");
  assert.equal(r.price,"$0.003");
  assert.equal(r.accepts[0].amount,"3000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI documents trend inputs and payment",()=>{
  const p=openApiPath().get;
  assert.equal(p["x-payment-info"].price.amount,"0.003000");
  assert.deepEqual(p.parameters.map(x=>x.name),["security","minChangeBps"]);
  assert.ok(p.responses[502]);
  assert.ok(p.responses[503]);
});

test("llms text preserves source and non-advice boundary",()=>{
  const t=llmsText("https://example.test");
  assert.match(t,/Treasury Fiscal Data/);
  assert.match(t,/not a long-term trend determination, live market yield/);
  assert.match(t,/same PAYMENT-SIGNATURE/);
});
