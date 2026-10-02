"use strict";

const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {NETWORK,USDC,PAY_TO,requirements}=require("../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("../products/sec-company-identity-match/paid-handler");
const {catalogResource,openApiPath,llmsText}=require("../products/sec-company-identity-match/metadata");

function main(){
  const p=registry.products.find(row=>row.id==="sec-company-identity-match");
  assert.ok(p,"Product 013 missing from registry");
  assert.equal(p.number,"013");
  assert.equal(p.method,"GET");
  assert.equal(p.path,RESOURCE_PATH);
  assert.equal(p.price_usdc,"0.003");
  assert.equal(PRICE,"$0.003");
  assert.equal(AMOUNT_ATOMIC,"3000");
  assert.equal(NETWORK,"eip155:8453");
  assert.equal(USDC.toLowerCase(),"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(PAY_TO.toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");

  assert.ok(Array.isArray(p.required_env));
  assert.ok(p.required_env.includes("SEC_USER_AGENT"));
  assert.ok(Array.isArray(p.deployment_requirements));
  assert.match(p.deployment_requirements.join(" "),/contact email/i);

  const req=requirements(AMOUNT_ATOMIC);
  assert.equal(req.amount,"3000");
  assert.equal(req.payTo,PAY_TO);

  const base="https://candidate.example";
  const doc=productPaymentDocument(base);
  assert.equal(doc.resource.url,base+RESOURCE_PATH);
  assert.equal(doc.accepts[0].amount,"3000");

  const catalog=catalogResource(base);
  assert.equal(catalog.resource,base+RESOURCE_PATH);
  assert.ok(Array.isArray(catalog.accepts)&&catalog.accepts.length===1);
  assert.equal(catalog.accepts[0].amount,"3000");

  const api=openApiPath().get;
  assert.equal(api.operationId,"matchSecPublicCompanyIdentity");
  assert.equal(api["x-payment-info"].price.amount,"0.003000");
  assert.match(api["x-input-rule"],/exactly one/i);
  assert.ok(api.responses[502]);
  assert.ok(api.responses[503]);

  const llms=llmsText(base);
  assert.match(llms,/SEC_USER_AGENT/);
  assert.match(llms,/contact email/);
  assert.match(llms,/not investment advice/);

  console.log(JSON.stringify({
    ok:true,
    product:p.id,
    status:p.status,
    route:RESOURCE_PATH,
    price:PRICE,
    atomicAmount:AMOUNT_ATOMIC,
    network:NETWORK,
    payTo:PAY_TO,
    requiredEnv:p.required_env,
    catalogResourceAccepts:true
  },null,2));
}
main();
