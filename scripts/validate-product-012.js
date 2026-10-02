"use strict";
const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {NETWORK,USDC,PAY_TO,requirements}=require("../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("../products/domain-last-changed-recency/paid-handler");
const {catalogResource,openApiPath,llmsText}=require("../products/domain-last-changed-recency/metadata");
const {assessDomainLastChanged}=require("../products/domain-last-changed-recency/decision");

function main(){
  const p=registry.products.find(row=>row.id==="domain-last-changed-recency");
  assert.ok(p,"Product 012 missing");
  assert.equal(p.number,"012");
  assert.equal(p.status,"live-source-verified-staging");
  assert.equal(p.method,"GET");
  assert.equal(p.path,RESOURCE_PATH);
  assert.equal(p.price_usdc,"0.002");

  assert.equal(PRICE,"$0.002");
  assert.equal(AMOUNT_ATOMIC,"2000");
  assert.equal(NETWORK,"eip155:8453");
  assert.equal(USDC.toLowerCase(),"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(PAY_TO.toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");

  const req=requirements(AMOUNT_ATOMIC);
  assert.equal(req.scheme,"exact");
  assert.equal(req.amount,"2000");
  assert.equal(req.payTo,PAY_TO);

  const base="https://candidate.example";
  const doc=productPaymentDocument(base);
  assert.equal(doc.resource.url,base+RESOURCE_PATH);
  assert.equal(doc.accepts[0].amount,"2000");

  const catalog=catalogResource(base);
  assert.equal(catalog.accepts[0].amount,"2000");
  assert.equal(catalog.accepts[0].payTo,PAY_TO);

  const api=openApiPath().get;
  assert.equal(api.operationId,"checkDomainLastChangedRecency");
  assert.equal(api["x-payment-info"].price.amount,"0.002000");
  assert.ok(api.responses[502]);
  assert.ok(api.responses[503]);

  const text=llmsText(base);
  assert.match(text,/not by itself evidence of compromise/i);
  assert.match(text,/same PAYMENT-SIGNATURE/i);

  const databaseOnly=assessDomainLastChanged(
    {available:true,registered:true,events:{lastUpdateOfRdapDatabase:"2026-10-02T12:00:00Z"}},
    {maxAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(databaseOnly.decision,"human_review");
  assert.ok(databaseOnly.reasonCodes.includes("LAST_CHANGED_DATE_UNAVAILABLE"));

  console.log(JSON.stringify({
    ok:true,
    product:p.id,
    status:p.status,
    route:RESOURCE_PATH,
    price:PRICE,
    atomicAmount:AMOUNT_ATOMIC,
    network:NETWORK,
    payTo:PAY_TO,
    catalogResourceAccepts:true,
    trueLastChangedOnly:true
  },null,2));
}
main();
