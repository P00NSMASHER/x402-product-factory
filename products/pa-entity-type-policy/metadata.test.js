"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");
test("catalog uses resource-level accepts at 2000 atomic",()=>{
  const r=catalogResource("https://example.test");assert.equal(r.price,"$0.002");assert.equal(r.accepts[0].amount,"2000");assert.equal(r.accepts[0].network,"eip155:8453");
});
test("OpenAPI documents policy input and failure states",()=>{
  const p=openApiPath().get;assert.equal(p["x-payment-info"].price.amount,"0.002000");assert.deepEqual(p.parameters.map(x=>x.name),["company","allowedKinds"]);assert.ok(p.responses[502]);assert.ok(p.responses[503]);
});
test("agent text contains claim boundary and same-payment retry",()=>{
  const t=llmsText("https://example.test");assert.match(t,/caller-defined policy check only/i);assert.match(t,/same PAYMENT-SIGNATURE/i);
});
