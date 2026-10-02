"use strict";

const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {NETWORK,USDC,PAY_TO,requirements}=require("../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument
}=require("../products/pa-vendor-domain-continuity-review/paid-handler");
const {
  catalogResource,openApiPath,llmsText
}=require("../products/pa-vendor-domain-continuity-review/metadata");

function main(){
  const p=registry.products.find(row=>row.id==="pa-vendor-domain-continuity-review");
  assert.ok(p,"Product 020 missing from registry");
  assert.equal(p.number,"020");
  assert.equal(p.status,"live-source-verified-staging");
  assert.equal(p.method,"GET");
  assert.equal(p.path,RESOURCE_PATH);
  assert.equal(p.price_usdc,"0.006");

  assert.equal(PRICE,"$0.006");
  assert.equal(AMOUNT_ATOMIC,"6000");
  assert.equal(NETWORK,"eip155:8453");
  assert.equal(USDC.toLowerCase(),"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(PAY_TO.toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");

  const req=requirements(AMOUNT_ATOMIC);
  assert.equal(req.scheme,"exact");
  assert.equal(req.amount,"6000");
  assert.equal(req.payTo,PAY_TO);

  const base="https://candidate.example";
  const doc=productPaymentDocument(base);
  assert.equal(doc.resource.url,base+RESOURCE_PATH);
  assert.equal(doc.accepts[0].amount,"6000");

  const catalog=catalogResource(base);
  assert.ok(Array.isArray(catalog.accepts)&&catalog.accepts.length===1);
  assert.equal(catalog.accepts[0].amount,"6000");
  assert.equal(catalog.accepts[0].payTo,PAY_TO);

  const api=openApiPath().get;
  assert.equal(api.operationId,"reviewPennsylvaniaVendorDomainContinuity");
  assert.deepEqual(api.parameters.map(x=>x.name),["company","domain","minExpirationDays","minStableDays"]);
  assert.equal(api["x-payment-info"].price.amount,"0.006000");
  assert.ok(api.responses[502]);
  assert.ok(api.responses[503]);
  assert.match(api.description,/continuity\/timing workflow signal only/i);

  const text=llmsText(base);
  assert.match(text,/checks expiration runway/i);
  assert.match(text,/does not prove ownership/i);
  assert.match(text,/same PAYMENT-SIGNATURE/i);

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
    expirationRunwayReview:true,
    lastChangedStabilityReview:true,
    decisionValues:p.decision_values
  },null,2));
}

main();
