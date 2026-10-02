"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 015 catalog has resource-level accepts",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/treasury-average-rate-spread");
  assert.equal(r.price,"$0.003");
  assert.equal(r.accepts[0].amount,"3000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI exposes both categories and tolerance",()=>{
  const p=openApiPath().get;
  assert.deepEqual(p.parameters.map(x=>x.name),["leftSecurity","rightSecurity","toleranceBps"]);
  assert.equal(p["x-payment-info"].price.amount,"0.003000");
  assert.ok(p.responses[502]);
  assert.ok(p.responses[503]);
});

test("llms text states same-month and market-yield limitation",()=>{
  const text=llmsText("https://example.test");
  assert.match(text,/same latest monthly record date/i);
  assert.match(text,/not a live market yield spread/i);
  assert.match(text,/same PAYMENT-SIGNATURE/i);
});
