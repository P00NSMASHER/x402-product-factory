"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {catalogResource,openApiPath,llmsText}=require("./metadata");
test("Product 009 catalog has resource-level accepts",()=>{const r=catalogResource("https://example.test");assert.equal(r.price,"$0.002");assert.equal(r.accepts[0].amount,"2000");assert.equal(r.accepts[0].network,"eip155:8453");});
test("OpenAPI exposes company and age threshold",()=>{const p=openApiPath().get;assert.equal(p["x-payment-info"].price.amount,"0.002000");assert.deepEqual(p.parameters.map(x=>x.name),["company","minAgeDays"]);assert.ok(p.responses[502]);assert.ok(p.responses[503]);});
test("agent text states claim boundary",()=>{const text=llmsText("https://example.test");assert.match(text,/identity\/history signal only/i);assert.match(text,/same PAYMENT-SIGNATURE/);});
