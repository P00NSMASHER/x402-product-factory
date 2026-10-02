"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 006 catalog has resource-level accepts",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/sec-filing-freshness");
  assert.equal(r.price,"$0.005");
  assert.equal(r.accepts[0].amount,"5000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI documents ticker/cik rule, freshness window, and payment",()=>{
  const p=openApiPath().get;
  assert.equal(p["x-input-rule"],"Provide exactly one of ticker or cik.");
  assert.equal(p["x-payment-info"].price.amount,"0.005000");
  assert.ok(p.parameters.some(x=>x.name==="maxAgeDays"));
  assert.ok(p.responses[502]);
  assert.ok(p.responses[503]);
});

test("llms text states SEC source and no investment advice",()=>{
  const text=llmsText("https://example.test");
  assert.match(text,/SEC EDGAR/);
  assert.match(text,/not investment advice/);
  assert.match(text,/same PAYMENT-SIGNATURE/);
});
