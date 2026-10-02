"use strict";
const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {NETWORK,USDC,PAY_TO,requirements}=require("../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("../products/sec-filing-freshness/paid-handler");
const {catalogResource,openApiPath,llmsText}=require("../products/sec-filing-freshness/metadata");

function main(){
 const p=registry.products.find(row=>row.id==="sec-filing-freshness");
 assert.ok(p);assert.equal(p.number,"006");assert.equal(p.method,"GET");assert.equal(p.path,RESOURCE_PATH);assert.equal(p.price_usdc,"0.005");
 assert.equal(PRICE,"$0.005");assert.equal(AMOUNT_ATOMIC,"5000");assert.equal(NETWORK,"eip155:8453");
 assert.equal(USDC.toLowerCase(),"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
 assert.equal(PAY_TO.toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");
 const req=requirements(AMOUNT_ATOMIC);assert.equal(req.amount,"5000");assert.equal(req.payTo,PAY_TO);
 const base="https://candidate.example";
 const doc=productPaymentDocument(base);assert.equal(doc.resource.url,base+RESOURCE_PATH);
 const catalog=catalogResource(base);assert.ok(Array.isArray(catalog.accepts));assert.equal(catalog.accepts[0].amount,"5000");
 const api=openApiPath().get;assert.equal(api["x-payment-info"].price.amount,"0.005000");assert.equal(api["x-input-rule"],"Provide exactly one of ticker or cik.");assert.ok(api.responses[502]);assert.ok(api.responses[503]);
 const llms=llmsText(base);assert.match(llms,/not investment advice/);assert.match(llms,/same PAYMENT-SIGNATURE/);
 console.log(JSON.stringify({ok:true,product:p.id,status:p.status,route:RESOURCE_PATH,price:PRICE,atomicAmount:AMOUNT_ATOMIC,network:NETWORK,payTo:PAY_TO,catalogResourceAccepts:true,liveSecSmoke:p.live_source_status},null,2));
}
main();
