"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const realPayment=require("./payment");
const {PRODUCTS}=require("../../generated/spec-metadata");
const {
  createStandardPaidHandler,
  productPaymentDocument
}=require("./standard-paid-handler");

const product=PRODUCTS["pa-business-address-match"];
const signature=realPayment.encodeHeader({x402Version:2,payload:{test:true}});

function paymentDouble({
  verification={kind:"valid",detail:{isValid:true}},
  settlement={kind:"settled",receipt:{success:true,transaction:"0xtest"}},
  onVerify=()=>{},
  onSettle=()=>{}
}={}){
  return {
    ...realPayment,
    async verifyPayment(args){
      onVerify(args);
      return verification;
    },
    async settleSamePayment(args){
      onSettle(args);
      return settlement;
    }
  };
}

function build({
  validateInput=(query)=>query,
  serviceResult={decision:"match",sourceFailures:[],chargeable:true,checkedAt:"2026-10-02T00:00:00.000Z"},
  serviceThrows=false,
  payment=paymentDouble()
}={}){
  let serviceCalls=0;
  const service={
    async check(input){
      serviceCalls+=1;
      if(serviceThrows)throw new Error("source_down");
      return {...serviceResult,input};
    }
  };
  const handler=createStandardPaidHandler({
    product,
    service,
    validateInput,
    publicApiBase:"https://candidate.example",
    fetchImpl:async()=>{throw new Error("unexpected direct fetch");},
    payment
  });
  return {handler,getServiceCalls:()=>serviceCalls};
}

test("standard handler returns spec-driven 402 before validation or source work",async()=>{
  let validateCalls=0;
  const {handler,getServiceCalls}=build({
    validateInput:(query)=>{validateCalls+=1;return query;}
  });
  const response=await handler({query:{company:"Example",address:"1 Main St"}});
  assert.equal(response.statusCode,402);
  assert.equal(validateCalls,0);
  assert.equal(getServiceCalls(),0);
  assert.equal(response.headers["x402-price"],"$0.003");
  const document=JSON.parse(Buffer.from(response.headers["PAYMENT-REQUIRED"],"base64").toString("utf8"));
  assert.equal(document.resource.url,"https://candidate.example/api/pa-business-address-match");
  assert.equal(document.resource.description,product.resource_description);
  assert.equal(document.resource.serviceName,product.service_name);
  assert.deepEqual(document.resource.tags,product.search_tags);
  assert.equal(document.accepts[0].amount,"3000");
  assert.equal(document.accepts[0].network,"eip155:8453");
  assert.equal(document.accepts[0].extra.name,"USD Coin");
});

test("invalid input returns 400 before payment verification",async()=>{
  let verifyCalls=0;
  const payment=paymentDouble({onVerify:()=>{verifyCalls+=1;}});
  const {handler,getServiceCalls}=build({
    payment,
    validateInput:()=>{const error=new Error("bad input");error.code="INVALID_INPUT";throw error;}
  });
  const response=await handler({event:{headers:{"PAYMENT-SIGNATURE":signature}}});
  assert.equal(response.statusCode,400);
  assert.equal(JSON.parse(response.body).error,"invalid_request");
  assert.equal(verifyCalls,0);
  assert.equal(getServiceCalls(),0);
});

test("unresolved verification returns retryable 503 without source work",async()=>{
  const {handler,getServiceCalls}=build({
    payment:paymentDouble({verification:{kind:"unresolved",reason:"payment_verifier_unavailable"}})
  });
  const response=await handler({event:{headers:{"payment-signature":signature}}});
  assert.equal(response.statusCode,503);
  assert.equal(response.headers["Retry-After"],"2");
  assert.equal(JSON.parse(response.body).retrySamePayment,true);
  assert.equal(getServiceCalls(),0);
});

test("terminal verification returns a fresh 402 challenge",async()=>{
  const {handler,getServiceCalls}=build({
    payment:paymentDouble({verification:{kind:"terminal",reason:"invalid_signature"}})
  });
  const response=await handler({event:{headers:{"x-payment":signature}}});
  assert.equal(response.statusCode,402);
  assert.equal(JSON.parse(response.body).error,"invalid_signature");
  assert.equal(getServiceCalls(),0);
});

test("source failure stays non-chargeable and never settles",async()=>{
  let settleCalls=0;
  const payment=paymentDouble({onSettle:()=>{settleCalls+=1;}});
  const {handler}=build({
    payment,
    serviceResult:{
      decision:"human_review",
      sourceFailures:[{source:"pa_registry",detail:"SOURCE_TIMEOUT"}],
      chargeable:false,
      checkedAt:"2026-10-02T00:00:00.000Z"
    }
  });
  const response=await handler({event:{headers:{"payment-signature":signature}}});
  assert.equal(response.statusCode,502);
  assert.equal(JSON.parse(response.body).chargeable,false);
  assert.equal(settleCalls,0);
});

test("thrown source error stays non-chargeable and never settles",async()=>{
  let settleCalls=0;
  const {handler}=build({
    serviceThrows:true,
    payment:paymentDouble({onSettle:()=>{settleCalls+=1;}})
  });
  const response=await handler({event:{headers:{"payment-signature":signature}}});
  assert.equal(response.statusCode,502);
  assert.equal(JSON.parse(response.body).chargeable,false);
  assert.equal(settleCalls,0);
});

test("unresolved settlement returns retry-same-payment 503",async()=>{
  const {handler}=build({
    payment:paymentDouble({settlement:{kind:"unresolved",reason:"settlement_pending"}})
  });
  const response=await handler({event:{headers:{"payment-signature":signature}}});
  assert.equal(response.statusCode,503);
  const body=JSON.parse(response.body);
  assert.equal(body.retrySamePayment,true);
  assert.equal(body.error,"settlement_pending");
});

test("successful settlement returns paid result and receipt headers",async()=>{
  let normalizedSeen=null;
  const {handler,getServiceCalls}=build({
    validateInput:(query)=>({company:String(query.company).trim()}),
    serviceResult:{decision:"match",reasonCodes:[],sourceFailures:[],chargeable:true}
  });
  const original={company:" Example "};
  const response=await handler({query:original,event:{headers:{"PAYMENT-SIGNATURE":signature}}});
  assert.equal(response.statusCode,200);
  assert.equal(response.headers["x402-settled"],"true");
  assert.ok(response.headers["PAYMENT-RESPONSE"]);
  const body=JSON.parse(response.body);
  normalizedSeen=body.input;
  assert.equal(body.paid,true);
  assert.equal(body.price,"$0.003");
  assert.equal(body.decision,"match");
  assert.deepEqual(normalizedSeen,{company:"Example"});
  assert.equal(getServiceCalls(),1);
});

test("generated payment document uses the five-tag searchable spec surface",()=>{
  const document=productPaymentDocument({
    product:PRODUCTS["pa-vendor-identity-match"],
    publicApiBase:"https://candidate.example/"
  });
  assert.equal(document.resource.serviceName,"PA Vendor Identity Match");
  assert.equal(document.resource.tags.length,5);
  assert.deepEqual(document.resource.tags,PRODUCTS["pa-vendor-identity-match"].search_tags);
});
