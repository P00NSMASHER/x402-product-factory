"use strict";

const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {NETWORK,USDC,PAY_TO,requirements}=require("../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument
}=require("../products/pa-entity-ofac-review/paid-handler");
const {
  catalogResource,openApiPath,llmsText
}=require("../products/pa-entity-ofac-review/metadata");

function main(){
  const p=registry.products.find(row=>row.id==="pa-entity-ofac-review");
  assert.ok(p,"Product 016 missing from registry");
  assert.equal(p.number,"016");
  assert.equal(p.status,"live-source-verified-staging");
  assert.equal(p.method,"GET");
  assert.equal(p.path,RESOURCE_PATH);
  assert.equal(p.price_usdc,"0.005");

  assert.equal(PRICE,"$0.005");
  assert.equal(AMOUNT_ATOMIC,"5000");
  assert.equal(NETWORK,"eip155:8453");
  assert.equal(USDC.toLowerCase(),"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(PAY_TO.toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");

  const req=requirements(AMOUNT_ATOMIC);
  assert.equal(req.scheme,"exact");
  assert.equal(req.amount,"5000");
  assert.equal(req.payTo,PAY_TO);

  const base="https://candidate.example";
  const doc=productPaymentDocument(base);
  assert.equal(doc.resource.url,base+RESOURCE_PATH);
  assert.equal(doc.accepts[0].amount,"5000");

  const catalog=catalogResource(base);
  assert.ok(Array.isArray(catalog.accepts)&&catalog.accepts.length===1);
  assert.equal(catalog.accepts[0].amount,"5000");
  assert.equal(catalog.accepts[0].payTo,PAY_TO);

  const api=openApiPath().get;
  assert.equal(api.operationId,"reviewPennsylvaniaEntityOfacName");
  assert.deepEqual(api.parameters.map(x=>x.name),["company","minScore"]);
  assert.equal(api["x-payment-info"].price.amount,"0.005000");
  assert.ok(api.responses[502]);
  assert.ok(api.responses[503]);
  assert.match(api.description,/resolved legal name/i);
  assert.match(api.description,/not sanctions clearance/i);

  const text=llmsText(base);
  assert.match(text,/resolves the Pennsylvania legal entity first/i);
  assert.match(text,/50 Percent Rule/i);
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
    resolvedLegalNameScreening:true
  },null,2));
}

main();
