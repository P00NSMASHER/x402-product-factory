"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");

test("Product 013 catalog has resource-level accepts",()=>{
  const r=catalogResource("https://example.test");
  assert.equal(r.resource,"https://example.test/api/sec-company-identity-match");
  assert.equal(r.price,"$0.003");
  assert.equal(r.accepts[0].amount,"3000");
  assert.equal(r.accepts[0].network,"eip155:8453");
});

test("OpenAPI requires company and exactly-one identifier rule",()=>{
  const p=openApiPath().get;
  assert.equal(p["x-payment-info"].price.amount,"0.003000");
  assert.match(p["x-input-rule"],/exactly one/i);
  assert.ok(p.responses[502]);
  assert.ok(p.responses[503]);
});

test("llms text preserves SEC contact and claim boundaries",()=>{
  const t=llmsText("https://example.test");
  assert.match(t,/SEC_USER_AGENT/);
  assert.match(t,/contact email/);
  assert.match(t,/not investment advice/);
  assert.match(t,/same PAYMENT-SIGNATURE/);
});
