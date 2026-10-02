"use strict";
const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {NETWORK,USDC,PAY_TO,requirements}=require("../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("../products/pa-business-formation-age/paid-handler");
const {catalogResource,openApiPath,llmsText}=require("../products/pa-business-formation-age/metadata");
function main(){
 const p=registry.products.find(x=>x.id==="pa-business-formation-age");
 assert.ok(p);assert.equal(p.number,"010");assert.equal(p.status,"live-source-verified-staging");assert.equal(p.path,RESOURCE_PATH);assert.equal(p.price_usdc,"0.002");
 assert.equal(PRICE,"$0.002");assert.equal(AMOUNT_ATOMIC,"2000");assert.equal(NETWORK,"eip155:8453");
 assert.equal(USDC.toLowerCase(),"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
 assert.equal(PAY_TO.toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");
 const req=requirements(AMOUNT_ATOMIC);assert.equal(req.amount,"2000");assert.equal(req.payTo,PAY_TO);
 const base="https://candidate.example";
 const doc=productPaymentDocument(base);assert.equal(doc.resource.url,base+RESOURCE_PATH);
 const cat=catalogResource(base);assert.equal(cat.accepts[0].amount,"2000");assert.equal(cat.accepts[0].payTo,PAY_TO);
 const api=openApiPath().get;assert.equal(api["x-payment-info"].price.amount,"0.002000");assert.ok(api.responses[502]);assert.ok(api.responses[503]);assert.match(api.description,/does not establish current good standing/i);
 const text=llmsText(base);assert.match(text,/identity\/history signal only/i);assert.match(text,/same PAYMENT-SIGNATURE/i);
 console.log(JSON.stringify({ok:true,product:p.id,status:p.status,route:RESOURCE_PATH,price:PRICE,atomicAmount:AMOUNT_ATOMIC,network:NETWORK,payTo:PAY_TO,catalogResourceAccepts:true},null,2));
}
main();
