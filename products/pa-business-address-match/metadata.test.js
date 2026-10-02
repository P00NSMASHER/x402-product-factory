"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {catalogResource,openApiPath}=require("./metadata");
test("Product 004 catalog has resource-level accepts",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/pa-business-address-match");
  assert.equal(r.price,"$0.003");
  assert.equal(r.accepts[0].amount,"3000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});
test("Product 004 OpenAPI documents payment and failure states",()=>{
  const p=openApiPath().get;
  assert.equal(p["x-payment-info"].price.amount,"0.003000");
  assert.ok(p.responses[502]);
  assert.ok(p.responses[503]);
});
